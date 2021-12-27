// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { Construct } from 'constructs';
import { RemovalPolicy } from 'aws-cdk-lib';
import { ResourceAwareConstruct, IParameterAwareProps } from './../resourceawarestack'
import { IBucket, Bucket, BucketProps, HttpMethods } from 'aws-cdk-lib/aws-s3';


interface IBucketCreationProps {
    bucketName : string,
    isWeb? : boolean,
    alreadyExists: boolean,
    retain : boolean
}

/**
 * StorageLayer is a construct that describes the required resources
 * to store the static data. That includes both S3 and SystemsManager.
 */
export class StorageLayer extends ResourceAwareConstruct {

    constructor(parent: Construct, name: string, props: IParameterAwareProps) {
        super(parent, name, props);
        this.createBuckets();
    }

    /**
     * This function receives the desired bucket configuration
     * and then creates (or imports) the bucket
     */
    private createBucket(props: IBucketCreationProps) : IBucket {
        let bucket : IBucket;
        if (props.alreadyExists) {
            bucket = Bucket.fromBucketArn(this, props.bucketName,'arn:aws:s3:::'+props.bucketName);      
        } else {
            var bucketProperties : BucketProps;
            if (props.isWeb) {
                if (props.retain)
                   bucketProperties  = {
                        bucketName : props.bucketName
                       ,cors : [
                           {
                               allowedHeaders : ["*"]
                               ,allowedMethods : [
                                   HttpMethods.GET,
                                   HttpMethods.PUT,
                                   HttpMethods.DELETE,
                                   HttpMethods.POST
                               ] 
                               ,allowedOrigins : ["*"]
                           }
                       ]
                       ,websiteIndexDocument : 'index.html'
                       ,websiteErrorDocument : 'error.html'
                       ,removalPolicy : RemovalPolicy.RETAIN
                    }                    
                else 
                    bucketProperties  = {
                        bucketName : props.bucketName
                        ,cors : [
                            {
                                allowedHeaders : ["*"]
                                ,allowedMethods : [
                                    HttpMethods.GET,
                                    HttpMethods.PUT,
                                    HttpMethods.DELETE,
                                    HttpMethods.POST
                                ] 
                                ,allowedOrigins : ["*"]
                            }
                        ]
                        ,websiteIndexDocument : 'index.html'
                        ,websiteErrorDocument : 'error.html'
                        ,removalPolicy : RemovalPolicy.DESTROY
                    };
                bucket = new Bucket(this, props.bucketName, bucketProperties );
            } else {
                if (props.retain) 
                    bucketProperties =  {
                         bucketName : props.bucketName
                        ,removalPolicy : RemovalPolicy.RETAIN
                    };
                else 
                    bucketProperties =  {
                        bucketName : props.bucketName
                        ,removalPolicy : RemovalPolicy.DESTROY
                    };     
                bucket = new Bucket(this,props.bucketName,bucketProperties);
            }
        }
        return bucket;
    }

    createBuckets() {
        let appBucketName = this.properties.getApplicationName().toLowerCase() + '.app';
        let rawDataBucketName = this.properties.getApplicationName().toLowerCase() + '.raw';

        let appBucket = this.createBucket( {
             bucketName : appBucketName
            ,isWeb : true
            ,alreadyExists : this.properties.getParameter('existingbuckets').includes(appBucketName)
            ,retain : true
        });
        this.addResource('appBucket',appBucket);


        let rawDataBucket = this.createBucket({
             bucketName : rawDataBucketName
            ,alreadyExists : this.properties.getParameter('existingbuckets').includes(rawDataBucketName)
            ,retain : true
        });
        this.addResource('rawDataBucket',rawDataBucket);
    }

    getRawDataBucketArn() : string {
        let rawDataBucketName = this.properties.getApplicationName().toLowerCase() + '.raw';
        return 'arn:aws:s3:::'+rawDataBucketName;
    }
}