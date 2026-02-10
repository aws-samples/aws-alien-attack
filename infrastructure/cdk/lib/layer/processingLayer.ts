// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';
import { ResourceAwareConstruct, IParameterAwareProps } from './../resourceawarestack'

import Lambda = require('aws-cdk-lib/aws-lambda');
import IAM = require('aws-cdk-lib/aws-iam');
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';

import SQS = require('aws-cdk-lib/aws-sqs');


import path = require('path');

const lambdasLocation = path.join(__dirname,'..','..','lambdas');

var SESSION_PARAMETER : boolean = false;

export class ProcessingLayer extends ResourceAwareConstruct {

    private allocateFunction: Lambda.Function;
    public getAllocateFunctionArn() {
        return this.allocateFunction.functionArn;
    }
    public getAllocateFunctionRef() : Lambda.Function {
        return this.allocateFunction;
    }

    private deallocateFunction: Lambda.Function;
    public getDeallocateFunctionArn() {
        return this.deallocateFunction.functionArn;;
    }

    private scoreboardFunction : Lambda.Function;
    public getScoreboardFunctionArn() {
        return this.scoreboardFunction.functionArn;
    }
    public getScoreboardFunctionRef() : Lambda.Function {
        return this.scoreboardFunction;
    }

    constructor(parent: Construct, name: string, props: IParameterAwareProps) {
        super(parent, name, props);
        let createdFunction: Lambda.Function | undefined | null = null;

        createdFunction = this.getAllocateGamerFunction();
        if (createdFunction) this.allocateFunction = createdFunction;

        createdFunction = this.getDeallocateGamerFunction();
        if (createdFunction) this.deallocateFunction = createdFunction;

        createdFunction = this.getScoreboardFunction();
        if (createdFunction) this.scoreboardFunction = createdFunction;

        if (props && props.getParameter("sessionparameter")) SESSION_PARAMETER=true;
        
    }

    private getAllocateGamerFunction() {
        /**
    * This function requires access to 
    * SystemsManager
    *      process.env.SESSION_PARAMETER = /<getAppRefName>/session
    * DynamoDB Tables
    *      process.env.SESSION_CONTROL_TABLENAME = getAppRefName+'SessionControl'
    */
        let sessionParameter : any;
        let parameterNameForLambda : string;
        if (SESSION_PARAMETER) {
            sessionParameter =  this.properties.getParameter('parameter.session');
            parameterNameForLambda =  (sessionParameter).name;
        }
        else {
            sessionParameter = { parameterName : '/'+this.properties.getApplicationName().toLocaleLowerCase()+'/session'};
            parameterNameForLambda = sessionParameter.parameterName;
        }
        let sessionControlTable : Table = <Table> this.properties.getParameter('table.sessioncontrol');
        if (sessionParameter && sessionControlTable) {
            let createdFunction: Lambda.Function =
                new Lambda.Function(this, this.properties.getApplicationName() + 'AllocateGamerFn', {
                    runtime: new Lambda.Runtime('nodejs24.x'),
                    architecture: Lambda.Architecture.ARM_64,
                    handler: 'index.handler',
                    code: Lambda.Code.fromAsset(path.join(lambdasLocation,'allocateGamer')),
                    environment: {
                        'SESSION_CONTROL_TABLENAME': sessionControlTable.tableName,
                        'SESSION_PARAMETER': parameterNameForLambda
                    }
                    , functionName: this.properties.getApplicationName() + 'AllocateGamerFn'
                    , description: 'This function supports the allocation of gamers when the game is to start'
                    , memorySize: 128
                    , timeout: Duration.seconds(60)
                    , role: new IAM.Role(this, this.properties.getApplicationName() + 'AllocateGamerFn_Role', {
                        roleName: this.properties.getApplicationName() + 'AllocateGamerFn_Role'
                        , assumedBy: new IAM.ServicePrincipal('lambda.amazonaws.com')
                        , managedPolicies : [ ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole') ]
                        , inlinePolicies: {
                            'DynamoDBPermissions' :
                                new IAM.PolicyDocument({
                                    statements : [
                                        new IAM.PolicyStatement({
                                            resources : [  sessionControlTable.tableArn ]
                                            ,actions : [
                                                "dynamodb:GetItem",
                                                "dynamodb:UpdateItem",
                                                "dynamodb:Scan",
                                                "dynamodb:Query"
                                            ]
                                        })
                                    ]
                                }),
                            'SystemsManagerPermissions':
                                new IAM.PolicyDocument({
                                    statements : [                                    
                                        new IAM.PolicyStatement({
                                            resources: ['arn:aws:ssm:'+this.properties.region+':'+this.properties.accountId+':parameter'+sessionParameter.parameterName ],
                                            actions: [ 'ssm:GetParameter' , 'ssm:GetParameters']
                                        })
                                    ]
                                })
                        }
                    })
                }
            );
            return createdFunction;
        }
        else return undefined;
    }

    private getDeallocateGamerFunction() {
        /**
         * This function requires access to 
         * SystemsManager
         *      process.env.SESSION_PARAMETER = /<getAppRefName>/session
         * DynamoDB Tables
         *      process.env.SESSION_CONTROL_TABLENAME = getAppRefName+'SessionControl'
         */

        let sessionParameter : any;
        let parameterName : string;
        if (SESSION_PARAMETER) {
            sessionParameter =  this.properties.getParameter('parameter.session');
            parameterName =  sessionParameter.ref;
        }
        else  {
            sessionParameter = { parameterName : '/'+this.properties.getApplicationName().toLocaleLowerCase()+'/session'};
            parameterName = sessionParameter.parameterName;
        }
        let sessionControlTable: Table | undefined = <Table> this.properties.getParameter('table.sessionControl');
        if (sessionParameter && sessionControlTable) {
            let createdFunction: Lambda.Function =
                new Lambda.Function(this, this.properties.getApplicationName() + 'DeallocateGamerFn', {
                    runtime: new Lambda.Runtime('nodejs24.x'),
                    architecture: Lambda.Architecture.ARM_64,
                    handler: 'index.handler',
                    code: Lambda.Code.fromAsset(path.join(lambdasLocation,'deallocateGamer')),
                    environment: {
                        'SESSION_CONTROL_TABLENAME': sessionControlTable.tableName,
                        'SESSION_PARAMETER': parameterName
                    }
                    , functionName: this.properties.getApplicationName() + 'DeallocateGamerFn'
                    , description: 'This function deallocates the gamer when a relevant event is identified (sign out, close window etc)'
                    , memorySize: 128
                    , timeout: Duration.seconds(60)
                    , role: new IAM.Role(this, this.properties.getApplicationName() + 'DeallocateGamerFn_Role', {
                        roleName: this.properties.getApplicationName() + 'DeallocateGamerFn_Role'
                        , assumedBy: new IAM.ServicePrincipal('lambda.amazonaws.com')
                        , managedPolicies : [ ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole') ]
                        , inlinePolicies: {
                            'DynamoDBPermissions':
                                new IAM.PolicyDocument({
                                    statements : [
                                        new IAM.PolicyStatement( {
                                            resources : [ sessionControlTable.tableArn ],
                                            actions : [ 
                                                'dynamodb:GetItem',
                                                'dynamodb:UpdateItem',
                                                'dynamodb:Scan',
                                                'dynamodb:Query'
                                            ]
                                        })
                                    ]
                                }),
                            'SystemsManagerPermissions':
                                new IAM.PolicyDocument({
                                    statements : [
                                        new IAM.PolicyStatement({
                                            resources : [ 'arn:aws:ssm:'+this.properties.region+':'+this.properties.accountId+':parameter'+sessionParameter.parameterName ]
                                           ,actions: [
                                               'ssm:GetParameter',
                                               'ssm:GetParameters'
                                            ]
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

    private getScoreboardFunction() {

        let dlq = new SQS.Queue(this, this.properties.getApplicationName() + 'DLQ', {
            queueName: this.properties.getApplicationName() + 'DLQ'
        })

        /**
         * This function requires access to 
         * Queue
         *      process.env.DLQ_URL = "https://sqs.<region>.amazonaws.com/<account>/<envName>_DLQ"
         * SystemsManager
         *      process.env.SESSION_PARAMETER = /<getAppRefName>/session
         * DynamoDB Tables
         *      process.env.SESSION_TABLENAME = getAppRefName+'Session'
         *      process.env.SESSION_CONTROL_TABLENAME = getAppRefName+'SessionControl'
         *      process.env.SESSIONTOPX_TABLENAME = getAppRefName+'SessionTopX'
         */
        let sessionParameter : any;
        let parameterName : string;
        if (SESSION_PARAMETER) {
            sessionParameter = this.properties.getParameter('parameter.session');
            parameterName = sessionParameter.ref;
        } else {
            sessionParameter = { parameterName : '/'+this.properties.getApplicationName().toLocaleLowerCase()+'/session'};
            parameterName = sessionParameter.parameterName;
        }
        let sessionControlTable: Table | undefined = <Table> this.properties.getParameter('table.sessionControl');
        let sessionTopX: Table | undefined = <Table> this.properties.getParameter('table.sessionTopX');
        let sessionTable: Table | undefined = <Table> this.properties.getParameter('table.session');
        if (sessionParameter && sessionControlTable && sessionTopX && sessionTable) {
            let createdFunction: Lambda.Function =
                new Lambda.Function(this, this.properties.getApplicationName() + 'ScoreboardFn', {
                    runtime: new Lambda.Runtime('nodejs24.x'),
                    architecture: Lambda.Architecture.ARM_64,
                    handler: 'index.handler',
                    code: Lambda.Code.fromAsset(path.join(lambdasLocation,'scoreboard')),
                    environment: {
                        'DLQ_URL': dlq.queueUrl,
                        'SESSION_PARAMETER': parameterName,
                        'SESSION_TABLENAME': sessionTable.tableName,
                        'SESSION_CONTROL_TABLENAME': sessionControlTable.tableName,
                        'SESSION_TOPX_TABLENAME': sessionTopX.tableName,
                        'TopXValue': '10'
                    }
                    , functionName: this.properties.getApplicationName() + 'ScoreboardFn'
                    , description: 'This function computes the scoreboard'
                    , memorySize: 128
                    , timeout: Duration.seconds(60)
                    , role: new IAM.Role(this, this.properties.getApplicationName() + 'ScoreboardFn_Role', {
                        roleName: this.properties.getApplicationName() + 'ScoreboardFn_Role'
                        , assumedBy: new IAM.ServicePrincipal('lambda.amazonaws.com')
                        , managedPolicies : [ ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole') ]
                        , inlinePolicies: {
                            'DynamoDBPermissions':
                                new IAM.PolicyDocument({
                                    statements : [
                                        new IAM.PolicyStatement({
                                            resources : [ 'arn:aws:dynamodb:' + this.properties.region + ':' + this.properties.accountId + ':table/' + this.properties.getApplicationName() + '*' ],
                                            actions: [
                                                 'dynamodb:GetItem'
                                                ,'dynamodb:UpdateItem'
                                                ,'dynamodb:Scan'
                                                ,'dynamodb:Query'
                                                ,'dynamodb:Batch*'
                                                ,'dynamodb:PutItem'
                                                ,'dynamodb:DeleteItem'
                                            ]
                                        })
                                    ]
                                }),
                            'SystemsManagerPermissions':
                                new IAM.PolicyDocument({
                                    statements : [
                                        new IAM.PolicyStatement({
                                             resources : [ 'arn:aws:ssm:' + this.properties.region + ':' + this.properties.accountId + ':parameter/' + this.properties.getApplicationName().toLowerCase() + '*' ]
                                            ,actions : [ 
                                                 'ssm:Get*'
                                                ,'ssm:List*'
                                            ]
                                        })
                                    ]
                                }),
                            'SQSPermissions':
                                new IAM.PolicyDocument({
                                    statements : [
                                        new IAM.PolicyStatement({
                                             resources : [ dlq.queueArn ]
                                            ,actions :[ 'sqs:SendMessage' ]
                                        })
                                    ]
                                }),
                            'KinesisPermissions':
                                new IAM.PolicyDocument({
                                    statements : [
                                        new IAM.PolicyStatement({
                                             resources : ["*"]
                                            , actions : [
                                                "kinesis:SubscribeToShard",
                                                "kinesis:GetShardIterator",
                                                "kinesis:GetRecords",
                                                "kinesis:DescribeStream"
                                            ]
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