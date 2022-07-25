// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { Construct } from 'constructs';
import { ResourceAwareConstruct, IParameterAwareProps } from './../resourceawarestack'


import KDS = require('aws-cdk-lib/aws-kinesis');
import KDF = require('aws-cdk-lib/aws-kinesisfirehose');
import IAM = require('aws-cdk-lib/aws-iam');
import APIGTW = require('aws-cdk-lib/aws-apigateway');
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import Lambda = require('aws-cdk-lib/aws-lambda');


import Logs = require('aws-cdk-lib/aws-logs');
import { KinesisEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';

export class IngestionConsumptionLayer extends ResourceAwareConstruct {

    kinesisStreams: KDS.IStream;
    kinesisFirehose: KDF.CfnDeliveryStream;

    private rawbucketarn: string;

    private userpool: string;
    private api: APIGTW.CfnRestApi;
    
    private KINESIS_INTEGRATION : boolean = false;
    private FIREHOSE : boolean = false;

    constructor(parent: Construct, name: string, props: IParameterAwareProps) {
        super(parent, name, props);
        
        // Checking if we want to have the Kinesis Data Streams integration deployed
        if (props && props.getParameter("kinesisintegration")) this.KINESIS_INTEGRATION = true;
        // Checking if we want to have the Kinesis Firehose depployed
        if (props && props.getParameter("firehose")) this.FIREHOSE= true;

        if (this.FIREHOSE) this.rawbucketarn = props.getParameter('rawbucketarn');
        
        this.userpool = props.getParameter('userpool');
        this.createKinesis(props);
        this.createAPIGateway(props);
        this.updateUsersRoles(props);
    }

    createKinesis(props: IParameterAwareProps) {

        this.kinesisStreams = new KDS.Stream(this, props.getApplicationName() + 'InputStream', {
            streamName: props.getApplicationName() + '_InputStream',
            shardCount: 1
        });
    
        // MISSING KINESIS INTEGRATION
        if (this.KINESIS_INTEGRATION) {
            new KinesisEventSource( this.kinesisStreams , {
                batchSize: 700,
                startingPosition : Lambda.StartingPosition.LATEST
            }).bind(<Lambda.Function> props.getParameter('lambda.scoreboard'));
        }
    
        // MISSING KINESIS FIREHOSE
        //section starts here
        if (this.FIREHOSE) {
            let firehoseName = props.getApplicationName() + '_Firehose';
            let firehoseLogGroupName = '/aws/kinesisfirehose/' + firehoseName;
            let firehoseLogGroup = new Logs.LogGroup(this,props.getApplicationName()+'firehoseloggroup', {
                logGroupName : firehoseLogGroupName
            });
            new Logs.LogStream(this,props.getApplicationName()+'firehoselogstream', {
                logGroup : firehoseLogGroup,
                logStreamName : "error"
            });
            let self = this;
            let firehoseRole = new IAM.Role(this, props.getApplicationName()+ 'FirehoseToStreamsRole', {
                roleName: props.getApplicationName() + 'FirehoseToStreamsRole',
                assumedBy: new IAM.ServicePrincipal('firehose.amazonaws.com'),
                inlinePolicies: {
                    'GluePermissions' : new IAM.PolicyDocument({
                        statements : [
                            new PolicyStatement({
                                actions : [
                                  "glue:GetTableVersions"
                                ],
                                resources : ["*"]
                            })
                        ]
                    }),
                    'S3RawDataPermission': new IAM.PolicyDocument({
                        statements : [
                            new PolicyStatement(
                                {
                                    actions : [
                                        's3:AbortMultipartUpload',
                                        's3:GetBucketLocation',
                                        's3:GetObject',
                                        's3:ListBucket',
                                        's3:ListBucketMultipartUploads',
                                        's3:PutObject',
                                    ],
                                    resources : [
                                        self.rawbucketarn,
                                        self.rawbucketarn + '/*'
                                    ]
                                }
                            )
                        ]
                    }),
                    'DefaultFirehoseLambda' : new IAM.PolicyDocument({
                        statements : [
                            new PolicyStatement({
                                actions: [
                                    "lambda:InvokeFunction",
                                    "lambda:GetFunctionConfiguration"
                                ],
                                resources : [
                                    "arn:aws:lambda:"+props.region+":"+props.accountId+":function:%FIREHOSE_DEFAULT_FUNCTION%:%FIREHOSE_DEFAULT_VERSION%"
                                ] 
                            })
                        ]
                    }),
                    'InputStreamReadPermissions': new PolicyDocument({
                        statements : [
                            new PolicyStatement({
                                actions : [
                                    'kinesis:DescribeStream',
                                    'kinesis:GetShardIterator',
                                    'kinesis:GetRecords'
                                ],
                                resources : [
                                    this.kinesisStreams.streamArn
                                ]
                            })
                        ]
                    }),
                    'CloudWatchLogsPermissions': new PolicyDocument({
                        statements : [
                            new PolicyStatement({
                                actions : [ 'logs:PutLogEvents' ],
                                resources : [
                                    'arn:aws:logs:' + props.region + ':' + props.accountId + ':log-group:/'+firehoseLogGroupName+':log-stream:*'
                                ]
                            })
                        ]
                    })
                }
            });
            
            this.kinesisFirehose = new KDF.CfnDeliveryStream(this, props.getApplicationName() + 'RawData', {
                deliveryStreamType: 'KinesisStreamAsSource',
                deliveryStreamName: firehoseName,
                kinesisStreamSourceConfiguration: {
                    kinesisStreamArn: this.kinesisStreams.streamArn,
                    roleArn: firehoseRole.roleArn
                }
                , s3DestinationConfiguration: {
                    bucketArn: <string>this.rawbucketarn,
                    bufferingHints: {
                        intervalInSeconds: 300,
                        sizeInMBs: 1
                    },
                    compressionFormat: 'GZIP',
                    roleArn: firehoseRole.roleArn,
                    cloudWatchLoggingOptions: {
                        enabled: true,
                        logGroupName: firehoseLogGroupName,
                        logStreamName: firehoseLogGroupName
                    }
                }
            });
            this.kinesisFirehose.node.addDependency(firehoseLogGroup);
        }
    }

    createAPIGateway(props: IParameterAwareProps) {

        let apirole = new IAM.Role(this, props.getApplicationName() + 'APIRole', {
            roleName: props.getApplicationName() + 'API',
            assumedBy: new IAM.ServicePrincipal('apigateway.amazonaws.com')
        });
        apirole.addToPolicy(
            new IAM.PolicyStatement({
                actions: ['lambda:InvokeFunction', 'lambda:InvokeAsync'],
                resources: ['arn:aws:lambda:' + props.region + ':' + props.accountId + ':function:' + props.getApplicationName() + '*']
            })
        );
        apirole.addToPolicy(new IAM.PolicyStatement({
            actions: [
                "ssm:GetParameterHistory",
                "ssm:GetParametersByPath",
                "ssm:GetParameters",
                "ssm:GetParameter"
            ],
            resources: ['arn:aws:ssm:'.concat(props.region!, ':', props.accountId!, ':parameter/', props.getApplicationName().toLowerCase(), '/*')]
        }));
        apirole.addToPolicy(new IAM.PolicyStatement({
            actions: ['dynamodb:GetItem'],
            resources: [
                (<Table>props.getParameter('table.session')).tableArn
                , (<Table>props.getParameter('table.sessiontopx')).tableArn
            ]
        }));
        apirole.addToPolicy(new IAM.PolicyStatement({
            actions: ['kinesis:PutRecord', 'kinesis:PutRecords'],
            resources: [this.kinesisStreams.streamArn]
        }));
        apirole.addManagedPolicy(IAM.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonAPIGatewayPushToCloudWatchLogs"));

        this.api = new APIGTW.CfnRestApi(this, props.getApplicationName() + "API", {
            name: props.getApplicationName().toLowerCase()
            , description: 'API supporting the application ' + props.getApplicationName()
        });

        new APIGTW.CfnGatewayResponse(this, props.getApplicationName() + 'GTWResponse', {
            restApiId: this.api.ref
            , responseType: 'DEFAULT_4XX'
            , responseParameters: {
                "gatewayresponse.header.Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                "gatewayresponse.header.Access-Control-Allow-Methods": "'*'",
                "gatewayresponse.header.Access-Control-Allow-Origin": "'*'"
            }
            , responseTemplates: {
                "application/json": "{\"message\":$context.error.messageString}"
            }
        }).addDependsOn(this.api);

        let authorizer = new APIGTW.CfnAuthorizer(this, props.getApplicationName() + "Authorizer", {
            name: props.getApplicationName().toLowerCase() + 'Authorizer'
            , restApiId: this.api.ref
            , type: 'COGNITO_USER_POOLS'
            , identitySource: 'method.request.header.Authorization'
            , providerArns: [
                this.userpool
            ]
        });

        let apiModelScoreboardResponse = new APIGTW.CfnModel(this, props.getApplicationName() + 'APIModelScoreboardResponseModel', {
            contentType: 'application/json'
            , description: 'Scoreboard response model (for /scoreboard/GET)'
            , name: 'ScoreboardResponseModel'
            , restApiId: this.api.ref
            , schema: {
                "$schema": "http://json-schema.org/draft-04/schema#",
                "title": "ScoreboardResponseModel",
                "type": "object",
                "properties": {
                    "Scoreboard": {
                        "type": "array",
                        "items": {
                            "$ref": "#/definitions/GamerScore"
                        }
                    }
                },
                "definitions": {
                    "GamerScore": {
                        "type": "object",
                        "properties": {
                            "Name": { "type": "integer" },
                            "Score": { "type": "integer" },
                            "Level": { "type": "integer" },
                            "Shots": { "type": "integer" },
                            "Nickname": { "type": "string" },
                            "Lives": { "type": "integer" }
                        }
                    }
                }
            }
        });

        let apiModelGetParametersRequest = new APIGTW.CfnModel(this, props.getApplicationName() + 'APIModelGetParametersRequest', {
            contentType: 'application/json'
            , description: 'Model to request SSM:GetParameters'
            , name: 'GetParametersRequest'
            , restApiId: this.api.ref
            , schema: {
                "$schema": "http://json-schema.org/draft-04/schema#",
                "title": "GetParametersRequest",
                "type": "object",
                "properties": {
                    "names": { 
                        "type": "array",
                        "items": { "type": "string" }
                    }
                }
            }
        });

        //Version 1 of the API
        let v1 = new APIGTW.CfnResource(this, props.getApplicationName() + "APIv1", {
            parentId: this.api.attrRootResourceId
            , pathPart: 'v1'
            , restApiId: this.api.ref
        });




        /**
         * SESSION resource /session
         * GET {no parameter} - returns session data from ssm.parameter /ssm/session
         * 
         */
        let session = new APIGTW.CfnResource(this, props.getApplicationName() + "APIv1session", {
            parentId: v1.ref
            , pathPart: 'session'
            , restApiId: this.api.ref
        });

        let sessionGetMethod = new APIGTW.CfnMethod(this, props.getApplicationName() + "APIv1sessionGET", {
            restApiId: this.api.ref
            , resourceId: session.ref
            , authorizationType: APIGTW.AuthorizationType.COGNITO
            , authorizerId: authorizer.ref
            , httpMethod: 'GET'
            , requestParameters: {
                'method.request.querystring.Name': true
                , 'method.request.header.Authentication': true
            }
            , requestModels: undefined
            , integration: {
                passthroughBehavior: 'WHEN_NO_MATCH'
                , integrationHttpMethod: 'POST'
                , type: 'AWS'
                , uri: 'arn:aws:apigateway:' + props.region + ':ssm:action/GetParameter'
                , credentials: apirole.roleArn
                , requestParameters: {
                    'integration.request.querystring.Name': "'/" + props.getApplicationName().toLowerCase() + "/session'"
                    , 'integration.request.header.Authentication': 'method.request.header.Authentication'
                }
                , requestTemplates: undefined
                , integrationResponses: [
                    {
                        statusCode: '200'
                        , responseParameters: {
                            'method.response.header.Access-Control-Allow-Origin': "'*'"
                        }
                        , responseTemplates: {
                            'application/json': `"$util.escapeJavaScript("$input.path('$').GetParameterResponse.GetParameterResult.Parameter.Value").replaceAll("\'",'"')"`
                        }
                    }]
            }
            , methodResponses: [
                {
                    statusCode: '200'
                    , responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': false
                    }
                    , responseModels: {
                        'application/json': 'Empty'
                    }
                }
            ]
        });

        // OPTIONS
        let sessionOptionsMethod = new APIGTW.CfnMethod(this, props.getApplicationName() + "APIv1sessionOPTIONS", {
            restApiId: this.api.ref
            , resourceId: session.ref
            , authorizationType: APIGTW.AuthorizationType.NONE
            , httpMethod: 'OPTIONS'
            , integration: {
                passthroughBehavior: 'WHEN_NO_MATCH'
                , type: 'MOCK'
                , requestTemplates: {
                    'application/json': '{\"statusCode\": 200}'
                }
                , integrationResponses: [
                    {
                        statusCode: '200'
                        , responseParameters: {
                            'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
                            , 'method.response.header.Access-Control-Allow-Methods': "'*'"
                            , 'method.response.header.Access-Control-Allow-Origin': "'*'"
                        }
                    }]
            }
            , methodResponses: [
                {
                    statusCode: '200'
                    , responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': false
                        , 'method.response.header.Access-Control-Allow-Methods': false
                        , 'method.response.header.Access-Control-Allow-Headers': false
                    }
                    , responseModels: {
                        "application/json": 'Empty'
                    }
                }
            ]
        });

        /**
         * Websocket resource /websocket
         * GET {no parameter} - returns websocketURL data from ssm.parameter /ssm/websocket
         * 
         */
      let websocketResourceOnRESTAPI = new APIGTW.CfnResource(this, props.getApplicationName() + "APIv1websocket", {
            parentId:  v1.ref
          , pathPart: 'websocket'
          , restApiId: this.api.ref
      });

      let websocketGetMethod = new APIGTW.CfnMethod(this, props.getApplicationName() + "APIv1websocketGET", {
            restApiId: this.api.ref
          , resourceId: websocketResourceOnRESTAPI.ref
          , authorizationType: APIGTW.AuthorizationType.COGNITO
          , authorizerId: authorizer.ref
          , httpMethod: 'GET'
          , requestParameters: {
                'method.request.querystring.Name': true
              , 'method.request.header.Authentication': true
          }
          , requestModels : undefined
          , integration: {
              passthroughBehavior: 'WHEN_NO_MATCH'
              , integrationHttpMethod: 'POST'
              , type: 'AWS'
              , uri: 'arn:aws:apigateway:' + props.region + ':ssm:action/GetParameter'
              , credentials: apirole.roleArn
              , requestParameters: {
                    'integration.request.querystring.Name': "'/" + props.getApplicationName().toLowerCase() + "/websocket'"
                  , 'integration.request.header.Authentication': 'method.request.header.Authentication'
              }
              , requestTemplates : undefined
              , integrationResponses: [
                  {
                      statusCode: '200'
                      , responseParameters: {
                          'method.response.header.Access-Control-Allow-Origin': "'*'"
                      }
                      , responseTemplates: {
                          'application/json': `"$util.escapeJavaScript("$input.path('$').GetParameterResponse.GetParameterResult.Parameter.Value").replaceAll("\'",'"')"`
                      }
                  }]
          }
          , methodResponses: [
              {
                  statusCode: '200'
                  , responseParameters: {
                      'method.response.header.Access-Control-Allow-Origin': false
                  }
                  , responseModels: {
                         'application/json': 'Empty'
                  }
              }
          ]
      });

      // OPTIONS
      let websocketOptionsMethod = new APIGTW.CfnMethod(this, props.getApplicationName() + "APIv1websocketOPTIONS", {
          restApiId: this.api.ref
          , resourceId: websocketResourceOnRESTAPI.ref
          , authorizationType: APIGTW.AuthorizationType.NONE
          , httpMethod: 'OPTIONS'
          , integration: {
              passthroughBehavior: 'WHEN_NO_MATCH'
              , type: 'MOCK'
              , requestTemplates: {
                  'application/json': '{\"statusCode\": 200}'
              }
              , integrationResponses: [
                  {
                      statusCode: '200'
                      , responseParameters: {
                          'method.response.header.Access-Control-Allow-Headers' : "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
                          ,'method.response.header.Access-Control-Allow-Methods' : "'*'"
                          ,'method.response.header.Access-Control-Allow-Origin' : "'*'"
                      }
                  }]
          }
          , methodResponses: [
              {
                  statusCode: '200'
                  , responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': false
                      , 'method.response.header.Access-Control-Allow-Methods': false
                      , 'method.response.header.Access-Control-Allow-Headers': false
                  }
                  , responseModels: {
                      "application/json": 'Empty'
                  }
              }
          ]
      });

        /**
         * CONFIG 
         * Resource: /config
         * Method: GET 
         * Request Parameters : none
         * Response format:
            {
            "Parameters": [
                {
                "Name": "/<app>/clientid",
                "Value": "4tfe5l26kdp59tc4k4v0b688nm"
                },
                {
                "Name": "/<app>/identitypoolid",
                "Value": "<region>:17092df6-7e3a-4893-4d85-c6de33cdfabc"
                },
                {
                "Name": "/<app>>/userpoolid",
                "Value": "<region>_ueLfdaSXi"
                },
                {
                "Name": "/<app>>/userpoolurl",
                "Value": "cognito-idp.<region>>.amazonaws.com/<region>_ueLfdaSXi"
                }
            ]
            }
         */
        let config = new APIGTW.CfnResource(this, props.getApplicationName() + "APIv1config", {
            parentId: v1.ref
            , pathPart: 'config'
            , restApiId: this.api.ref
        });

        // GET
        let configGetMethod = new APIGTW.CfnMethod(this, props.getApplicationName() + "APIv1configGET", {
            restApiId: this.api.ref
            , resourceId: config.ref
            , authorizationType: APIGTW.AuthorizationType.NONE
            , httpMethod: 'GET'
            , requestParameters: {
                'method.request.header.Content-Type': true
                , 'method.request.header.X-Amz-Target': true
            }
            , requestModels: {
                'application/json': apiModelGetParametersRequest.ref
            }
            , integration: {
                integrationHttpMethod: 'POST'
                , type: 'AWS'
                , uri: 'arn:aws:apigateway:' + props.region + ':ssm:path//'
                , credentials: apirole.roleArn
                , requestParameters: {
                    'integration.request.header.Content-Type': "'application/x-amz-json-1.1'"
                    , 'integration.request.header.X-Amz-Target': "'AmazonSSM.GetParameters'"
                }
                , requestTemplates: {
                    'application/json': '{"Names" : [' +
                        '"/' + props.getApplicationName().toLowerCase() + '/userpoolid",' +
                        '"/' + props.getApplicationName().toLowerCase() + '/userpoolurl",' +
                        '"/' + props.getApplicationName().toLowerCase() + '/clientid",' +
                        '"/' + props.getApplicationName().toLowerCase() + '/identitypoolid"' +
                        ']}'
                }
                , passthroughBehavior: 'WHEN_NO_TEMPLATES'
                , integrationResponses: [
                    {
                        statusCode: '200'
                        , responseParameters: {
                            'method.response.header.Access-Control-Allow-Origin': "'*'"
                        }
                        , responseTemplates: {
                            'application/json': `
                                #set($inputRoot = $input.path('$'))
                                {
                                    "Parameters" : [
                                        #foreach($elem in $inputRoot.Parameters)
                                        {
                                            "Name" : "$elem.Name",
                                            "Value" :  "$util.escapeJavaScript("$elem.Value").replaceAll("'",'"')"
                                        } 
                                        #if($foreach.hasNext),#end
                                    #end
                                ]
                                }`
                        }
                    }]
            }
            , methodResponses: [
                {
                    statusCode: '200'
                    , responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true
                    }
                    , responseModels: {
                        'application/json': 'Empty'
                    }
                }
            ]
        });


        // OPTIONS
        let configOptionsMethod = new APIGTW.CfnMethod(this, props.getApplicationName() + "APIv1configOPTIONS", {
            restApiId: this.api.ref
            , resourceId: config.ref
            , authorizationType: APIGTW.AuthorizationType.NONE
            , httpMethod: 'OPTIONS'
            , integration: {
                passthroughBehavior: 'when_no_match'
                , type: 'MOCK'
                , requestTemplates: {
                    'application/json': `{\"statusCode\": 200}`
                }
                , integrationResponses: [
                    {
                        statusCode: '200'
                        , responseParameters: {
                            'method.response.header.Access-Control-Allow-Origin': "'*'"
                            , 'method.response.header.Access-Control-Allow-Methods': "'*'"
                            , 'method.response.header.Access-Control-Allow-Headers': "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
                        }
                    }]
            }
            , methodResponses: [
                {
                    statusCode: '200'
                    , responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true
                        , 'method.response.header.Access-Control-Allow-Methods': true
                        , 'method.response.header.Access-Control-Allow-Headers': true
                    }
                    , responseModels: {
                        'application/json': 'Empty'
                    }
                }
            ]
        });

        /**
         * ALLOCATE 
         * Resource: /allocate
         * Method: POST
         * Request format: { 'Username' : '<the user name>'}
         */
        let allocate = new APIGTW.CfnResource(this, props.getApplicationName() + "APIv1allocate", {
            parentId: v1.ref
            , pathPart: 'allocate'
            , restApiId: this.api.ref
        });


        let lambdaAllocate = (<Lambda.Function>props.getParameter('lambda.allocate'));

        // POST
        let allocatePostMethod = new APIGTW.CfnMethod(this, props.getApplicationName() + "APIv1allocatePOST", {
            restApiId: this.api.ref
            , resourceId: allocate.ref
            , authorizationType: APIGTW.AuthorizationType.COGNITO
            , authorizerId: authorizer.ref
            , httpMethod: 'POST'
            , integration: {
                passthroughBehavior: 'WHEN_NO_MATCH'
                , integrationHttpMethod: 'POST'
                , type: 'AWS_PROXY'
                , uri: 'arn:aws:apigateway:' + props.region + ':lambda:path/2015-03-31/functions/' + lambdaAllocate.functionArn + '/invocations'
                , credentials: apirole.roleArn
                //  , uri: 'arn:aws:apigateway:' + props.region + ':lambda:path/2015-03-31/functions/' + props.getParameter('lambda.allocate') + '/invocations'
            }
            , methodResponses: [
                {
                    statusCode: '200'
                }
            ]
        });

        /* TO BE IMPLEMENTED ON CDK
                lambdaAllocate.addEventSource(
                    new ApiEventSource( 'POST','/v1/allocate',{
                           authorizationType : APIGTW.AuthorizationType.COGNITO
                         , authorizerId : authorizer.ref
                    })
                );
        */

        // OPTIONS
        let allocateOptionsMethod = new APIGTW.CfnMethod(this, props.getApplicationName() + "APIv1allocateOPTIONS", {
            restApiId: this.api.ref
            , resourceId: allocate.ref
            , authorizationType: APIGTW.AuthorizationType.NONE
            , httpMethod: 'OPTIONS'
            , integration: {
                passthroughBehavior: 'WHEN_NO_MATCH'
                , type: 'MOCK'
                , requestTemplates: {
                    'application/json': `{\"statusCode\": 200}`
                }
                , integrationResponses: [
                    {
                        statusCode: '200'
                        , responseParameters: {
                            'method.response.header.Access-Control-Allow-Origin': "'*'"
                            , 'method.response.header.Access-Control-Allow-Methods': "'*'"
                            , 'method.response.header.Access-Control-Allow-Headers': "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
                        }
                    }]
            }
            , methodResponses: [
                {
                    statusCode: '200'
                    , responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true
                        , 'method.response.header.Access-Control-Allow-Methods': true
                        , 'method.response.header.Access-Control-Allow-Headers': true
                    }
                    , responseModels: {
                        'application/json': 'Empty'
                    }
                }
            ]
        });


        /**
         * DEALLOCATE 
         * Resource: /deallocate
         * Method: POST
         * Request format: { 'Username' : '<the user name>'}
         */
        let deallocate = new APIGTW.CfnResource(this, props.getApplicationName() + "APIv1deallocate", {
            parentId: v1.ref
            , pathPart: 'deallocate'
            , restApiId: this.api.ref
        });

        // POST
        let deallocatePostMethod = new APIGTW.CfnMethod(this, props.getApplicationName() + "APIv1deallocatePOST", {
            restApiId: this.api.ref
            , resourceId: deallocate.ref
            , authorizationType: APIGTW.AuthorizationType.COGNITO
            , authorizerId: authorizer.ref
            , httpMethod: 'POST'
            , integration: {
                integrationHttpMethod: 'POST'
                , type: 'AWS_PROXY'
                , contentHandling: "CONVERT_TO_TEXT"
                , uri: 'arn:aws:apigateway:' + props.region + ':lambda:path/2015-03-31/functions/' + props.getParameter('lambda.deallocate') + '/invocations'
                , credentials: apirole.roleArn
            }
            , methodResponses: [
                {
                    statusCode: '200'
                }
            ]
        });


        // OPTIONS
        let deallocateOptionsMethod = new APIGTW.CfnMethod(this, props.getApplicationName() + "APIv1deallocateOPTIONS", {
            restApiId: this.api.ref
            , resourceId: deallocate.ref
            , authorizationType: APIGTW.AuthorizationType.NONE
            , httpMethod: 'OPTIONS'
            , integration: {
                passthroughBehavior: 'when_no_match'
                , type: 'MOCK'
                , requestTemplates: {
                    'application/json': `{\"statusCode\": 200}`
                }
                , integrationResponses: [
                    {
                        statusCode: '200'
                        , responseParameters: {
                            'method.response.header.Access-Control-Allow-Origin': "'*'"
                            , 'method.response.header.Access-Control-Allow-Methods': "'*'"
                            , 'method.response.header.Access-Control-Allow-Headers': "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
                        }
                    }]
            }
            , methodResponses: [
                {
                    statusCode: '200'
                    , responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true
                        , 'method.response.header.Access-Control-Allow-Methods': true
                        , 'method.response.header.Access-Control-Allow-Headers': true
                    }
                    , responseModels: {
                        'application/json': 'Empty'
                    }
                }
            ]
        });



        /**
         * SCOREBOARD 
         * Resource: /deallocate
         * Method: GET
         * Request format: 
         *      querystring: sessionId=<<Session Id>>
         * Response format:
         * {
                "Scoreboard": [
                    {
                    "Score": 7055,
                    "Level": 13,
                    "Shots": 942,
                    "Nickname": "PSC",
                    "Lives": 3
                    }..,
                ]
            }
         */
        let scoreboard = new APIGTW.CfnResource(this, props.getApplicationName() + "APIv1scoreboard", {
            parentId: v1.ref
            , pathPart: 'scoreboard'
            , restApiId: this.api.ref
        });

        // POST
        let scoreboardPostMethod = new APIGTW.CfnMethod(this, props.getApplicationName() + "APIv1scoreboardPOST", {
            restApiId: this.api.ref
            , resourceId: scoreboard.ref
            , authorizationType: APIGTW.AuthorizationType.COGNITO
            , authorizerId: authorizer.ref
            , httpMethod: 'GET'
            , requestParameters: {
                'method.request.querystring.sessionId': true
            }
            , integration: {
                integrationHttpMethod: 'POST'
                , type: 'AWS'
                , uri: 'arn:aws:apigateway:' + props.region + ':dynamodb:action/GetItem'
                , credentials: apirole.roleArn
                , requestParameters: {
                    'integration.request.querystring.sessionId': 'method.request.querystring.sessionId'
                }
                , passthroughBehavior: 'WHEN_NO_TEMPLATES'
                , requestTemplates: {
                    'application/json': `{
                        "TableName" : "`+ (<Table>props.getParameter('table.sessiontopx')).tableName + `",
                        "Key" : {
                            "SessionId" : {
                                "S" : "$input.params('sessionId')"
                            }
                        }
                    }`
                }
                , integrationResponses: [
                    {
                        statusCode: '200'
                        , responseParameters: {
                            'method.response.header.Access-Control-Allow-Origin': "'*'"
                        }
                        , responseTemplates: {
                            // This is going to be tricky to be generalized
                            'application/json':
                                `#set($scoreboard = $input.path('$.Item.TopX.L'))
                                        { 
                                        "Scoreboard" : [
                                                #foreach($gamerScore in $scoreboard)
                                                        {
                                                            "Score" : $gamerScore.M.Score.N ,
                                                            "Level" : $gamerScore.M.Level.N ,
                                                            "Shots" : $gamerScore.M.Shots.N ,
                                                            "Nickname" : "$gamerScore.M.Nickname.S" ,
                                                            "Lives" : $gamerScore.M.Lives.N
                                                        }#if($foreach.hasNext),#end
                                                
                                                #end
                                            ]
                                        }`
                        }
                    }]
            }
            , methodResponses: [
                {
                    statusCode: '200'
                    , responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true
                    }
                    , responseModels: {
                        'application/json': apiModelScoreboardResponse.ref
                    }
                }
            ]
        });


        // OPTIONS
        let scoreboardOptionsMethod = new APIGTW.CfnMethod(this, props.getApplicationName() + "APIv1scoreboardOPTIONS", {
            restApiId: this.api.ref
            , resourceId: scoreboard.ref
            , authorizationType: APIGTW.AuthorizationType.NONE
            , httpMethod: 'OPTIONS'
            , integration: {
                passthroughBehavior: 'when_no_match'
                , type: 'MOCK'
                , requestTemplates: {
                    'application/json': `{\"statusCode\": 200}`
                }
                , integrationResponses: [
                    {
                        statusCode: '200'
                        , responseParameters: {
                            'method.response.header.Access-Control-Allow-Origin': "'*'"
                            , 'method.response.header.Access-Control-Allow-Methods': "'*'"
                            , 'method.response.header.Access-Control-Allow-Headers': "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
                        }
                    }]
            }
            , methodResponses: [
                {
                    statusCode: '200'
                    , responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true
                        , 'method.response.header.Access-Control-Allow-Methods': true
                        , 'method.response.header.Access-Control-Allow-Headers': true
                    }
                    , responseModels: {
                        'application/json': 'Empty'
                    }
                }
            ]
        });


        /**
         * UPDATESTATUS
         * Resource: /updatestatus
         * Method: POST
         * Request format:
         *  body : {
         *       "Level": 1,
         *       "Lives": 3,
         *       "Nickname": "chicobento",
         *       "Score": 251,
         *       "SessionId": "X181001T215808",
         *       "Shots": 4,
         *       "Timestamp": "2018-10-10T23:57:26.137Z"
         *       }
         */
        let updateStatus = new APIGTW.CfnResource(this, props.getApplicationName() + "APIv1updatestatus", {
            parentId: v1.ref
            , pathPart: 'updatestatus'
            , restApiId: this.api.ref
        });

        // POST
        let updatestatusPostMethod = new APIGTW.CfnMethod(this, props.getApplicationName() + "APIv1updatestatusPOST", {
            restApiId: this.api.ref
            , resourceId: updateStatus.ref
            , authorizationType: APIGTW.AuthorizationType.COGNITO
            , authorizerId: authorizer.ref
            , httpMethod: 'POST'
            , requestParameters: {
                'method.request.header.Authentication': true
            }
            , integration: {
                integrationHttpMethod: 'POST'
                , type: 'AWS'
                , uri: 'arn:aws:apigateway:' + props.region + ':kinesis:action/PutRecord'
                , credentials: apirole.roleArn
                , passthroughBehavior: 'WHEN_NO_TEMPLATES'
                , requestTemplates: {
                    'application/json':
                        `#set($inputRoot = $input.path('$'))
                        {
                            "Data" : "$util.base64Encode("$input.json('$')")",
                            "PartitionKey" : $input.json('$.SessionId'),
                            "StreamName" : "`+ this.kinesisStreams.streamName + `"
                        }`
                }
                , integrationResponses: [
                    {
                        statusCode: '200'
                        , responseParameters: {
                            'method.response.header.Access-Control-Allow-Origin': "'*'"
                        }
                    }]
            }
            , methodResponses: [
                {
                    statusCode: '200'
                    , responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true
                    }
                    , responseModels: {
                        'application/json': 'Empty'
                    }
                }
            ]
        });


        // OPTIONS
        let updatestatusOptionsMethod = new APIGTW.CfnMethod(this, props.getApplicationName() + "APIv1updateStatusOPTIONS", {
            restApiId: this.api.ref
            , resourceId: updateStatus.ref
            , authorizationType: APIGTW.AuthorizationType.NONE
            , httpMethod: 'OPTIONS'
            , integration: {
                passthroughBehavior: 'when_no_match'
                , type: 'MOCK'
                , requestTemplates: {
                    'application/json': `{\"statusCode\": 200}`
                }
                , integrationResponses: [
                    {
                        statusCode: '200'
                        , responseParameters: {
                            'method.response.header.Access-Control-Allow-Origin': "'*'"
                            , 'method.response.header.Access-Control-Allow-Methods': "'*'"
                            , 'method.response.header.Access-Control-Allow-Headers': "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
                        }
                    }]
            }
            , methodResponses: [
                {
                    statusCode: '200'
                    , responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true
                        , 'method.response.header.Access-Control-Allow-Methods': true
                        , 'method.response.header.Access-Control-Allow-Headers': true
                    }
                    , responseModels: {
                        'application/json': 'Empty'
                    }
                }
            ]
        });


        let deployment = new APIGTW.CfnDeployment(this, props.getApplicationName() + "APIDeployment", {
            restApiId: this.api.ref
            , stageName: 'prod'
            , description: 'Production deployment'
        });
        deployment.addDependsOn(sessionGetMethod);
        deployment.addDependsOn(sessionOptionsMethod);
        deployment.addDependsOn(websocketGetMethod);
        deployment.addDependsOn(websocketOptionsMethod);
        deployment.addDependsOn(configGetMethod);
        deployment.addDependsOn(configOptionsMethod);
        deployment.addDependsOn(allocatePostMethod);
        deployment.addDependsOn(allocateOptionsMethod);
        deployment.addDependsOn(deallocatePostMethod);
        deployment.addDependsOn(deallocateOptionsMethod);
        deployment.addDependsOn(scoreboardPostMethod);
        deployment.addDependsOn(scoreboardOptionsMethod);
        deployment.addDependsOn(updatestatusPostMethod);
        deployment.addDependsOn(updatestatusOptionsMethod);

        this.addResource("apigtw.url","https://"+this.api.ref+".execute-api."+props.region+".amazonaws.com/prod/v1/");
    }


    updateUsersRoles(props: IParameterAwareProps) {

        let baseArn = 'arn:aws:apigateway:' + props.region + ':' + props.accountId + ':' + this.api.ref + '/prod/*/';
        let baseExecArn = 'arn:aws:execute-api:' + props.region + ':' + props.accountId + ':' + this.api.ref + '/prod/';
        let playerRole = (<IAM.Role>props.getParameter('security.playersrole'));

        playerRole.addToPolicy(
            new IAM.PolicyStatement({
                actions: ['apigateway:GET'],
                resources: [
                    baseArn + 'config',
                    baseArn + 'session',
                    baseArn + 'scoreboard'
                ]
            })
        );
        playerRole.addToPolicy(
            new IAM.PolicyStatement(
                {
                    actions: ['execute-api:Invoke'],
                    resources: [
                        baseExecArn + 'GET/config',
                        baseExecArn + 'GET/session',
                        baseExecArn + 'GET/scoreboard'
                    ]
                })
        );
        playerRole.addToPolicy(
            new IAM.PolicyStatement(
                {
                    actions: ['apigateway:POST'],
                    resources: [
                        baseArn + 'updatestatus',
                        baseArn + 'allocate',
                        baseArn + 'deallocate'
                    ]
                })
        );
        playerRole.addToPolicy(
            new IAM.PolicyStatement({
                actions: ['execute-api:Invoke'],
                resources: [
                    baseExecArn + 'POST/updatestatus',
                    baseExecArn + 'POST/allocate',
                    baseExecArn + 'POST/deallocate'
                ]
            })
        );

        let managerRole = (<IAM.Role>props.getParameter('security.managersrole'));
        managerRole.addToPolicy(
            new IAM.PolicyStatement({
                actions : [
                    "dynamodb:BatchGetItem",
                    "dynamodb:BatchWriteItem",
                    "dynamodb:PutItem",
                    "dynamodb:Scan",
                    "dynamodb:Query",
                    "dynamodb:GetItem"
                ],
                resources : [ "arn:aws:dynamodb:" + props.region + ":" + props.accountId + ":table/" + props.getApplicationName() + "*" ]

            })
        );
        managerRole.addToPolicy(
            new IAM.PolicyStatement({    
                actions : [
                    "ssm:GetParameters",
                    "ssm:GetParameter",
                    "ssm:DeleteParameters",
                    "ssm:PutParameter",
                    "ssm:DeleteParameter"
                ],
                resources : [
                    "arn:aws:ssm:" + props.region + ":" + props.accountId + ":parameter/" + props.getApplicationName().toLowerCase() + "/*"
                ]
            })
        );
        managerRole.addToPolicy(
            new IAM.PolicyStatement({
                actions : [
                    "kinesis:GetShardIterator",
                    "kinesis:DescribeStream",
                    "kinesis:GetRecords"
                ],
                resources : [ this.kinesisStreams.streamArn ]
            })
        );

        managerRole.addToPolicy(
            new IAM.PolicyStatement({
                actions: [ 'apigateway:*' ],
                resources : [ baseArn + '*' ]
            })
        );
    }

}