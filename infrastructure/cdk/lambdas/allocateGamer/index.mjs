// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
/**
 * The purpose of this function is to retrieve session data if there are seats available for the user
 * If there is not, an error shaw be returned.
 */
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

const allocateSeatForGamer = async function (gamerUsername, session, sessionControl) {
    let result = null;
    let gamerIsAlreadyPlaying = ((sessionControl.PlayingGamers.findIndex((r) => { return (r == gamerUsername) })) != -1 ? true : false);
    let gamerHasAlreadyPlayed = ((sessionControl.FinishedGamers.findIndex((r) => { return (r == gamerUsername) })) != -1 ? true : false);
    if (gamerIsAlreadyPlaying) {
        let message = "Gamer is already playing";
        console.log(message);
        // If gamer is already playing, let's keep them playing
        result = "Keep playing.";
    }
    else
        if (gamerHasAlreadyPlayed && (session.GameType == "SINGLE_TRIAL" || session.GameType == "TIME_CONSTRAINED")) {
            let errorMessage = "Session is " + session.GameType + ". Gamer has already played.";
            console.log(errorMessage);
            let responseError = new Error(errorMessage);
            responseError.code = "GamerCannotPlay";
            responseError.statusCode = 422;
            result = responseError;
        } 
        else {
            // Session is (MULTIPLE_TRIAL && gamerHasAlreadyPlayed) || !gamerHasAlreadyPlayed
            console.log("Session is (MULTIPLE_TRIAL && gamerHasAlreadyPlayed) || !gamerHasAlreadyPlayed");
            if (sessionControl.OccupiedSeats == sessionControl.TotalSeats) {
                let errorMessage = "No seats available.";
                console.log(errorMessage);
                let responseError = new Error(errorMessage);
                responseError.code = "NoSeatsAvailable";
                responseError.statusCode = 422;
                result = responseError;
            }
            else {
                sessionControl.PlayingGamers.push(gamerUsername);
                if (gamerHasAlreadyPlayed)
                    sessionControl.FinishedGamers = sessionControl.FinishedGamers.filter( (g) => { return g!=gamerUsername });
                let newNumberOfOccupiedSeats = sessionControl.OccupiedSeats + 1;
                let tableName = process.env.SESSION_CONTROL_TABLENAME;
                let params = {
                    "TableName": tableName ,
                    "Key": { "SessionId": session.SessionId },
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
                try {
                    let updateCommandResponse = await DynamoDB.send(updateCommand);
                    console.log('updateCommandResponse:',updateCommandResponse);
                    result = "Success allocating "+gamerUsername;
                } catch(exception) {
                    console.log(exception);
                    let message = "Error in allocating seats.";        
                    let error = new Error(message);
                    error.statusCode = 500;
                    result = error;
                }
            }
        }
    return result;
};

const allocateGamer = async function (gamerUsername) {
    let session = await readSessionFromSSM();
    console.log(session);
    if (session instanceof Error) {
        return session;
    }
    if (!session) {
        let error = new Error('No session available.');
        error.statusCode = 422;
        return error;
    }
    else {
        console.log("SESSION FROM SSM");
        console.log(session);
        if (session.ClosingTime) {
            let message = "Session is closed.";
            console.log(message);
            let error = new Error(message);
            error.statusCode = 422;
            return error;
        }
        else {
            let sessionControl = await readSessionControlFromDynamoDB(session.SessionId);
            if (sessionControl instanceof Error) {
                console.log(sessionControl);
                return sessionControl;
            } else {
                let result = await allocateSeatForGamer(gamerUsername, session, sessionControl);
                console.log(result);
                return result;
            }
        }   
    }
};


export const handler = async (event,context) => {
    console.log('START TIME:', new Date());
    let input = null;
    if (event.body) input = event.body;
    else input = event;
    let response = null;
    try {
        input = JSON.parse(input);
        console.log('Converted input');
        console.log(input);
    }
    catch(conversionError) {
        console.log("Input conversion error.");
        response = {
            statusCode: 400,
            isBase64Encoded : false,
            headers : {
                "X-Amzn-ErrorType":"InvalidParameterException"
            },
            body: "Invalid payload for request"
        };
        return response;
    }
    if (!input.Username || typeof input.Username!="string" || input.Username.trim()=="") {
        console.log("Invalid event");
        response = {
            statusCode: 400,
            isBase64Encoded : false,
            headers : {
                "X-Amzn-ErrorType":"InvalidParameterException",
                "Access-Control-Allow-Origin": "*"
            },
            body: "Invalid request. Username not provided."
        };
        return response;
    } else {
        // input.Username = { Username }
        let result = await allocateGamer(input.Username);
        if (result instanceof Error) {
                console.log(">>>",result);
                let response = {
                    isBase64Encoded : false,
                    statusCode: result.statusCode,
                    headers : {
                        "X-Amzn-ErrorType":"Error",
                        "Access-Control-Allow-Origin" : "*"
                    },
                    body: JSON.stringify( {
                        "errorMessage": result.message,
                        "errorCode" : result.code,
                        "errorDetails" : result.details
                    })
                };
                console.log("FAILURE");
                console.log(response);
                return response;
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
                body: JSON.stringify({"successMessage" : result})
            };
            console.log("SUCCESS");
            console.log(response);
            return response;
        }
    }
};