// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
/**
 * Purpose of this function is to post to every connection
 * and let them know the game has started
 */

'use strict';

const AWS = require('aws-sdk');
const DynamoDB = new AWS.DynamoDB.DocumentClient();
const SSM = new AWS.SSM();
const APIGatewayManagement = new AWS.ApiGatewayManagementApi({apiVersion: '2018-11-29'});

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

const postSynchronousStart = (session, callback) => {
    session.SynchronizeTime = (new Date()).toJSON();
    let payload = JSON.stringify(session);
    let param = {
        "Name": process.env.SESSION_PARAMETER,
        "Type": 'String',
        "Value": payload,
        "Overwrite": true,
        'Description': 'Currently opened or recently closed session',
    };
    SSM.putParameter(param, (err, _) => {
        if (err) {
            console.log(err);
            callback(null, err);
        }
        callback();
    });
};

const readConnectionsFromDynamo = (session, callback) => {
    let tableName = process.env.SESSION_CONTROL_TABLENAME;
    console.log(session);
    let params = {
        TableName: tableName,
        Key: {'SessionId': session.SessionId},
        ConsistentRead: true
    };
    DynamoDB.get(params, (err, data) => {
        if (err) {
            console.log(err);
            callback(new Error("Error reading connections "));
        } else {
            console.log(data);
            let connections = data.Item.connections.map((elem) => {return elem;});
            console.log(connections);
            callback(null, connections);
        }
    });
}

const deleteStaleConnection = (count, session, callback) => {
    let tableName = process.env.SESSION_CONTROL_TABLENAME;
    const updateParams = {
        TableName: tableName, 
        Key: { 'SessionId':  session.SessionId},
        UpdateExpression: 'REMOVE #connections[' + count + ']',
        ExpressionAttributeNames: {
            '#connections': 'connections'
        }
    };
    DynamoDB.update(updateParams, (err, _) => {
        if (err) callback(err);
        else callback();
    });
}

const dispatchToConnections = async (connections, session, callback) => {
    console.log(APIGatewayManagement);
    let count = 0;
    for (let connection of connections) {
        try {
            console.log('posting to connection: ', connection);
            await APIGatewayManagement.postToConnection({
                ConnectionId: connection,
                Data: 'start'
            }).promise();
        } catch (e) {
            console.log(e);
            if (e.statusCode == 410) {
                deleteStaleConnection(count, session, (err,_) => {
                    if (err) console.alarm('Error deleting stale connection', err);
                });
                count--;
            }
        }
        count++;
    }

    console.log('Sent to all connections')
    callback(null, 'success');
}
    

exports.handler = (event, context, callback) => {
    APIGatewayManagement.endpoint = event.requestContext.domainName + '/' + event.requestContext.stage;
    let response = null;
    readSessionFromSSM((err, session) => {
        if (err) {
            response = {
                isBase64Encoded: false,
                statusCode: err.errorCode,
                body: JSON.stringify({'errorMessage':err.errorMessage, 'errorCode': err.errorCode})
            };
            callback(null, err);
        } else {
            if (!session || typeof session != 'string' || session.trim() == '') {
                response = {
                    isBase64Encoded: false,
                    statusCode: 400,
                    body: JSON.stringify({
                        'errorMessage':'no session available',
                        'errorCode': 400
                    })
                };
                callback(null, response);
            }
            // Write to SSM and update paramater.
            postSynchronousStart(session, (err,_) => {
                if (err) {
                    response = {
                        isBase64Encoded: false,
                        statusCode: 400,
                        body: JSON.stringify({
                            'error': err
                        })
                    };
                    callback(null, response);
                }
                readConnectionsFromDynamo(session, (err, connections) => {
                    if (err) {
                        response = {
                            isBase64Encoded: false,
                            statusCode: 400,
                            body: JSON.stringify({
                                'error': err
                            })
                        };
                        callback(null, response);
                    } else {
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
                        dispatchToConnections(connections, session, (err,_) => {
                            if (err) {
                                response = {
                                    isBase64Encoded: false,
                                    statusCode: 400,
                                    body: JSON.stringify({
                                        'error': err
                                    })
                                };
                                callback(null, response);
                            } else {
                                response = {
                                    isBase64Encoded: false,
                                    statusCode: 200
                                };
                                callback(null, response);
                            }
                        });
                    }
                });
            });
        }
    });
}