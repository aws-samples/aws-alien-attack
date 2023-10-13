// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } from "@aws-sdk/client-cognito-identity-provider";

const CognitoISPClient = new CognitoIdentityProviderClient();

export const handler = async (event,context) => {
    console.log(event);
    if (event && event.userPoolId && event.userName) {
      if (['PostConfirmation_ConfirmSignUp', 'PostConfirmation_AdminConfirmSignUp' ].indexOf(event.triggerSource) > -1) {
          const params = {
            GroupName: 'Players', 
            UserPoolId: event.userPoolId, 
            Username: event.userName
          };
          try {
            const command = new AdminAddUserToGroupCommand(params);
            const cognitoResponse = await CognitoISPClient.send(command);
            console.log('Cognito response:',JSON.stringify(cognitoResponse));
            console.log('Successfully added to group Players');
            return event;
          } catch (error) {
            console.log(error);
            return error;
          }
      } else return event;
    }
};