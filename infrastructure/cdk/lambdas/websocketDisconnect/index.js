// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
/**
 * Purpose of this function is to delete any stale
 * connectionIDs from closed websockets
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
        }
    );
};

const getConnectionIndexDynamo = (session, callback) => {
    let tableName = process.env.SESSION_CONTROL_TABLENAME;
    let params = {
        TableName: tableName,
        Key: {'SessionId': session},
        AttributesToGet: ['connections']
    };
    DynamoDB.get(params, (err, data) => {
        if (err) callback(err);
        else {
            console.log(data);
            callback(null, data);
        }
    });
};

const deleteConnectionDynamo = (session, index, callback) => {
    let tableName = process.env.SESSION_CONTROL_TABLENAME;
    const deleteParams = {
        TableName: tableName,
        Key: {SessionId: session},
        UpdateExpression: 'REMOVE #connections[' + index + ']',
        ExpressionAttributeNames: {
            '#connections': 'connections'
        }
    };
    DynamoDB.update(deleteParams, (err, _) => {
        if (err) callback(err);
        else callback();
    });
};

exports.handler = (event, context, callback) => {
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
        getConnectionIndexDynamo(session.SessionId, (err, connections) => {
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
            } 
            // handle the connections array
            connections = connections.Item.connections.map((e) => {return e});
            let index = connections.indexOf(connectionId);
            deleteConnectionDynamo(session.SessionId, index, (err, _) => {
                if (err) console.log(err);
            });

        }); 
    });
};
