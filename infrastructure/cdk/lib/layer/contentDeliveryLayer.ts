// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { Construct } from '@aws-cdk/core';
import { ResourceAwareConstruct, IParameterAwareProps } from './../resourceawarestack'
import { CloudFrontWebDistribution, OriginAccessIdentity } from '@aws-cdk/aws-cloudfront';
import { Bucket, BucketPolicy} from '@aws-cdk/aws-s3';
import IAM = require('@aws-cdk/aws-iam');


export class ContentDeliveryLayer extends ResourceAwareConstruct {

    constructor(parent: Construct, name: string, props: IParameterAwareProps) {
        super(parent, name, props);
        this.createDistribution(props);
    }

    private createDistribution(props: IParameterAwareProps) {

        let s3BucketOrCnfBucket = props.getParameter('appBucket');
        let appBucket = <Bucket> Bucket.fromBucketName(this, props.getApplicationName()+'ImportedBucket', s3BucketOrCnfBucket.bucketName);
        
        let cloudFrontAccessIdentity = new OriginAccessIdentity(this,this.properties.getApplicationName()+'CDNAccessId', {
            comment : "Alien Attack OAI for "+s3BucketOrCnfBucket.bucketName
        });
        appBucket.grantRead(cloudFrontAccessIdentity);
        
        
        let distribution = new CloudFrontWebDistribution(this, props.getApplicationName(),{
            originConfigs : [
                {
                    s3OriginSource : {
                        s3BucketSource: appBucket,
                        originAccessIdentity : cloudFrontAccessIdentity
                    },
                    behaviors : [ {isDefaultBehavior: true}]
                }
            ]
        });
        
                
        new BucketPolicy(this, props.getApplicationName()+'AppBucketPolicy', {
            bucket : appBucket,
        }).document.addStatements(new IAM.PolicyStatement({
            actions : [ "s3:GetObject" ],
            effect :  IAM.Effect.ALLOW,
            resources: [
                appBucket.arnForObjects("*")
            ],
            principals : [ new IAM.ArnPrincipal("arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity "+cloudFrontAccessIdentity.originAccessIdentityName) ]
        })
        );

        this.addResource("cdndomain",distribution.domainName);
    }
}