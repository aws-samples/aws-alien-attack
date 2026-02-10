#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import cdk = require('aws-cdk-lib');

import { MainLayer } from '../lib/layer/mainLayer';
import { NRTAProps } from '../lib/nrta';
import { Utils } from '../lib/util/utils'


const app = new cdk.App();
let envname = app.node.tryGetContext('envname');
if (!envname) {
    console.log("****************************************************");
    console.log("ERROR: your environment name is undefined.\n");
    console.log("Please run the command like this:");
    console.log("cdk [synth|deploy|destroy] -c envname=<your environment name>");
    console.log("****************************************************");
    process.exit(1);
}
else envname=envname.toUpperCase();
console.log('# Environment name:',envname);
var initProps = new NRTAProps();
initProps.setApplicationName(envname);

let setApplicationProperty = (propName : string, description: string) => {
    let envproperty = app.node.tryGetContext(propName);
    if (envproperty) {
        console.log('# '+description+' is going to be deployed: YES');
        initProps.addParameter(propName,true);
    } else {
        console.log('# '+description+' is going to be deployed: NO');
    };
}

// Getting other possible context names
// FOR THE CDN DEPLOYMENT
setApplicationProperty("deploycdn","Cloudfront");

// Getting other possible context names
// FOR SSM PARAMETER
setApplicationProperty("sessionparameter","SSM Parameter Session");

// Getting other possible context names
// FOR KINESIS DATA STREAMS INTEGRATION
setApplicationProperty("kinesisintegration","Kinesis Data Streams integration");

// Getting other possible context names
// FOR KINESIS FIREHOSE
setApplicationProperty("firehose","Kinesis Firehose");

// Getting context for importing existing Cognito resources
let importCognitoName = app.node.tryGetContext('importCognito');

Utils.checkforExistingBuckets(initProps.getBucketNames())
    .then((listOfExistingBuckets) => {
        if (listOfExistingBuckets && listOfExistingBuckets.length > 0)
            console.log("# The following buckets are NOT being created because they already exist: ", listOfExistingBuckets);
        initProps.addParameter('existingbuckets', listOfExistingBuckets);
        
        // Check for existing Cognito resources if import name is provided
        if (importCognitoName) {
            console.log('# Checking for existing Cognito resources with name:', importCognitoName);
            return Promise.all([
                Utils.findUserPoolByName(importCognitoName),
                Utils.findIdentityPoolByName(importCognitoName)
            ]).then(([userPoolId, identityPoolId]) => {
                if (userPoolId) {
                    console.log('# Importing existing User Pool:', userPoolId);
                    initProps.addParameter('importUserPoolId', userPoolId);
                } else {
                    console.log('# User Pool not found, will create new one');
                }
                
                if (identityPoolId) {
                    console.log('# Importing existing Identity Pool:', identityPoolId);
                    initProps.addParameter('importIdentityPoolId', identityPoolId);
                } else {
                    console.log('# Identity Pool not found, will create new one');
                }
                
                return initProps;
            });
        }
        
        return Promise.resolve(initProps);
    })
    .then((props) => {
        new MainLayer(app, props.getApplicationName(), props);
    })
    .catch((errorList) => {
        console.log(errorList);
    });