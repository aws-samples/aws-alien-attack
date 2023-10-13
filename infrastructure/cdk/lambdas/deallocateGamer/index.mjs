// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
'use strict';

import { DynamoDBClient  } from "@aws-sdk/client-dynamodb"; 
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const DDBClient = new DynamoDBClient();
const DynamoDB = DynamoDBDocumentClient.from(DDBClient);
const SSM = new SSMClient();

const readSessionFromSSM = async function() {
    let result = null;
    try {
        const param = {
            "Name": process.env.SESSION_PARAMETER
        };
        let command = new GetParameterCommand(param);
        const ssmResponse = await SSM.send(command);
        console.log('ssmResponse:',ssmResponse);
        let sessionData = JSON.parse(ssmResponse.Parameter.Value);
        result = sessionData;
    } catch (exception) {
        let errorMessage = "Error reading from SSM";
        console.log(errorMessage);
        let error = new Error(errorMessage);
        error.code = "ErrorReadingSSM";
        error.details = error;
        error.statusCode = 500;
        result = error;
    }
    return result;
};

const readSessionControlFromDynamoDB = async function (session) {
    let result = null;
    const tableName = process.env.SESSION_CONTROL_TABLENAME;
    const getParams = {
        "TableName": tableName,
        "Key": { "SessionId": session },
        "ConsistentRead": true
    };
    try {
        const getCommand = new GetCommand(getParams);
        const getCommandResponse = await DynamoDB.send(getCommand);
        console.log("Success in readSessionControlFromDynamoDB");
        console.log(getCommandResponse);
        result = getCommandResponse.Item;
    } catch (exception) {
        console.log(exception);
        let error = new new Error("Error reading sessionData from database.");
        error.code = "ErrorReadingDynamoDB";
        error.statusCode = 500;
        error.details = exception;
        result = error;
    }
    return result;
};

const deallocateGamer = async function(gamerUsername) {
    let result = null;
    let session = await readSessionFromSSM();
    console.log('session',session);
    result = session;
    if (!(session instanceof Error)) {
        let sessionControl = await readSessionControlFromDynamoDB(session.SessionId);
        console.log('sessionControl:',sessionControl);
        result = sessionControl;
        if (!(sessionControl instanceof Error)) {
            let playingIdx = sessionControl.PlayingGamers.findIndex((e) => { return e == gamerUsername });
            if (playingIdx == -1) { 
                result = "User "+gamerUsername+" not found in the list of playing gamers. Discarded.";
                console.log(result);
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
                    "ExpressionAttributeValues": {
                        ":n": newNumberOfOccupiedSeats,
                        ":p": sessionControl.PlayingGamers,
                        ":o": sessionControl.OccupiedSeats,
                        ":f": sessionControl.FinishedGamers
                    }
                };
                let updateCommand = new UpdateCommand(params);
                try {
                    let updateCommandResponse = await DynamoDB.send(updateCommand);
                    console.log('updateCommandResponse',updateCommandResponse);
                    result = "Success deallocating " + gamerUsername;
                } catch (exception) {
                    let error = new Error("Error executing DynamoDB.Update");
                    error.statusCode = 422;
                    result = error;
                }
                console.log(result);
            }
        }
    }
    return result;
};

export const handler = async (event,context) => {
    console.log('START TIME:', new Date());
    console.log(event);
    let response = null;
    let input = null;
    try {
        input = JSON.parse(event.body);
        console.log('Converted body');
        console.log(input);
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
        } else {
            // input.Username = { Username }
            let deallocateGamerResponse = await deallocateGamer(input.Username);
            console.log('deallocateGamerResponse',deallocateGamerResponse);
            if (deallocateGamerResponse instanceof Error) {
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
                        "errorMessage": deallocateGamerResponse.message,
                        "errorCode" : deallocateGamerResponse.errorCode
                    })
                };
                console.log("FAILURE");
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
                    body: JSON.stringify({"successMessage" : response})
                };
                console.log("SUCCESS");
                console.log(response);
            }
        }
    } catch(conversionError) {
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
    }
    return response;
};