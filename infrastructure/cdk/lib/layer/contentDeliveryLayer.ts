// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { Construct } from 'constructs';
import { ResourceAwareConstruct, IParameterAwareProps } from './../resourceawarestack'
import { Distribution, OriginAccessIdentity } from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Bucket, BucketPolicy} from 'aws-cdk-lib/aws-s3';
import IAM = require('aws-cdk-lib/aws-iam');


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
        
        let distribution = new Distribution(this, props.getApplicationName(), {
            defaultBehavior: {
                origin: new S3Origin(appBucket, {
                    originAccessIdentity: cloudFrontAccessIdentity
                })
            }
        });
        
        let cloudFrontOAIStatement = new IAM.PolicyStatement({
            sid: "CloudFrontOAIStatement",
            actions : [ "s3:GetObject" ],
            effect :  IAM.Effect.ALLOW,
            resources: [
                appBucket.arnForObjects("*")
            ],
            principals : [ new IAM.ArnPrincipal("arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity "+cloudFrontAccessIdentity.originAccessIdentityId) ]
        });
        
       let cloudFrontOACStatement = new IAM.PolicyStatement({
            sid : "cloudFrontOACStatement",
            principals : [ new IAM.ServicePrincipal("cloudfront.amazonaws.com") ],
            actions : [ "s3:GetObject" ],
            effect :  IAM.Effect.ALLOW,
            resources: [
                appBucket.arnForObjects("*")
            ]
       });
       cloudFrontOACStatement.addCondition('StringEquals',{ 'AWS:SourceArn': `arn:aws:cloudfront::${props.accountId}:distribution/${distribution.distributionId}` });
       let bucketPolicy = new BucketPolicy(this, props.getApplicationName()+'AppBucketPolicy', {
            bucket : appBucket,
       });
       bucketPolicy.node.addDependency(distribution);
       bucketPolicy.document.addStatements(cloudFrontOACStatement);
       bucketPolicy.document.addStatements(cloudFrontOAIStatement);
       
       
        this.addResource("cdndomain",distribution.distributionDomainName);
    }
}