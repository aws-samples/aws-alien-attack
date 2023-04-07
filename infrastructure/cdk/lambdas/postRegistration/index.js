// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
const {
  CognitoIdentityProvider: CognitoIdentityServiceProvider
} = require("@aws-sdk/client-cognito-identity-provider");

exports.handler = (event, _, callback) => {
    console.log(event);
    if (event && event.userPoolId && event.userName) {
      if (['PostConfirmation_ConfirmSignUp', 'PostConfirmation_AdminConfirmSignUp' ].indexOf(event.triggerSource) > -1) {
          var cognitoidentityserviceprovider = new CognitoIdentityServiceProvider();
          var params = {
            GroupName: 'Players', 
            UserPoolId: event.userPoolId, 
            Username: event.userName
          };
          cognitoidentityserviceprovider.adminAddUserToGroup(params, function(err, data) {
            if (err) {
              console.log(err);
            }
            else {
              console.log('Successfully added to group Players');
              callback(null,event);
            }
          });
      } else callback(null,event);
    }
    else {
      var err = "error in event structure";
      console.log(err);
      callback(err,event);
    }
};