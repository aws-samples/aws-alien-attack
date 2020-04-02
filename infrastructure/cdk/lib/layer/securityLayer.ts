// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { Construct, Duration } from '@aws-cdk/core';
import { ResourceAwareConstruct, IParameterAwareProps } from './../resourceawarestack'
import { Function, SingletonFunction, Code, Runtime, CfnPermission } from '@aws-cdk/aws-lambda'
import { Role, Effect, PolicyStatement, FederatedPrincipal, ServicePrincipal, Policy } from '@aws-cdk/aws-iam';

import Cognito = require('@aws-cdk/aws-cognito');
import Cfn = require('@aws-cdk/aws-cloudformation');

const uuidv3 = require('uuid/v3');

const path = require('path');

const lambdasLocation = path.join(__dirname, '..', '..', 'lambdas');
export interface SimpleUserPool {
    userPoolId: string,
    userPoolUrl: string,
    userPoolArn: string,
    userPoolProviderName: string,
    userPoolName: string
}

export class SecurityLayer extends ResourceAwareConstruct {

    userPool: SimpleUserPool;
    simpleUserPool: Cfn.CustomResource;
    identityPool: Cognito.CfnIdentityPool;
    userPoolClient: Cognito.CfnUserPoolClient;
    playersRole: Role;
    managersRole: Role;
    unauthenticatedRole: Role;
    postRegistrationTriggerFunction: Function;
    postRegistrationTriggerFunctionRole: Role;


    getUserPoolId() {
        return this.userPool.userPoolId;
    }

    getUserPoolUrl() {
        let value = "cognito-idp." + (<string>this.properties.region) + ".amazonaws.com/" + this.userPool.userPoolId;
        return value;
    }


    getUserPoolArn() {
        return this.userPool.userPoolArn
    }

    getUserPoolClient() {
        return this.userPoolClient;
    }

    getUserPoolClientId(): string {
        return this.userPoolClient.ref;
    }

    getIdentityPool() {
        return this.identityPool
    }

    getIdentityPoolId() {
        return this.identityPool.ref
    }

    constructor(parent: Construct, name: string, props: IParameterAwareProps) {
        super(parent, name, props);
        this.userPool = {
            userPoolId: '',
            userPoolUrl: '',
            userPoolArn: '',
            userPoolProviderName: '',
            userPoolName: '',
        }
        this.creatPostRegistrationLambdaTrigger();
        this.createUserPool();
        this.createUserPoolClientApp();
        this.createIdentityPool();
        this.createUserPoolGroups();
        this.configureIdentityPoolRoles();
    }

    private createUserPool() {
        const CDKNAMESPACE = 'aa596cee-451b-11e9-b210-d663bd873d93';
        let genFunctionId = this.properties.getApplicationName() + 'SimpleUserPoolGenFn';
        const generatingFunction = new SingletonFunction(this, genFunctionId, {
            // To avoid collisions when running the on the same environment
            // many times, we're using uuidv3 to stick to some 'aleatory' 
            // uuid related to the genFunctionId
            uuid: uuidv3(genFunctionId, CDKNAMESPACE)
            , code: Code.asset(path.join(lambdasLocation, 'simpleUserPool'))
            , description: "Generates the UserPool using configuration not available on CDK"
            , handler: 'index.handler'
            , timeout: Duration.seconds(300)
            , runtime: Runtime.NODEJS_10_X
        });


        let generatingFunctionPolicyStatement: PolicyStatement = new PolicyStatement({
            effect: Effect.ALLOW,
            resources: ["*"]
        });
        generatingFunctionPolicyStatement.addActions(
            "cognito-idp:DeleteUserPool",
            "cognito-idp:CreateUserPool",
            "cognito-idp:UpdateUserPool",
            "cognito-idp:CreateUserPoolDomain",
            "cognito-idp:DeleteUserPoolDomain"
        );
        generatingFunction.addToRolePolicy(generatingFunctionPolicyStatement);

        this.simpleUserPool = new Cfn.CustomResource(this, this.properties.getApplicationName() + 'SimpleUserPoolCustomResource', {
            provider: Cfn.CustomResourceProvider.lambda(generatingFunction)
            , properties: {
                AppName: this.properties.getApplicationName(),
                UserPoolName: this.properties.getApplicationName(),
                PostConfirmationLambdaArn: this.postRegistrationTriggerFunction.functionArn
            }
        });

        this.userPool.userPoolId = this.simpleUserPool.getAtt('UserPoolId').toString();
        this.userPool.userPoolArn = this.simpleUserPool.getAtt('UserPoolArn').toString();
        this.userPool.userPoolProviderName = this.simpleUserPool.getAtt('UserPoolProviderName').toString();
        this.userPool.userPoolName = this.simpleUserPool.getAtt('UserPoolName').toString();

        // Gives permission for userpool to call the lambda trigger
        new CfnPermission(this, this.properties.getApplicationName() + 'UserPoolPerm', {
            action: 'lambda:invokeFunction'
            , principal: 'cognito-idp.amazonaws.com'
            , functionName: this.postRegistrationTriggerFunction.functionName
            , sourceArn: this.userPool.userPoolArn
        })

        let policy = new Policy(this, this.properties.getApplicationName() + 'TriggerFunctionPolicy', {
            policyName: 'AllowAddUserToGroup'
        });

        let policyStatement = new PolicyStatement({ effect: Effect.ALLOW, });
        policyStatement.addResources(this.userPool.userPoolArn);
        policyStatement.addActions('cognito-idp:AdminAddUserToGroup')
        policy.addStatements(policyStatement);
        this.postRegistrationTriggerFunctionRole.attachInlinePolicy(policy);
        this.addResource('security.userpool', this.userPool);
    }


    private createUserPoolClientApp() {
        this.userPoolClient = new Cognito.CfnUserPoolClient(this, this.properties.getApplicationName() + 'App', {
            userPoolId: this.userPool.userPoolId,
            clientName: this.properties.getApplicationName() + 'Website',
            generateSecret: false,
            explicitAuthFlows: ["USER_PASSWORD_AUTH"]
        });
        this.addResource('security.userpoolclient', this.userPoolClient);
    }

    private createIdentityPool() {
        this.identityPool = new Cognito.CfnIdentityPool(this, this.properties.getApplicationName() + 'IdentityPool', {
            identityPoolName: this.properties.getApplicationName(),
            allowUnauthenticatedIdentities: false,
            cognitoIdentityProviders: [
                {
                    clientId: this.userPoolClient.ref,
                    providerName: this.userPool.userPoolProviderName,
                    serverSideTokenCheck: false
                }
            ]
        })
        this.identityPool.node.addDependency(this.simpleUserPool);
        this.addResource('security.identitypool', this.identityPool);
    }

    private createUserPoolGroups() {
        // PLAYERS
        this.playersRole = new Role(this, this.properties.getApplicationName() + 'PlayersRole', {
            roleName: this.properties.getApplicationName() + 'PlayersRole',
            assumedBy: new FederatedPrincipal('cognito-identity.amazonaws.com', {
                "StringEquals": { "cognito-identity.amazonaws.com:aud": this.identityPool.ref },
                "ForAnyValue:StringLike": { "cognito-identity.amazonaws.com:amr": "authenticated" }
            }, "sts:AssumeRoleWithWebIdentity")
        });
        let playerStatement = new PolicyStatement({ effect: Effect.ALLOW, resources: ["*"] });
        playerStatement.addActions(
            "mobileanalytics:PutEvents",
            "cognito-sync:*",
            "cognito-identity:*"
        );
        this.playersRole.addToPolicy(playerStatement);
        this.addResource('security.playersrole', this.playersRole);

        new Cognito.CfnUserPoolGroup(this, this.properties.getApplicationName() + 'Players', {
            groupName: 'Players',
            description: 'Players of the game.',
            precedence: 9999,
            roleArn: this.playersRole.roleArn,
            userPoolId: this.userPool.userPoolId
        });

        // MANAGERS
        this.managersRole = new Role(this, this.properties.getApplicationName() + 'ManagersRole', {
            roleName: this.properties.getApplicationName() + 'ManagersRole',
            assumedBy: new FederatedPrincipal('cognito-identity.amazonaws.com', {
                "StringEquals": { "cognito-identity.amazonaws.com:aud": this.identityPool.ref },
                "ForAnyValue:StringLike": { "cognito-identity.amazonaws.com:amr": "authenticated" }
            }, "sts:AssumeRoleWithWebIdentity")
        });
        this.managersRole.addManagedPolicy({ managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonCognitoPowerUser' });
        let managersStatement = new PolicyStatement({ effect: Effect.ALLOW, resources: ["*"] });
        managersStatement.addActions(
            "mobileanalytics:PutEvents",
            "cognito-sync:*",
            "cognito-identity:*"
        );
        this.managersRole.addToPolicy(managersStatement);
        this.addResource('security.managersrole', this.managersRole);
        new Cognito.CfnUserPoolGroup(this, this.properties.getApplicationName() + 'Managers', {
            groupName: 'Managers',
            description: 'Managers of the game.',
            precedence: 0,
            roleArn: this.managersRole.roleArn,
            userPoolId: this.userPool.userPoolId
        });
    }

    private configureIdentityPoolRoles() {
        this.unauthenticatedRole = new Role(this, this.properties.getApplicationName() + 'UnauthRole', {
            roleName: this.properties.getApplicationName() + 'UnauthRole',
            assumedBy: new FederatedPrincipal('cognito-identity.amazonaws.com', {
                "StringEquals": { "cognito-identity.amazonaws.com:aud": this.identityPool.ref },
                "ForAnyValue:StringLike": { "cognito-identity.amazonaws.com:amr": "unauthenticated" }
            })
        });
        let policyStatement = new PolicyStatement({ effect: Effect.ALLOW, resources: ["*"] });
        policyStatement.addActions(
            "mobileanalytics:PutEvents",
            "cognito-sync:*",
            "cognito-identity:*"
        );
        this.unauthenticatedRole.addToPolicy(policyStatement);

        new Cognito.CfnIdentityPoolRoleAttachment(this, this.properties.getApplicationName() + "IDPRoles",
            {
                identityPoolId: this.identityPool.ref
                , roles: {
                    authenticated: this.playersRole.roleArn,
                    unauthenticated: this.unauthenticatedRole.roleArn
                }
                // TO-DO Identify with the team from CDK how to implement this
                /*    ,roleMappings : {
                        type: "Rules",
                        ambiguousRoleResolution: "Deny",
                        rulesConfiguration: {
                            rules: [
                                {
                                    claim: "cognito:preferred_role",
                                    matchType: "Contains",
                                    value: "Managers",
                                    roleArn: this.managersRole
                                },
                                {
                                    claim: "cognito:preferred_role",
                                    matchType: "Contains",
                                    value: "Players",
                                    roleArn: this.playersRole
                                }
                            ]
                        }
                    }
                    */
            });

    }

    private creatPostRegistrationLambdaTrigger() {

        this.postRegistrationTriggerFunctionRole = new Role(this, this.properties.getApplicationName() + 'PostRegistrationFn_Role', {
            roleName: this.properties.getApplicationName() + 'PostRegistrationFn_Role'
            , assumedBy: new ServicePrincipal('lambda.amazonaws.com')
        });
        this.postRegistrationTriggerFunctionRole.addManagedPolicy({
            managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
        });

        this.postRegistrationTriggerFunction =
            new Function(this, this.properties.getApplicationName() + 'PostRegistration', {
                runtime: Runtime.NODEJS_10_X,
                handler: 'index.handler',
                code: Code.asset(path.join(lambdasLocation, 'postRegistration'))
                , functionName: this.properties.getApplicationName() + 'PostRegistrationFn'
                , description: 'This function adds an user to the Players group after confirmation'
                , memorySize: 128
                , timeout: Duration.seconds(60)
                , role: this.postRegistrationTriggerFunctionRole
            });
    }

}