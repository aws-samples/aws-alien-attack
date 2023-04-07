// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
/**
 * The purpose of this function is to retrieve session data if there are seats available for the user
 * If there is not, an error shaw be returned.
 */
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
        function (error, sessionParamResponse) {
            if (error) {
                let errorMessage = "Error reading from SSM";
                console.log(errorMessage);
                console.log(error);
                let responseError = new Error(errorMessage);
                responseError.code = "ErrorReadingSSM";
                responseError.details = error;
                callback(responseError,500);
            } else {
                let sessionData = null;
                try {
                    sessionData = JSON.parse(sessionParamResponse.Parameter.Value);
                    callback(null, sessionData);
                } catch (error) {
                    let errorMessage = "Error parsing session data from SSM";
                    console.log(errorMessage);
                    console.log(error);
                    let responseError = new Error(errorMessage);
                    responseError.code = "ErrorReadingFromSSM";
                    responseError.details = error;
                    console.log(sessionData);
                    callback(responseError, 500);
                }
            }
        });
};

const readSessionControlFromDynamoDB = function (session, callback) {
    let tableName = process.env.SESSION_CONTROL_TABLENAME;
    let getParams = {
        "TableName": tableName,
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

const allocateSeatForGamer = function (gamerUsername, session, sessionControl, callback) {
    let gamerIsAlreadyPlaying = ((sessionControl.PlayingGamers.findIndex((r) => { return (r == gamerUsername) })) != -1 ? true : false);
    let gamerHasAlreadyPlayed = ((sessionControl.FinishedGamers.findIndex((r) => { return (r == gamerUsername) })) != -1 ? true : false);
    if (gamerIsAlreadyPlaying) {
        let message = "Gamer is already playing";
        console.log(message);
        // If game is already playing, let's let he keep playing
        callback(null,"Keep playing.");
    }
    else {
        if (gamerHasAlreadyPlayed && (session.GameType == "SINGLE_TRIAL" || session.GameType == "TIME_CONSTRAINED")) {
            let errorMessage = "Session is " + session.GameType + ". Gamer has already played.";
            console.log(errorMessage);
            let responseError = new Error(errorMessage);
            responseError.code = "GamerCannotPlay";
            callback(responseError, 422);
        } 
        else {
            // Session is (MULTIPLE_TRIAL && gamerHasAlreadyPlayed) || !gamerHasAlreadyPlayed
            console.log("Session is (MULTIPLE_TRIAL && gamerHasAlreadyPlayed) || !gamerHasAlreadyPlayed");
            if (sessionControl.OccupiedSeats == sessionControl.TotalSeats) {
                let errorMessage = "No seats available.";
                console.log(errorMessage);
                let responseError = new Error(errorMessage);
                responseError.code = "NoSeatsAvailable";
                callback(responseError, 422);
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
                DynamoDB.update(params, function (err, data) {
                    if (err) {
                        let message = "Error in allocating seats.";        
                        console.log(message);
                        console.log(err);
                        callback(new Error(message), 422);
                    }
                    else callback(null, ("Success allocating "+gamerUsername));
                });
            }
        }
    }
};

const allocateGamer = function (gamerUsername, callback) {
    readSessionFromSSM(function (err, session) {
        if (err) callback(err,session);
        else {
            if (!session) callback(new Error('No session available.'), 422);
            else {
                console.log("SESSION FROM SSM");
                console.log(session);
                if (session.ClosingTime) {
                    let message = "Session is closed.";
                    console.log(message);
                    callback(new Error(message), 422);
                }
                else {
                    readSessionControlFromDynamoDB(session.SessionId, function (err, sessionControl) {
                        if (err) {
                            console.log(err);
                            callback(err, sessionControl);
                        } else allocateSeatForGamer(gamerUsername, session, sessionControl, function (err, data) {
                            if (err) {
                                console.log(err);
                                callback(err, data);
                            }
                            else {
                                console.log(data);
                                callback(null, data);
                            }
                        });
                    });
                }
            }
        }
    });
};


exports.handler = (event, context, callback) => {
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
            body: JSON.stringify({ "errorMessage" : "Invalid payload for request","errorCode" : 400 })
        };
        callback(null,response);
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
            body: JSON.stringify({
                "errorMessage": "Invalid request. Username not provided.",
                "errorCode" : 400
            })
        };
    } else {
        // input.Username = { Username }
        allocateGamer(input.Username, function (err, data) {
            if (err) {
                console.log(">>>",err);
                response = {
                    isBase64Encoded : false,
                    statusCode: data,
                    headers : {
                        "X-Amzn-ErrorType":"Error",
                        "Access-Control-Allow-Origin" : "*"
                    },
                    body: JSON.stringify( {
                        "errorMessage": err.message,
                        "errorCode" : err.code,
                        "errorDetails" : err.details
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