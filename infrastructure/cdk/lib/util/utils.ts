// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import AWS = require('aws-sdk');
import crypto = require('crypto');
import fs = require('fs');
import path = require('path');


export class Utils {

    static async bucketExists(bucketName: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            let params = {
                Bucket: bucketName
            }
            let sdkS3 = new AWS.S3();
            sdkS3.headBucket(params, (err, _) => {
                if (err) {
                    if (err.code == 'NotFound') resolve(false);
                    else reject(err);
                }
                else resolve(true);
            });
        })
    };

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