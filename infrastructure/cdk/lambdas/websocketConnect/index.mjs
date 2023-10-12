// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
/**
 * Purpose of this function is to write the connectionID of users who open 
 * a websocket connection.
 */

'use strict';

import { DynamoDBClient  } from "@aws-sdk/client-dynamodb"; 
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
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


const recordConnectiontoSession = async function(session, connectionId) {
    let tableName = process.env.SESSION_CONTROL_TABLENAME;
    let updateParams = {
        'TableName': tableName,
        'Key': {'SessionId': session},
        'ExpressionAttributeNames': {'#connections': 'connections'},
        'ExpressionAttributeValues': {
            ':connections': [connectionId],
            ':empty_list': []
        },
        'UpdateExpression': 'set #connections = list_append(if_not_exists(#connections, :empty_list), :connections)'
    };
    let result = null;
    let updateCommand = new UpdateCommand(updateParams);
    try { 
        let updateCommandResult = await DynamoDB.send(updateCommand);
        console.log('recordConnectiontoSession result ',updateCommandResult);
        result = 'Success adding connection';
    } catch (exception) {
        console.log('recordConnectiontoSession exception ',exception);
        let error = new Error('Error in placing connectionID');
        error.code = "ErrorUpdatingDynamoDB";
        error.details = error;
        error.statusCode = 422;
    }
    return result;
};

export const handler = async (event,context) => {
    console.log(event);
    // Update table with connectionID
    const { connectionId } = event.requestContext; 
    let response = null;
    let session = await readSessionFromSSM();
    if (session instanceof Error) {
        console.log(session);
        response = {
            statusCode: 400,
            isBase64Encoded: false,
            body: JSON.stringify({ "errorMessage" : session.details, "code" : session.code })
        };
    } else {
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
        } else {
            let recordConnResult = await recordConnectiontoSession(session.SessionId, connectionId);
            if (recordConnResult instanceof Error)
                response = {
                    statusCode: recordConnResult.statusCode,
                    isBase64Encoded: false,
                    body: JSON.stringify({
                        "errorMessage": recordConnResult.errorMessage,
                        "errorCode": recordConnResult.errorCode
                    })
                };
            else 
                response = {
                    statusCode: 200,
                    isBase64Encoded: false,
                    body: JSON.stringify({
                        "success": true
                    })
                };
        }
    }
    console.log(response);
    return response;
};