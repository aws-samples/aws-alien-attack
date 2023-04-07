// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
'use strict';

const {
          DynamoDBDocument
      } = require("@aws-sdk/lib-dynamodb"),
      {
          DynamoDBClient
      } = require("@aws-sdk/client-dynamodb"),
      {
          SSMClient
      } = require("@aws-sdk/client-ssm");
const DynamoDB = DynamoDBDocument.from(new DynamoDBClient());
const SSM = new SSMClient();

const readSessionFromSSM = function (callback) {
    let param = {
        "Name": process.env.SESSION_PARAMETER
    };
    SSM.getParameter(param,
        function (err, sessionParamResponse) {
            if (err) {
                console.log("Error reading from SSM");
                console.log(err);
                callback(new Error("Internal error reading SSM"),500);
            } else {
                let sessionData = null;
                try {
                    sessionData = JSON.parse(sessionParamResponse.Parameter.Value);
                    callback(null, sessionData);
                } catch (error) {
                    console.log("ERROR parsing sessionData.");
                    console.log(sessionData);
                    callback(new Error("Error with session configuration."), 500);
                }
            }
        });
};

const readSessionControlFromDynamoDB = function (session, callback) {
    let getParams = {
        "TableName": process.env.SESSION_CONTROL_TABLENAME,
        "Key": { "SessionId": session },
        "ConsistentRead": true
    };
    DynamoDB.get(getParams, function (err, data) {
        if (err) {
            let errorDetails = {
                "Error": err,
                "ParametersToDynamoDB": getParams,
                "ResponseFromDynamoDB": data,
            };
            console.log(errorDetails);
            callback(new Error("Error reading sessionData from database."), 500);
        }
        else {
            console.log("Success in readSessionControlFromDynamoDB");
            console.log(data);
            callback(null, data.Item);
        }
    });
};

const deallocateGamer = function(gamerUsername,callback) {
    readSessionFromSSM( (ssmErr,session) => {
        if (ssmErr) callback(ssmErr,null);
        else {
            readSessionControlFromDynamoDB(session.SessionId, (scErr, sessionControl) => {
                if (scErr) callback(scErr);
                else {
                    let playingIdx = sessionControl.PlayingGamers.findIndex((e) => { return e == gamerUsername });
                    if (playingIdx == -1) {
                        let message = "User "+gamerUsername+" not found in the list of playing gamers. Discarded.";
                        callback(null,message);
                    } 
                    else {
                        sessionControl.PlayingGamers.splice(playingIdx,1);
                        // This control is to prevent side effects of crashes
                        let finishedIdx = sessionControl.FinishedGamers.findIndex((e) => { return e == gamerUsername });
                        if (finishedIdx!=-1) sessionControl.FinishedGamers.push(gamerUsername);
                        let newNumberOfOccupiedSeats = sessionControl.OccupiedSeats - 1;
                        let tableName = process.env.SESSION_CONTROL_TABLENAME;
                        let params = {
                            "TableName": tableName,
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
                        DynamoDB.update(params, function (err, data) {
                            if (err) {
                                let message = "Error executing DynamoDB.Update";
                                callback(new Error(message),422);
                            }
                            else {
                                callback(null, "Success deallocating " + gamerUsername);
                            }
                        });                    
                    }
                }
            });
        }
    });
};


exports.handler = (event, context, callback) => {
    console.log('START TIME:', new Date());
    console.log(event);
    let response = null;
    let input = null;
    try {
        input = JSON.parse(event.body);
        console.log('Converted body');
        console.log(input);
    }
    catch(conversionError) {
        console.log("Input conversion error.");
        response = {
            statusCode: 400,
            isBase64Encoded : false,
                    headers : {
                        "X-Amzn-ErrorType":"Error",
                        "Access-Control-Allow-Origin":"*",
                        "Access-Control-Allow-Methods":"POST,OPTIONS",
                        "Access-Control-Allow-Headers":"Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                        "Content-Type":"application/json"
                    },
            body: JSON.stringify({
                "errorMessage": "Invalid request.",
            })
        };
        callback(null,response);
    }
    if (!input || !input.Username || typeof input.Username!="string" || input.Username.trim()=="") {
        console.log("Invalid event");
        response = {
            statusCode: 400,
            isBase64Encoded : false,
                    headers : {
                        "X-Amzn-ErrorType":"Error",
                        "Access-Control-Allow-Origin":"*",
                        "Access-Control-Allow-Methods":"POST,OPTIONS",
                        "Access-Control-Allow-Headers":"Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                        "Content-Type":"application/json"
                    },
            body: JSON.stringify({
                "errorMessage": "Invalid request. Username not provided.",
            })
        };
        console.log(response);
        console.log("FAILURE");
        callback(null,response);
    } else {
        // input.Username = { Username }
        deallocateGamer(input.Username, function (err, data) {
            if (err) {
                console.log(">>>",err);
                response = {
                    isBase64Encoded : false,
                    statusCode: 502,
                    headers : {
                        "X-Amzn-ErrorType":"Error",
                        "Access-Control-Allow-Origin":"*",
                        "Access-Control-Allow-Methods":"POST,OPTIONS",
                        "Access-Control-Allow-Headers":"Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                        "Content-Type":"application/json"
                    },
                    body: JSON.stringify( {
                        "errorMessage": err.message,
                        "errorCode" : data
                    })
                };
                console.log("FAILURE");
                console.log(response);
                callback(null,response);
            }
            else {
                response = {
                    isBase64Encoded : false,
                    statusCode: 200,
                    headers : {
                        "Access-Control-Allow-Origin":"*",
                        "Access-Control-Allow-Methods":"POST,OPTIONS",
                        "Access-Control-Allow-Headers":"Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                        "Content-Type":"application/json"
                    },
                    body: JSON.stringify({"successMessage" : data})
                };
                console.log("SUCCESS");
                console.log(response);
                callback(null, response);
            }
        });
    }
};