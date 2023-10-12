// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
/**
 * Purpose of this function is to delete any stale
 * connectionIDs from closed websockets
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

const getConnectionIndexDynamo = async(sessionId) => {
    let tableName = process.env.SESSION_CONTROL_TABLENAME;
    let params = {
        TableName: tableName,
        Key: {'SessionId': sessionId},
        AttributesToGet: ['connections']
    };
    let getCommand = new GetCommand(params);
    try {
        let data = await DynamoDB.send(getCommand);
        return data;
    } catch (exception) {
        return exception;
    }
};

const deleteConnectionDynamo = async(sessionId, index) => {
    let tableName = process.env.SESSION_CONTROL_TABLENAME;
    const updateParams = {
        TableName: tableName,
        Key: {SessionId: sessionId},
        UpdateExpression: 'REMOVE #connections[' + index + ']',
        ExpressionAttributeNames: {
            '#connections': 'connections'
        }
    };
    let updateCommand = new UpdateCommand(updateParams);
    try {
        let data = await DynamoDB.send(updateCommand);
        return data;
    } catch (exception) {
        return exception;
    }
};

export const handler = async (event,context) => {
    const { connectionId } = event.requestContext;
    let response = null;

    let session = await readSessionFromSSM();
    console.log('readSessionFromSSM result:',session);
    if (session instanceof Error) {
        response = {
            statusCode: 400,
            isBase64Encoded: false,
            body: JSON.stringify({ "errorMessage" : session.details, "code" : session.code })
        };
    } else
        if (!session || !session.SessionId || session.SessionId.trim() == '') {
            response = {
                statusCode: 400,
                isBase64Encoded: false,
                body: JSON.stringify({
                    "errorMessage": "Invalid request. Session not provided.",
                    "errorCode" : 400
                })
            };
        } else {
            let connections = await getConnectionIndexDynamo(session.SessionId);
            console.log('getConnectionIndexDynamo result:',connections);
            if (connections instanceof Error) {
                response = {
                    statusCode: 500,
                    isBase64Encoded: false,
                    body: 'Error getConnectionIndexDynamo'
                };
            } else {
                // handle the connections array
                connections = connections.Item.connections.map((e) => {return e});
                let index = connections.indexOf(connectionId);
                let deleteResult = await deleteConnectionDynamo(session.SessionId, index);
                console.log('deleteConnectionDynamo result:',deleteResult);
                if (deleteResult instanceof Error) {
                    response = {
                        statusCode: 500,
                        isBase64Encoded: false,
                        body: 'Error deleteConnectionDynamo'
                    };
                } else {
                    response = {
                        statusCode: 200,
                        isBase64Encoded: false,
                        body: 'Success'
                    };
                }
            }
        }
    console.log(response);
    return response;
};