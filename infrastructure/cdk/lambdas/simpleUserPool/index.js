// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

'use strict';

const AWS = require('aws-sdk');
const CognitoISP = new AWS.CognitoIdentityServiceProvider();
const response = require('./response.js');


/**
 * 
 * @param {*} params 
 *  { 
 *      Operation : [ "UPDATE"| "CREATE" ],
 *      AppName : string, // required
 *      UserPoolName : string  // REQUIRED ONLY FOR CREATE
 *      PostConfirmationLambdaArn : string, // required
 *      UserPoolId : string // REQUIRED ONLY FOR UPDATE
 *  } 
 */

const buildParamsForOperation = function (params) {
    var paramsForOperation = {
        Policies: {
            PasswordPolicy: {
                MinimumLength: 6,
                RequireLowercase: false,
                RequireNumbers: false,
                RequireSymbols: false,
                RequireUppercase: false
            }
        },
        LambdaConfig: {
            PostConfirmation: params.PostConfirmationLambdaArn
        },
        Schema: [
            {
                Name: "website",
                AttributeDataType: "String",
                DeveloperOnlyAttribute: false,
                Mutable: true,
                Required: true,
                StringAttributeConstraints: {
                    MinLength: "0",
                    MaxLength: "2048"
                }
            },
            {
                Name: "email",
                AttributeDataType: "String",
                DeveloperOnlyAttribute: false,
                Mutable: true,
                Required: true,
                StringAttributeConstraints: {
                    MinLength: "0",
                    MaxLength: "2048"
                }
            }
        ],
        AutoVerifiedAttributes: [
            "email"
        ],
        AliasAttributes: [
            "email"
        ],
        SmsVerificationMessage: "Your verification code is {####}. ",
        EmailVerificationMessage: "Your verification code is {####}. ",
        EmailVerificationSubject: "AlienAttack environment "+ params.AppName + " sent your verification code",
        VerificationMessageTemplate: {
            SmsMessage: "Your verification code is {####}. ",
            EmailMessage: "Your verification code is {####}. ",
            EmailSubject: params.AppName + " sent your verification code",
            EmailMessageByLink: "Please click the link below to verify your email address. {##Verify Email##} ",
            EmailSubjectByLink: "AlienAttack environment " + params.AppName + " sent your verification link",
            DefaultEmailOption: "CONFIRM_WITH_LINK"
        },
        SmsAuthenticationMessage: "Your authentication code is {####}. ",
        MfaConfiguration: "OFF",
        AdminCreateUserConfig: {
            AllowAdminCreateUserOnly: false,
            UnusedAccountValidityDays: 1,
            InviteMessageTemplate: {
                "SMSMessage": "Your username is {username} and temporary password is {####}. ",
                "EmailMessage": "Your username is {username} and temporary password is {####}. ",
                "EmailSubject": params.AppName + " sent your temporary password"
            }
        }
    };
    switch (params.Operation.toUpperCase()) {
        case "CREATE":
            paramsForOperation['PoolName'] = params.UserPoolName;
            break;
        case "UPDATE":
            delete paramsForOperation.Schema;
            delete paramsForOperation.AliasAttributes;
            paramsForOperation['UserPoolId'] = params.UserPoolId;
            break;
        default:
            paramsForOperation=undefined;
    }
    return paramsForOperation;
};

/*
REQUEST TEST EXAMPLE
{
  "RequestType": "Create",
  "ResponseURL": "http://pre-signed-S3-url-for-response",
  "StackId": "arn:aws:cloudformation:us-west-2:123456789012:stack/stack-name/guid",
  "RequestId": "req1",
  "ResourceType": "Custom::TestResource",
  "LogicalResourceId": "MyTestResource",
  "ResourceProperties": {
    "AppName": "TestAppName",
    "UserPoolName": "TestAppName",
    "PostConfirmationLambdaArn": "arn:aws:lambda:us-east-2:<account>:function:NRTAPostRegistrationFn"
  }
}



*/
const createUserPool = function (createUserPoolParam, callback) {
    var params = buildParamsForOperation(
        {
            Operation: "CREATE",
            AppName: createUserPoolParam.AppName,
            UserPoolName: createUserPoolParam.UserPoolName,
            PostConfirmationLambdaArn: createUserPoolParam.PostConfirmationLambdaArn
        }
    );
    console.log('PARAMETERS FOR CREATION');
    console.log(params);
    CognitoISP.createUserPool(params, function (err, data) {
        if (err) callback(err, null);
        else callback(null, data);
    });
};

const createUserPoolDomain = function(createDomainParams, callback) {
    var params = {
        Domain : createDomainParams.UserPoolName.toLowerCase(),
        UserPoolId : createDomainParams.UserPoolId
    };
    CognitoISP.createUserPoolDomain(params,callback);
};

/*
REQUEST TEST EXAMPLE
{
  "RequestType": "Delete",
  "ResponseURL": "http://pre-signed-S3-url-for-response",
  "StackId": "arn:aws:cloudformation:us-west-2:123456789012:stack/stack-name/guid",
  "RequestId": "req1",
  "ResourceType": "Custom::TestResource",
  "LogicalResourceId": "MyTestResource",
  "PhysicalResourceId": "us-east-2_FjHNQMYjH",
  "ResourceProperties": {
    "AppName": "TestAppName",
    "UserPoolName": "TestAppName",
    "PostConfirmationLambdaArn": "arn:aws:lambda:us-east-2:<account>:function:NRTAPostRegistrationFn"
  }
}

*/
const deleteUserPool = function (destroyUserPoolParam, callback) {
    CognitoISP.deleteUserPool({
        UserPoolId: destroyUserPoolParam.PhysicalResourceId
    }, (err,data) => {
        if (err) {
            if (err.code == "ResourceNotFoundException") 
                // deleting an inexisting resource? return OK, it's deleted.
                callback(null,'OK');
            else callback(err,null);
        }
        else {
            callback(null,data);
        }
    });
};

const deleteUserPoolDomain = function(params,callback) {
    CognitoISP.deleteUserPoolDomain({
        Domain : params.Domain,
        UserPoolId : params.UserPoolId
    }, callback);
};


/*
REQUEST TEST EXAMPLE
{
  "RequestType": "Update",
  "ResponseURL": "http://pre-signed-S3-url-for-response",
  "StackId": "arn:aws:cloudformation:us-west-2:123456789012:stack/stack-name/guid",
  "RequestId": "rea1",
  "ResourceType": "Custom::TestResource",
  "LogicalResourceId": "MyTestResource",
  "COMMENT": "### BEFORE RUNNING UPDATE THE PhysicalResourceId ###",
  "PhysicalResourceId": "us-east-2_FjHNQMYjH",
  "ResourceProperties": {
    "AppName": "TestAppNameXPTO",
    "UserPoolName": "TestAppName",
    "PostConfirmationLambdaArn": "arn:aws:lambda:us-east-2:<account>:function:NRTAPostRegistrationFn"
  },
  "OldResourceProperties": {
    "AppName": "TestAppName",
    "UserPoolName": "TestAppName",
    "PostConfirmationLambdaArn": "arn:aws:lambda:us-east-2:<account>:function:NRTAPostRegistrationFn"
  }
}

*/
const updateUserPool = function (updateUserPoolParam, callback) {
    console.log('updateUserPoolParam.OldResourceProperties.UserPoolName:',updateUserPoolParam.OldResourceProperties.UserPoolName);
    console.log('updateUserPoolParam.ResourceProperties.UserPoolName:',updateUserPoolParam.ResourceProperties.UserPoolName);
    if (updateUserPoolParam.OldResourceProperties.UserPoolName != updateUserPoolParam.ResourceProperties.UserPoolName) {
        // UserPoolName cannot be updated
        console.log('UserPoolName cannot be updated');
        let err = new Error('UserPoolName cannot be changed.');
        err['OldName'] = updateUserPoolParam.OldResourceProperties.UserPoolName;
        err['NewName'] = updateUserPoolParam.ResourceProperties.UserPoolName;
        callback(err, null);
    } else {
        console.log('Updating');
        let appName = updateUserPoolParam.ResourceProperties.AppName;
        let postConfirmationLambdaArn = updateUserPoolParam.ResourceProperties.PostConfirmationLambdaArn;
        let userPoolId = updateUserPoolParam.PhysicalResourceId;
        var updateUserPoolParams = buildParamsForOperation(
            {
                Operation: "UPDATE",
                AppName: appName,
                PostConfirmationLambdaArn: postConfirmationLambdaArn,
                UserPoolId: userPoolId
            }
        );
        console.log('PARAMETERS FOR UPDATE');
        console.log(updateUserPoolParams);
        CognitoISP.updateUserPool(updateUserPoolParams, callback);
    }
};


exports.handler = (event, context, callback) => {
    var DEBUG=undefined;
    if (DEBUG) console.log('DEBUG MODE ON');

    var notifyCompletion = function(completionResponse) {
        console.log("NOTIFYING COMPLETION");
        console.log(JSON.stringify(completionResponse));
        if (DEBUG) {
            callback(null,completionResponse);
        }
        else response.send(event,context,completionResponse.Status,completionResponse.Data,completionResponse.PhysicalResourceId);
    };

    console.log('event:', event);
    // This will be used in the call to notifyCompletion
    var completionState = {
        // SUCCESS or FAILED
        Status : undefined,
        // Data to be returned to the CustomResource
        Data : undefined,
        // ID of the created underlying resource
        PhysicalResourceId : undefined
    };
    switch (event.RequestType.toUpperCase()) {
        case 'CREATE':
            let createParams = {
                "AppName": event.ResourceProperties.AppName,
                "UserPoolName": event.ResourceProperties.UserPoolName,
                "PostConfirmationLambdaArn": event.ResourceProperties.PostConfirmationLambdaArn
            };
            createUserPool(createParams, (err, data) => {
                if (err) {
                    console.log(err, err.stack);
                    completionState.Status = 'FAILED';
                    completionState.Data = { 'Error': err };
                } else {
                    createUserPoolDomain( {
                        UserPoolName : event.ResourceProperties.UserPoolName,
                        UserPoolId : data.UserPool.Id
                    }, (err,_) => {
                        if (err) {
                            console.log('COULD NOT CREATE USERPOOL DOMAIN. Aborting.');
                            console.log(err, err.stack);
                            completionState.Status = 'FAILED';
                            completionState.Data = { 'Error': err };
                            deleteUserPool(event,(err,data) => {
                                if (err) {
                                    console.log('COULD NOT DELETE USERPOOL AS RESULT OF PROBLEM CREATING USERPOOL DOMAIN.');
                                    console.log(err, err.stack);
                                    completionState.Status = 'FAILED';
                                    completionState.Data = { 'Error': err };
                                    notifyCompletion(completionState);
                                } else {
                                    completionState.Status = 'SUCCESS';
                                    completionState.PhysicalResourceId = data.UserPool.Id;
                                    let region = data.UserPool.Id.substring(0,data.UserPool.Id.indexOf('_'));
                                    completionState.Data = {
                                        UserPoolName :  event.ResourceProperties.UserPoolName,
                                        UserPoolId: data.UserPool.Id,
                                        UserPoolArn: data.UserPool.Arn,
                                        UserPoolProviderName : "cognito-idp."+region+".amazonaws.com/"+data.UserPool.Id
                                    };
                                    notifyCompletion(completionState);
                                }
                            });
                        } else {
                            completionState.Status = 'SUCCESS';
                            completionState.PhysicalResourceId = data.UserPool.Id;
                            let region = data.UserPool.Id.substring(0,data.UserPool.Id.indexOf('_'));
                            completionState.Data = {
                                UserPoolName :  event.ResourceProperties.UserPoolName,
                                UserPoolId: data.UserPool.Id,
                                UserPoolArn: data.UserPool.Arn,
                                UserPoolProviderName : "cognito-idp."+region+".amazonaws.com/"+data.UserPool.Id
                            };
                            notifyCompletion(completionState);
                        }
                    });
                }
            });
            break;
        case 'UPDATE':
            updateUserPool(event, (err, _) => {
                if (err) {
                    console.log(err, err.stack);
                    completionState.Status = 'FAILED';
                    completionState.Data = {
                        'Error' : err
                    };
                } else {
                        completionState.Status = 'SUCCESS';
                        completionState.PhysicalResourceId = event.PhysicalResourceId;
                        completionState.Data = {};
                }
                notifyCompletion(completionState);
            });
            break;
        case 'DELETE':
            deleteUserPoolDomain({
                Domain : event.ResourceProperties.AppName.toLowerCase(),
                UserPoolId : event.PhysicalResourceId
            },(err,_) => {
                if (err && (err.code != 'InvalidParameterException' || 
                        (err.code == 'InvalidParameterException' && err.message.indexOf("No such domain")==-1))) {
                    console.log('ERROR DELETING DOMAIN');
                    console.log(err, err.stack);
                    completionState.Status = 'FAILED';
                    completionState.Data = {'Error' : err };
                    notifyCompletion(completionState);
                } else {
                    console.log('Delete domain successful');
                    deleteUserPool(event, (err, _) => {
                        if (err) {
                            console.log('ERROR DELETING USERPOOL');
                            console.log(err, err.stack);
                            completionState.Status = 'FAILED';
                            completionState.Data = {'Error' : err };
                            notifyCompletion(completionState);
                        } else {
                            completionState.Status = 'SUCCESS';
                            completionState.PhysicalResourceId = event.PhysicalResourceId;
                            completionState.Data = {};
                            notifyCompletion(completionState);
                        }
                    });
                }
            });
            break;
        default:
            let err = new Error('Unknown RequestType:' + event.RequestType);
            console.log(err, err.stack);
            completionState.Status = 'FAILED';
            completionState.Data = {'Error' : err} ;
            notifyCompletion(completionState);
    }
};