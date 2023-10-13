// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
/**
 * Purpose of this function is to post to every connection
 * and let them know the game has started
 */

'use strict';

import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient  } from "@aws-sdk/client-dynamodb"; 
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SSMClient, GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

const DDBClient = new DynamoDBClient();
const DynamoDB = DynamoDBDocumentClient.from(DDBClient);
const SSM = new SSMClient();

// const APIGatewayManagement = new ApiGatewayManagementApi({apiVersion: '2018-11-29'});
let APIGatewayManagement = null;

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

const postSynchronousStart = async (session) => {
    session.SynchronizeTime = (new Date()).toJSON();
    let payload = JSON.stringify(session);
    let param = {
        "Name": process.env.SESSION_PARAMETER,
        "Type": 'String',
        "Value": payload,
        "Overwrite": true,
        'Description': 'Currently opened or recently closed session',
    };
    let putParameterCommand = new PutParameterCommand(param);
    let result = await SSM.send(putParameterCommand);
    console.log('Update sessionParameter result:',result);
    return result;
};

const readConnectionsFromDynamo = async (session) => {
    let tableName = process.env.SESSION_CONTROL_TABLENAME;
    console.log(session);
    let params = {
        'TableName': tableName,
        'Key': {'SessionId': session.SessionId},
        'ConsistentRead': true
    };
    let getCommand = new GetCommand(params);
    let data = await DynamoDB.send(getCommand);
    console.log('readConnectionsFromDynamo:',data);
    let connections = data.Item.connections.map((elem) => {return elem;});
    console.log('connections',connections);
    return connections;
};

const deleteStaleConnection = async (count, session) => {
    let tableName = process.env.SESSION_CONTROL_TABLENAME;
    const updateParams = {
        TableName: tableName, 
        Key: { 'SessionId':  session.SessionId},
        UpdateExpression: 'REMOVE #connections[' + count + ']',
        ExpressionAttributeNames: {
            '#connections': 'connections'
        }
    };
    let updateCommand = new UpdateCommand(updateParams);
    let updateCommandResult = await DynamoDB.send(updateCommand);
    console.log('deleteStaleConnection result ',updateCommandResult);
    return updateCommandResult;
};

const dispatchToConnections = async (connections, session) => {
    let count = 0;
    let command = null;
    for (let connection of connections) {
        try {
            console.log('posting to connection: ', connection);
            command = new PostToConnectionCommand(
                {
                    ConnectionId: connection,
                    Data: 'start'
                }
            );
            await APIGatewayManagement.send(command);
        } catch (e) {
            console.log(e);
            if (e.statusCode == 410) {
                deleteStaleConnection(count, session);
                count--;
            }
        }
        count++;
    }
    console.log('Sent to all connections');
    return 'success';
};
    

export const handler = async (event,context) => {
    console.log(event);
    let endpoint = `https://${event.requestContext.domainName}/${event.requestContext.stage}`;
    APIGatewayManagement = new ApiGatewayManagementApiClient({
        endpoint : endpoint
    });
    console.log(`APIGatewayManagement endpoint: ${endpoint}`);
    let response = null;
    let session = await readSessionFromSSM();
    console.log('session:',session);
    if (session instanceof Error) {
        response = {
            isBase64Encoded: false,
            statusCode: session.errorCode,
            body: JSON.stringify({'errorMessage':session.errorMessage, 'errorCode': session.errorCode})
        };
    } else {
        if (!session || !session.SessionId ) {
            response = {
                isBase64Encoded: false,
                statusCode: 400,
                body: JSON.stringify({
                    'errorMessage':'no session available',
                    'errorCode': 400
                })
            };
        } 
        else {
            // Write to SSM and update parameter.
            let syncStart = await postSynchronousStart(session);
            console.log('postSynchronousStart response:',syncStart);
            if (syncStart instanceof Error) {
                    console.log('error postSynchronousStart:',syncStart);
                    response = {
                        isBase64Encoded: false,
                        statusCode: 400,
                        body: JSON.stringify({
                            'error': syncStart
                        })
                    };
            } 
            else {
                let connections = await readConnectionsFromDynamo(session);
                console.log('readConnectionsFromDynamo response:',connections);
                if (connections instanceof Error) {
                        console.log('error readConnectionsFromDynam:',connections);
                        response = {
                            isBase64Encoded: false,
                            statusCode: 400,
                            body: JSON.stringify({
                                'error': connections
                            })
                        };
                } 
                else {
                    if (!connections || connections.length == 0) {
                            response = {
                                isBase64Encoded: false,
                                statusCode: 400,
                                body: JSON.stringify({
                                    'errorMessage': 'There are no connections',
                                    'errorCode': 400
                                })
                            };
                    }
                    else {
                        try {
                            await dispatchToConnections(connections, session.SessionId);
                            console.log('call to dispatchToConnections successful');
                            response = {
                                isBase64Encoded: false,
                                statusCode: 200
                            };
                        } catch (err) {
                            console.log('error in dispatchToConnections:',err);
                            response = {
                                isBase64Encoded: false,
                                statusCode: 400,
                                body: JSON.stringify({
                                    'error': err
                                })
                            };
                        }
                    }
                }
            }
        }
    }
    console.log(response);
    return response;
};