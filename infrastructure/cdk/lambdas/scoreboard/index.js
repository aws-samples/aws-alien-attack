// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
'use strict';

import { DynamoDBClient  } from "@aws-sdk/client-dynamodb"; 
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"; 

const DDBClient = new DynamoDBClient();
const DynamoDB = DynamoDBDocumentClient.from(DDBClient);
const SSM = new SSMClient();
const SQS = new SQSClient();

const scoreboardSortingFunction = function(playerA, playerB) {
    let result = null;
    if (playerB.Score != playerA.Score) result = playerB.Score - playerA.Score; // order per score descending
    else if (playerA.Lives != playerB.Lives) result = playerB.Lives - playerA.Lives; // order per lives descending
    else if (playerA.Shots != playerB.Shots) result = playerA.Shots - playerB.Shots; // order per shots ascending
    else result = ((playerA.Nickname > playerB.Nickname) ? 1 : -1); // deuce: order per nickname ascending
    return result;
};

const reportInvalidRecordToDLQ = async function(record) {
    console.log('reportInvalidRecordToDLQ');
    console.log(record);
    var sqsParameter = {
        //"QueueUrl" : "https://sqs.<region>.amazonaws.com/<account>/<envName>_DLQ",
        "QueueUrl" : process.env.DLQ_URL,
        "MessageBody" : JSON.stringify(record)
    };
    let sqsResult = await SQS.sendMessage(sqsParameter);
    console.log('sqsResult');
    console.log(sqsResult);
};

const readSessionParameter = async function(callback) {
    let result = null;
    // parameter name is in the form '/<application_name>/session
    let sessionParameter = process.env.SESSION_PARAMETER;
    let getParameterCommand = new GetParameterCommand({"Name" : sessionParameter });
    let ssmResponse = await SSM.send(getParameterCommand);
    console.log('ssmResponse');
    console.log(ssmResponse);
    try {
        result = JSON.parse(ssmResponse.Parameter.Value);
    } catch (exception) {
        console.log(exception);
        result=exception;
    }
    return result;
};

const writeSessionData = async function(sessionData) {
    let sessionTableName = process.env.SESSION_TABLENAME;
    var putParams = {
        "TableName" : sessionTableName,
        "Item" : sessionData,
    };
    console.log('putParams');
    console.log(putParams);
    let putCommand = new PutCommand(putParams);
    let result = await DynamoDB.send(putCommand);
    console.log('writeSessionData result');
    console.log(result);
};


const deallocateUsers = async function (zeroeds, sessionId) {
    let result = null;
    if (!zeroeds) result = "Nothing to do";
    else {
        let sessionControlTable = process.env.SESSION_CONTROL_TABLENAME;
        let readSessionControlParam = {
            "TableName": sessionControlTable,
            "Key": { "SessionId": sessionId }
        };
        let getCommand = new GetCommand(readSessionControlParam);
        let getData = await DynamoDB.send(getCommand);
        let sessionControl = getData.Item;
        // update PlayingGamers state
        sessionControl.PlayingGamers = sessionControl.PlayingGamers.filter(
            (gamer) => { 
                return "undefined" == typeof(zeroeds.find( (zeroedRecord) => { return gamer == zeroedRecord.Nickname } ));
            }
        );
        // update FinishedGamers state - Implemented in a way to prevent deallocation failures
        // (1) find those who are not in the list of already finished gamers
        let zeroedToBeAdded = zeroeds.filter(
            (zeroedRecord) => { 
                return "undefined" == typeof(sessionControl.FinishedGamers.find( (nickname) => { return nickname == zeroedRecord.Nickname } ));
            }
        );
        // (2) Add them to the list of finished gamers
        sessionControl.FinishedGamers = sessionControl.FinishedGamers.concat( zeroedToBeAdded.map( (zeroedRecord) => { return zeroedRecord.Nickname } ) );
        let newNumberOfOccupiedSeats = sessionControl.PlayingGamers.length;
        let params = {
            "TableName": sessionControlTable,
            "Key": { "SessionId": sessionControl.SessionId },
            "UpdateExpression": "SET OccupiedSeats = :n, PlayingGamers = :p, FinishedGamers = :f",
            "ConditionExpression": "OccupiedSeats = :o",
            'ExpressionAttributeValues': {
                ":n": newNumberOfOccupiedSeats,
                ":p": sessionControl.PlayingGamers,
                ":o": sessionControl.OccupiedSeats,
                ":f": sessionControl.FinishedGamers
            }
        };
        let updateCommand = new UpdateCommand(params);
        let updateCommandResponse = await DynamoDB.send(updateCommand);
        console.log('updateCommandResponse');
        console.log(updateCommandResponse)
        result = "Success deallocating "+ zeroeds.length +" users.";
    }
    return result;
};

const updateTopxTable = function(sessionData,callback) {
    let topXValueStr = process.env.TopXValue;
    let topXValue = null;
    if (topXValueStr) {
        try {
            topXValue = Number(topXValueStr);
            if (topXValue==0) topXValue=3;
        } catch(e) {
            // if topX not specified, we stick to Top 3
            topXValue = 3;
        }
    } else topXValue = 3;
    let topxPlayers = sessionData.Scoreboard.slice(0,topXValue);

    let param = {
        "TableName" : process.env.SESSION_TOPX_TABLENAME,
        "Item" : {
            "SessionId" : sessionData.SessionId,
            "TopX" : topxPlayers
        }
    };
    DynamoDB.put(param,callback);
};

const readSessionData = function(sessionId,callback) {
    var getParams = {
        "TableName" : process.env.SESSION_TABLENAME,
         "Key" : { "SessionId" : sessionId },
         "ConsistentRead" : true
    };
    DynamoDB.get(getParams, function(err, data) {
        if (err) {
            var errorDetails = {
                "Error" : err,
                "ParametersToDynamoDB" : getParams,
                "ResponseFromDynamoDB" : data,
            };
            callback(new Error("Error reading sessionData",errorDetails));
        }
        else {
            callback(null,data.Item);
        }
    });
};

const preProcessRecords = function(sessionInfo,kinesisRecords) {
    var result = { FailedRecords : [] , WrongSessionRecords : [], AfterSessionClosingRecords : [], ReadyToProcessRecords : [] };
    kinesisRecords.forEach( (kinesisRecord) => {
        try {
            var record = JSON.parse(new Buffer(kinesisRecord.kinesis.data, 'base64').toString('ascii'));
            if (record.SessionId != sessionInfo.SessionId) result.WrongSessionRecords.push(record);
            else if (record.Timestamp > sessionInfo.ClosingTime) result.AfterSessionClosingRecords.push(record);
            else result.ReadyToProcessRecords.push(record);
        } catch(e) {
            result.FailedRecords.push(new Buffer(kinesisRecord.kinesis.data, 'base64').toString('ascii'));
        } 
    });
    return result;
};

const processKinesisRecords =  async function(kinesisRecords) {
    var sessionData = null;
    // Read session from Systems Manager
	let sessionInfo = await readSessionParameter();
	console.log(sessionInfo);
	console.log('sessionInfo');
	if (sessionInfo instanceof Error) {
	    result = sessionInfo;
	} 
	else {
        let preprocessedRecords = preProcessRecords(sessionInfo,kinesisRecords);
	    console.log('# of READY TO PROCESS records:',preprocessedRecords.ReadyToProcessRecords.length);
        console.log('# of FAILED records:',preprocessedRecords.FailedRecords.length);
        preprocessedRecords.FailedRecords.forEach( (r) => {
           reportInvalidRecordToDLQ(r); 
        });
        console.log('# of WRONG SESSION records:',preprocessedRecords.WrongSessionRecords.length);
        preprocessedRecords.WrongSessionRecords.forEach( (r) => {
           reportInvalidRecordToDLQ(r); 
        });
            console.log('# of AFTER SESSION CLOSING (discarded) records:',preprocessedRecords.AfterSessionClosingRecords.length);
            if (preprocessedRecords.ReadyToProcessRecords.length == 0) callback(null,sessionInfo);
		    else {
		        // read table <envName>Session from DynamoDB
    			readSessionData(sessionInfo.SessionId, function(rsdError, rsdData) {
        			if (rsdError) callback(new Error("Error reading session data."),rsdError);
        			else {
        			   if (!rsdData)
        				   // session does not exists on DynamoDB
        				   sessionData = sessionInfo; // sessionInfo is the data originally retrieved from SystemsManager
           			   else
           			       // session exists on DynamoDB
           			       sessionData = rsdData;
        			}
        			// Here we have sessionData read from DynamoDB, if available. Otherwise, it's the info from SystemsManager
        			var scoreboard = null;
        			if (sessionData.Scoreboard) scoreboard = sessionData.Scoreboard;
        			else scoreboard = [];
                    var successfullyProcessedRecords = 0;
                    var zeroedGamers = [];
                    preprocessedRecords.ReadyToProcessRecords.forEach( function(record) {
                        var gamerIdx = scoreboard.findIndex ( (e) => {return e.Nickname == record.Nickname} );
                        delete record.SessionId;
                        if (gamerIdx==-1) {
                            scoreboard.push(record);
                        }
                        else {
                            scoreboard.splice(gamerIdx,1,record);
                        }
                        if (record.Lives == 0) {
                            let idxz = zeroedGamers.findIndex( (g) => { return g.Nickname == record.Nickname });
                            if (idxz == -1) zeroedGamers.push(record);
                        }
                        successfullyProcessedRecords+=1;
                    });
                    console.log('# of ZEROED GAMERS:',zeroedGamers.length);
                    if (zeroedGamers.length > 0) 
                        deallocateUsers(zeroedGamers,sessionInfo.SessionId,(err,data) => {
                            if (err) console.log(err);
                            else console.log(data);
                        });
                    console.log('# of SUCCESSFULLY PROCESSED:',successfullyProcessedRecords);
                    if (successfullyProcessedRecords==0) callback(null,sessionData);
                    else {
                        scoreboard.sort(scoreboardSortingFunction);
                        sessionData.Scoreboard = scoreboard;
                        // if we had any kind of update, let's store it on DynamoDB
                        updateTopxTable(sessionData, function(err) {
                            if (err) {
                                console.log("ERROR updating TopXTable.");
                                console.log(err);
                            } 
                            else console.log("SUCCESS updating TopXTable");
                            writeSessionData(sessionData, function(wsdErr,wsdData) {
                                if (wsdErr) callback(new Error("Error saving updated session data,"),wsdErr);
                                else callback(null,sessionData);
                            });
                        });
                    } 
    			});
			}
		}
	});
};

export const handler = async (event,context) => {
    console.log('START TIME:',new Date());
    console.log("# of records RECEIVED:",event.Records.length);
    console.log(JSON.stringify(event));
    let response = null;
    if (event.Records) {
        /*
        If event.Records exists, then the request is coming from Kinesis-Lambda integration
        */
        let kinesisResult = await processKinesisRecords(event.Records);
        console.log('kinesisResult');
        console.log(kinesisResult);
        if (kinesisResult instanceof Error) 
            response = {
                statusCode: 500,
                body: JSON.stringify({
                    "Error" : kinesisResult.message,
                    "Details" : kinesisResult
                })
            };
        else 
            response = {
                statusCode: 200,
                body: JSON.stringify(kinesisResult)
            };
    } else {
        let error = new Error("Invalid integration");
        response = {
            statusCode: 400,
            body: JSON.stringify(error)
        };
    }
    console.log('response');
    console.log(response);
    console.log('END TIME:',new Date());
    return response;
};