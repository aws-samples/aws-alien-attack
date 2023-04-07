// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
'use strict';
const AWS = require('aws-sdk'),
      {
          CognitoIdentityProvider: CognitoIdentityServiceProvider
      } = require("@aws-sdk/client-cognito-identity-provider"),
      {
          SSMClient
      } = require("@aws-sdk/client-ssm");
if (!AWS.config.region) AWS.config.region = 'us-east-1';
const COGNITO = new CognitoIdentityServiceProvider();
const SSM = new SSMClient();

class AlienAttackGameInit {

    constructor() {
        this.UserPoolId = null;
    };

    getUserPoolId(callback) {
        if (this.UserPoolId == null) {
            var self = this;
            SSM.getParameters( { 'Names' : [ 'alienattack.userpoolid' ] }, (err,data) => {
                if (err) {
                    console.log('Error reading alienattack.userpoolid');
                    console.log(err);
                    callback(null);
                } else {
                    if (data.Parameters.length == 0) console.log('Error - parameter name not found');
                    else {
                        self.UserPoolId = data.Parameters[0].Value;
                    }
                    callback(self.UserPoolId);
                }
            });
        }
        else callback(this.UserPoolId);
    }


    resetUsers(callback) {
        var self = this;
        var resetUserAttributes = function(userlist, cbk, withError,withSuccess) {
            if (!withError) withError = [];
            if (!withSuccess) withSuccess = [];
            if (userlist.length==0) {
                var response = {
                    'withError' : withError,
                    'withSuccess' : withSuccess
                };
                if (withError.length == 0) cbk(null,response);
                else cbk('error',response);
            }
            else {
                var user = userlist.pop();
                var param = {
                    'UserPoolId' : self.UserPoolId,
                    'Username' : user.Username,
                    'UserAttributes' : [
                        { Name : 'custom:hasAlreadyPlayed', Value : '0' }
                    ]
                };
                COGNITO.adminUpdateUserAttributes(param,function(err,data) {
                    if (err) {
                        console.log('Could not update user attribute for user ', user.Username);
                        withError.push( {
                            'Username': user.Username,
                            'Error' : err
                        });
                        resetUserAttributes(userlist,cbk, withError, withSuccess);
                    } else {
                        console.log('User attribute reset with success:', user.Username);
                        withSuccess.push( {
                            'Username': user.Username
                        });
                        resetUserAttributes(userlist,cbk, withError, withSuccess);
                    };
                });
            }
        };

        this.getUserPoolId( function(result) {
            if (!result) console.log('Could not get UserPoolId');
            else {
                var listUserParameters  =  {
                     'UserPoolId' : result
                    ,'AttributesToGet' : []
                    ,'Filter' : 'cognito:user_status = \"confirmed\"'
                }
                COGNITO.listUsers( listUserParameters, function(err,data) {
                    if (err) {
                        console.log('Error listing users');
                        console.log(err);
                    } else {
                        resetUserAttributes(data.Users,callback);
                    };
                })
            }
        })
    }

    init() {
        this.resetUsers(function(err,data) {
            if (err) {
                console.log('FAILURE');
                console.log(err);
            }
            else {
                if (data.withError.length == 0) console.log('TOTAL SUCCESS');
                else console.log('PARTIAL SUCCESS');
                console.log(data);
            }
        })
    }
};

var gi = new AlienAttackGameInit();
gi.init();