// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { Construct, Duration } from '@aws-cdk/core';
import { ResourceAwareConstruct, IParameterAwareProps } from './../resourceawarestack'

import Lambda = require('@aws-cdk/aws-lambda');
import IAM = require('@aws-cdk/aws-iam');

import { Table } from '@aws-cdk/aws-dynamodb';
import { ManagedPolicy } from '@aws-cdk/aws-iam';

const path = require('path');

const lambdasLocation = path.join(__dirname,'..','..','lambdas');

export class WebSocketLayer extends ResourceAwareConstruct {
    
    private webSocketConnectFunction: Lambda.Function;
    public getWebSocketFunctionArn() {
        return this.webSocketConnectFunction.functionArn;
    }
    public getWebSocketFunctionRef() : Lambda.Function {
        return this.webSocketConnectFunction;
    }

    private webSocketSynchronizeFunction: Lambda.Function;
    public getWebSocketSynchronizeFunctionArn() {
        return this.webSocketSynchronizeFunction.functionArn;
    }
    public getWebSocketSynchronizeFunctionRef() : Lambda.Function {
        return this.webSocketSynchronizeFunction;
    }

    private webSocketDisconnectFunction: Lambda.Function;
    public getWebSocketDisconnectFunctionArn() {
        return this.webSocketDisconnectFunction.functionArn;
    }
    public getWebSocketDisconnectFunctionRef() : Lambda.Function {
        return this.webSocketDisconnectFunction;
    }

    constructor(parent: Construct, name: string, props: IParameterAwareProps) {
        super(parent, name, props);
        let createdFunction: Lambda.Function | undefined | null = null;
        
        createdFunction = this.getWebSocketConnectFunction();
        if (createdFunction) this.webSocketConnectFunction = createdFunction;
    
        createdFunction = this.getWebSocketSynchronizeFunction();
        if (createdFunction) this.webSocketSynchronizeFunction = createdFunction;

        createdFunction = this.getWebSocketDisconnectFunction();
        if (createdFunction) this.webSocketDisconnectFunction = createdFunction;
    }

    private getWebSocketConnectFunction() {
    /**
     * This function requires access to
     * SystemsManager
     *      process.env.SESSION_PARAMETER = /<getAppRefName>/session
     * DynamoDB Tables
     *      process.env.SESSION_CONTROL_TABLENAME = getAppRefName+'SessionControl' 
     */
        let sessionParameter = { name: '/'+this.properties.getApplicationName().toLocaleLowerCase()+'/session' };
        let sessionControlTable : Table = <Table> this.properties.getParameter('table.sessioncontrol');
        if (sessionParameter && sessionControlTable) {
            let createdFunction: Lambda.Function = 
                new Lambda.Function(this, this.properties.getApplicationName() + 'WebSocketConnect', {
                    runtime:Lambda.Runtime.NODEJS_10_X,
                    handler: 'index.handler',
                    code: Lambda.Code.fromAsset(path.join(lambdasLocation, 'websocketConnect')),
                    environment: {
                        'SESSION_CONTROL_TABLENAME': sessionControlTable.tableName,
                        'SESSION_PARAMETER': sessionParameter.name
                    },
                    functionName: this.properties.getApplicationName() + 'WebSocketConnect',
                    description: 'This function stores the connectionID to DynamoDB',
                    memorySize: 128,
                    timeout: Duration.seconds(60),
                    role: new IAM.Role(this, this.properties.getApplicationName() + 'WebSocketConnectFn_Role', {
                        roleName: this.properties.getApplicationName() + 'WebSocketConnectFn_Role',
                        assumedBy: new IAM.ServicePrincipal('lambda.amazonaws.com'),
                        managedPolicies : [ ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole') ],
                        inlinePolicies: {
                            'DynamoDBPermissions':
                                new IAM.PolicyDocument({
                                    statements : [
                                        new IAM.PolicyStatement({
                                            resources: [ sessionControlTable.tableArn ],
                                            actions : [ 'dynamodb:UpdateItem' ]
                                        })
                                    ]
                                }),
                            'SystemsManagerPermissions':
                                new IAM.PolicyDocument({
                                    statements: [
                                        new IAM.PolicyStatement({
                                            resources : ['arn:aws:ssm:'+this.properties.region+':'+this.properties.accountId+':parameter'+sessionParameter.name ] ,
                                            actions : ['ssm:GetParameter' , 'ssm:GetParameters' ]
                                        })
                                    ]
                                })
                        }  
                    })
                });
            return createdFunction;
        }
        else return undefined;
    }


    private getWebSocketSynchronizeFunction() {
    /**
     * This function requires access to
     * SystemsManager
     *      process.env.SESSION_PARAMETER = /<getAppRefName>/session
     * DynamoDB Tables
     *      process.env.SESSION_CONTROL_TABLENAME = getAppRefName+'SessionControl' 
     */
        let sessionParameter = { name: '/'+this.properties.getApplicationName().toLocaleLowerCase()+'/session' };
        let sessionControlTable : Table = <Table> this.properties.getParameter('table.sessioncontrol');
        if (sessionParameter && sessionControlTable) {
            let createdFunction: Lambda.Function = 
                new Lambda.Function(this, this.properties.getApplicationName() + 'WebSocketSynchronizeStart', {
                    runtime:Lambda.Runtime.NODEJS_10_X,
                    handler: 'index.handler',
                    code: Lambda.Code.fromAsset(path.join(lambdasLocation, 'synchronousStart')),
                    environment: {
                        'SESSION_CONTROL_TABLENAME': sessionControlTable.tableName,
                        'SESSION_PARAMETER': sessionParameter.name
                    },
                    functionName: this.properties.getApplicationName() + 'WebSocketSynchronizeStart',
                    description: 'This function invokes the WebSocket to start the AAA Game',
                    memorySize: 128,
                    timeout: Duration.seconds(60),
                    role: new IAM.Role(this, this.properties.getApplicationName() + 'WebSocketSynchronizeStartFn_Role', {
                        roleName: this.properties.getApplicationName() + 'WebSocketSynchronizeStartFn_Role',
                        assumedBy: new IAM.ServicePrincipal('lambda.amazonaws.com'),
                        managedPolicies: [ ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole') ],
                        inlinePolicies: {
                            'DynamoDBPermissions':
                                new IAM.PolicyDocument({
                                    statements : [
                                        new IAM.PolicyStatement({
                                            resources : [ sessionControlTable.tableArn ],
                                            actions : [ 'dynamodb:UpdateItem' , 'dynamodb:GetItem' ]
                                        })
                                    ]
                                }),
                            'SystemsManagerPermissions':
                                    new IAM.PolicyDocument({
                                        statements : [ 
                                            new IAM.PolicyStatement({
                                                resources : [ 'arn:aws:ssm:'+this.properties.region+':'+this.properties.accountId+':parameter'+sessionParameter.name ], 
                                                actions : [ 'ssm:GetParameter', 'ssm:GetParameters', 'ssm:PutParameter']
                                            })
                                        ]
                                    })
                        }  
                    })
                });
            return createdFunction;
        }
        else return undefined;
    }


    private getWebSocketDisconnectFunction() {
    /**
     * This function requires access to
     * SystemsManager
     *      process.env.SESSION_PARAMETER = /<getAppRefName>/session
     * DynamoDB Tables
     *      process.env.SESSION_CONTROL_TABLENAME = getAppRefName+'SessionControl' 
     */
        let sessionParameter = { name: '/'+this.properties.getApplicationName().toLocaleLowerCase()+'/session' };
        let sessionControlTable : Table = <Table> this.properties.getParameter('table.sessioncontrol');
        if (sessionParameter && sessionControlTable) {
            let createdFunction: Lambda.Function = 
                new Lambda.Function(this, this.properties.getApplicationName() + 'WebSocketDisconnect', {
                    runtime:Lambda.Runtime.NODEJS_10_X,
                    handler: 'index.handler',
                    code: Lambda.Code.fromAsset(path.join(lambdasLocation, 'websocketDisconnect')),
                    environment: {
                        'SESSION_CONTROL_TABLENAME': sessionControlTable.tableName,
                        'SESSION_PARAMETER': sessionParameter.name
                    },
                    functionName: this.properties.getApplicationName() + 'WebSocketDisconnect',
                    description: 'This function deletes the connectionID to DynamoDB',
                    memorySize: 128,
                   timeout: Duration.seconds(60),
                    role: new IAM.Role(this, this.properties.getApplicationName() + 'WebSocketDisconnectFn_Role', {
                        roleName: this.properties.getApplicationName() + 'WebSocketDisconnectFn_Role',
                        assumedBy: new IAM.ServicePrincipal('lambda.amazonaws.com'),
                        managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
                        inlinePolicies: {
                            'DynamoDBPermissions':
                                new IAM.PolicyDocument({
                                    statements : [ 
                                        new IAM.PolicyStatement({
                                            resources : [ sessionControlTable.tableArn ] ,
                                            actions : [ 'dynamodb:UpdateItem', 'dynamodb:GetItems', 'dynamodb:GetItem'] 
                                        })
                                    ]
                                }),
                            'SystemsManagerPermissions':
                                    new IAM.PolicyDocument({
                                        statements : [
                                            new IAM.PolicyStatement({
                                                resources: [ 'arn:aws:ssm:'+this.properties.region+':'+this.properties.accountId+':parameter'+sessionParameter.name ],
                                                actions : [ 'ssm:GetParameter' , 'ssm:GetParameters' ]
                                            })
                                        ]
                                    })
                        }  
                    })
                });
            return createdFunction;
        }
        else return undefined;
    }
}