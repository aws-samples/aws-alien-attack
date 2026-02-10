// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { CognitoIdentityProviderClient, ListUserPoolsCommand } from '@aws-sdk/client-cognito-identity-provider';
import { CognitoIdentityClient, ListIdentityPoolsCommand } from '@aws-sdk/client-cognito-identity';
import crypto = require('crypto');
import fs = require('fs');
import path = require('path');


export class Utils {

    static async bucketExists(bucketName: string): Promise<boolean> {
        const s3Client = new S3Client({});
        try {
            await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
            return true;
        } catch (err: any) {
            if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
                return false;
            }
            throw err;
        }
    }

    static async findUserPoolByName(poolName: string): Promise<string | null> {
        const cognitoClient = new CognitoIdentityProviderClient({});
        try {
            const command = new ListUserPoolsCommand({ MaxResults: 60 });
            const response = await cognitoClient.send(command);
            
            if (response.UserPools) {
                const pool = response.UserPools.find(p => p.Name === poolName);
                if (pool && pool.Id) {
                    console.log(`Found User Pool: ${poolName} with ID: ${pool.Id}`);
                    return pool.Id;
                }
            }
            return null;
        } catch (err: any) {
            console.error('Error finding User Pool:', err.message);
            throw err;
        }
    }

    static async findIdentityPoolByName(poolName: string): Promise<string | null> {
        const cognitoIdentityClient = new CognitoIdentityClient({});
        try {
            const command = new ListIdentityPoolsCommand({ MaxResults: 60 });
            const response = await cognitoIdentityClient.send(command);
            
            if (response.IdentityPools) {
                const pool = response.IdentityPools.find(p => p.IdentityPoolName === poolName);
                if (pool && pool.IdentityPoolId) {
                    console.log(`Found Identity Pool: ${poolName} with ID: ${pool.IdentityPoolId}`);
                    return pool.IdentityPoolId;
                }
            }
            return null;
        } catch (err: any) {
            console.error('Error finding Identity Pool:', err.message);
            throw err;
        }
    }

    static async checkforExistingBuckets(listOfBuckets: string[]) {

        let getListOfExistingBuckets = async function (bucketList: string[]): Promise<string[]> {
            return new Promise<string[]>(async (resolve, reject) => {

                let existingBuckets: string[] = [];
                let errorList: Error[] = [];

                for (let bucketName of bucketList) {
                    await Utils.bucketExists(bucketName)
                        .then((exists) => {
                            if (exists) existingBuckets.push(bucketName);
                        })
                        .catch((error) => { errorList.push(error) });
                }
                if (errorList.length == 0) resolve(existingBuckets);
                else reject(errorList);
            })
        }

        return await getListOfExistingBuckets(listOfBuckets);
    }


    /**
 * Hashes the contents of a file or directory. If the argument is a directory,
 * it is assumed not to contain symlinks that would result in a cyclic tree.
 *
 * @param fileOrDir the path to the file or directory that should be hashed.
 *
 * @returns a SHA256 hash, base-64 encoded.
 * 
 * source: https://github.com/awslabs/aws-delivlib/blob/master/lib/util.ts
 */
    static hashFileOrDirectory(fileOrDir: string): string {
        const hash = crypto.createHash('SHA256');
        hash.update(path.basename(fileOrDir)).update('\0');
        const stat = fs.statSync(fileOrDir);
        if (stat.isDirectory()) {
            for (const item of fs.readdirSync(fileOrDir).sort()) {
                hash.update(Utils.hashFileOrDirectory(path.join(fileOrDir, item)));
            }
        } else {
            hash.update(fs.readFileSync(fileOrDir));
        }
        return hash.digest('base64');

    }
}