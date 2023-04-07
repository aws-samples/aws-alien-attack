// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
/**
 * Purpose of this function is to write the connectionID of users who open 
 * a websocket connection.
 */

'use strict';

const AWS = require('aws-sdk');
const DynamoDB = new AWS.DynamoDB.DocumentClient();
const SSM = new AWS.SSM();

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

const recordConnectiontoSession = function(session, connectionId, callback) {
    let tableName = process.env.SESSION_CONTROL_TABLENAME;
    let params = {
        'TableName': tableName,
        'Key': {'SessionId': session},
        'ExpressionAttributeNames': {'#connections': 'connections'},
        'ExpressionAttributeValues': {
            ':connections': [connectionId],
            ':empty_list': []
        },
        'UpdateExpression': 'set #connections = list_append(if_not_exists(#connections, :empty_list), :connections)'
    }
    DynamoDB.update(params, (err, data) => {
        if (err) {
            console.log('error placing connection', err);
            let message = 'Error in placing connectionID';
            callback(new Error(message), 422);
        } else callback(null, ('Success adding connection'));
    });
};

exports.handler = (event, context, callback) => {
    console.log(event);
    // Update table with connectionID
    const { connectionId } = event.requestContext; 
    let response = null;

    readSessionFromSSM((err, session) => {
        if (err) {
            console.log(err);
            callback({
                statusCode: 400,
                isBase64Encoded: false,
                body: JSON.stringify({ "errorMessage" : err.details, "code" : err.code })
            });
        }
        // Make sure that the session is valid
        if (!session || !session.SessionId || session.SessionId.trim() == '') {
            response = {
                statusCode: 400,
                isBase64Encoded: false,
                body: JSON.stringify({
                    "errorMessage": "Invalid request. Session not provided.",
                    "errorCode" : 400
                })
            };
            console.log(response);
            callback(null, response);
        }
        recordConnectiontoSession(session.SessionId, connectionId, (err, _) => {
            if (err) {
                response = {
                    statusCode: err.statusCode,
                    isBase64Encoded: false,
                    body: JSON.stringify({
                        "errorMessage": err.errorMessage,
                        "errorCode": err.errorCode
                    })
                };
                console.log(response);
                callback(null, response);
            } else {
                callback(null, {
                    statusCode: 200,
                    isBase64Encoded: false,
                    body: JSON.stringify({
                        "success": true
                    })
                });
            }
        });
    });
};