// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { Construct } from 'constructs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { ResourceAwareConstruct, IParameterAwareProps } from './../resourceawarestack'
import { Function , Code, Runtime, Architecture } from 'aws-cdk-lib/aws-lambda'
import { Role, Effect, PolicyStatement, FederatedPrincipal, ServicePrincipal, ManagedPolicy } from 'aws-cdk-lib/aws-iam';

import Cognito = require('aws-cdk-lib/aws-cognito');

import path = require('path');

const lambdasLocation = path.join(__dirname, '..', '..', 'lambdas');

export class SecurityLayer extends ResourceAwareConstruct {

    userPool: Cognito.IUserPool;
    identityPool: Cognito.CfnIdentityPool;
    identityPoolId: string;
    userPoolClient: Cognito.UserPoolClient;
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
        return this.userPoolClient.userPoolClientId;
    }

    getIdentityPool() {
        return this.identityPool
    }

    getIdentityPoolId() {
        return this.identityPoolId;
    }

    constructor(parent: Construct, name: string, props: IParameterAwareProps) {
        super(parent, name, props);
        this.creatPostRegistrationLambdaTrigger();
        this.createUserPool();
        this.createIdentityPool();
        this.createUserPoolGroups();
        this.configureIdentityPoolRoles();
    }

    private createUserPool() {
        // Check if we should import an existing User Pool
        let importUserPoolId = this.properties.getParameter('importUserPoolId');
        
        if (importUserPoolId) {
            // Import existing User Pool - use fromUserPoolArn for full functionality
            const userPoolArn = `arn:aws:cognito-idp:${this.properties.region}:${this.properties.accountId}:userpool/${importUserPoolId}`;
            this.userPool = Cognito.UserPool.fromUserPoolArn(
                this, 
                this.properties.getApplicationName() + 'UserPool',
                userPoolArn
            );
            console.log('Imported existing User Pool:', importUserPoolId);
        } else {
            // Create new User Pool
            this.userPool = new Cognito.UserPool(this, this.properties.getApplicationName() + 'UserPool', {
                passwordPolicy : {
                 minLength : 6,
                 requireLowercase : false,
                 requireUppercase : false,
                 requireDigits : false,
                 requireSymbols : false
                }, 
                userPoolName : this.properties.getApplicationName(),
                standardAttributes : {
                    email : {
                        required : true,
                        mutable : true
                    },
                    website : {
                        mutable : true,
                        required : true
                    }
                },
                lambdaTriggers : {
                    postConfirmation : this.postRegistrationTriggerFunction
                },
                autoVerify : {
                    email : true
                },
                signInAliases : {
                    username : true,
                    email : true
                },
                selfSignUpEnabled : true,
                userVerification : {
                    emailSubject : `AlienAttack environment ${this.properties.getApplicationName()} sent your verification link`,
                    emailBody : "Please click the link below to verify your email address. {##Verify Email##}",
                    emailStyle : Cognito.VerificationEmailStyle.LINK
                },
                removalPolicy : RemovalPolicy.RETAIN
            });
            this.userPool.addDomain(this.properties.getApplicationName().toLowerCase(),{
                cognitoDomain : {
                    domainPrefix : this.properties.getApplicationName().toLowerCase()
                }
            });
        }
        
        this.userPoolClient = new Cognito.UserPoolClient(this,this.properties.getApplicationName()+"Client",{
            userPool : this.userPool,
            generateSecret : false,
            userPoolClientName : this.properties.getApplicationName() + 'Website',
            authFlows : {
                userSrp : true,
                userPassword: true
            }
        });
        let resetpassurl = `https://${this.properties.getApplicationName().toLowerCase()}.auth.${this.properties.region}.amazoncognito.com/forgotPassword?client_id=${this.userPoolClient.userPoolClientId}&response_type=code&redirect_uri=https%3A%2F%2Fexample.com`;
        this.addResource('security.resetpassurl',resetpassurl);
    }

    private createIdentityPool() {
        let importIdentityPoolId = this.properties.getParameter('importIdentityPoolId');
        
        if (importIdentityPoolId) {
            const importedPool = Cognito.CfnIdentityPool.fromIdentityPoolId(
                this,
                this.properties.getApplicationName() + 'IdentityPool',
                importIdentityPoolId
            );
            this.identityPool = importedPool as any as Cognito.CfnIdentityPool;
            this.identityPoolId = importIdentityPoolId;
            console.log('Imported existing Identity Pool:', importIdentityPoolId);
        } else {
            const providerName = this.userPool.userPoolProviderName || 
                `cognito-idp.${this.properties.region}.amazonaws.com/${this.userPool.userPoolId}`;
            
            this.identityPool = new Cognito.CfnIdentityPool(this, this.properties.getApplicationName() + 'IdentityPool', {
                identityPoolName: this.properties.getApplicationName(),
                allowUnauthenticatedIdentities: false,
                cognitoIdentityProviders: [
                    {
                        clientId: this.userPoolClient.userPoolClientId,
                        providerName: providerName,
                        serverSideTokenCheck: false
                    }
                ]
            })
            this.identityPool.applyRemovalPolicy(RemovalPolicy.RETAIN);
            this.identityPool.node.addDependency(this.userPool);
            this.identityPoolId = this.identityPool.ref;
        }
        this.addResource('security.identitypool', this.identityPool);
    }

    private createUserPoolGroups() {
        let importUserPoolId = this.properties.getParameter('importUserPoolId');
        
        // PLAYERS
        this.playersRole = new Role(this, this.properties.getApplicationName() + 'PlayersRole', {
            roleName: this.properties.getApplicationName() + 'PlayersRole',
            assumedBy: new FederatedPrincipal('cognito-identity.amazonaws.com', {
                "StringEquals": { "cognito-identity.amazonaws.com:aud": this.identityPoolId },
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

        if (!importUserPoolId) {
            new Cognito.CfnUserPoolGroup(this, this.properties.getApplicationName() + 'Players', {
                groupName: 'Players',
                description: 'Players of the game.',
                precedence: 9999,
                roleArn: this.playersRole.roleArn,
                userPoolId: this.userPool.userPoolId
            });
        }

        // MANAGERS
        this.managersRole = new Role(this, this.properties.getApplicationName() + 'ManagersRole', {
            roleName: this.properties.getApplicationName() + 'ManagersRole',
            assumedBy: new FederatedPrincipal('cognito-identity.amazonaws.com', {
                "StringEquals": { "cognito-identity.amazonaws.com:aud": this.identityPoolId },
                "ForAnyValue:StringLike": { "cognito-identity.amazonaws.com:amr": "authenticated" }
            }, "sts:AssumeRoleWithWebIdentity")
        });
        this.managersRole.addManagedPolicy(
            ManagedPolicy.fromManagedPolicyArn(this, 'ManagersCognitoPowerUser', 'arn:aws:iam::aws:policy/AmazonCognitoPowerUser')
        );
        let managersStatement = new PolicyStatement({ effect: Effect.ALLOW, resources: ["*"] });
        managersStatement.addActions(
            "mobileanalytics:PutEvents",
            "cognito-sync:*",
            "cognito-identity:*"
        );
        this.managersRole.addToPolicy(managersStatement);
        this.addResource('security.managersrole', this.managersRole);
        
        if (!importUserPoolId) {
            new Cognito.CfnUserPoolGroup(this, this.properties.getApplicationName() + 'Managers', {
                groupName: 'Managers',
                description: 'Managers of the game.',
                precedence: 0,
                roleArn: this.managersRole.roleArn,
                userPoolId: this.userPool.userPoolId
            });
        }
    }

    private configureIdentityPoolRoles() {
        this.unauthenticatedRole = new Role(this, this.properties.getApplicationName() + 'UnauthRole', {
            roleName: this.properties.getApplicationName() + 'UnauthRole',
            assumedBy: new FederatedPrincipal('cognito-identity.amazonaws.com', {
                "StringEquals": { "cognito-identity.amazonaws.com:aud": this.identityPoolId },
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
                identityPoolId: this.identityPoolId
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
        this.postRegistrationTriggerFunctionRole.addManagedPolicy(
            ManagedPolicy.fromManagedPolicyArn(this, 'PostRegLambdaBasicExecution', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole')
        );
        this.postRegistrationTriggerFunctionRole.addToPolicy(new PolicyStatement(
            {
                actions : [ 
                    "cognito-idp:AdminAddUserToGroup"
                ],
                resources : [
                    "*"
                ]

            }
        ));
        this.postRegistrationTriggerFunction =
            new Function(this, this.properties.getApplicationName() + 'PostRegistration', {
                runtime:  new Runtime('nodejs24.x'),
                handler: 'index.handler',
                architecture: Architecture.ARM_64,
                code: Code.fromAsset(path.join(lambdasLocation, 'postRegistration'))
                , functionName: this.properties.getApplicationName() + 'PostRegistrationFn'
                , description: 'This function adds an user to the Players group after confirmation'
                , memorySize: 128
                , timeout: Duration.seconds(60)
                , role: this.postRegistrationTriggerFunctionRole
            });
    }

}
