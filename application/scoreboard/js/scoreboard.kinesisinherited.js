// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
const LOOPING_INTERVAL_IN_MS = 1500;

class ScoreboardKinesis extends Scoreboard {

    constructor(document) {
        super(document);
        this.updateHasFinished = true;
    }

    initializeAWSServices() {
        super.initializeAWSServices();
        this.kinesis = this.awsfacade.getKinesisDataStream();
    }

    getInitializeShardIteratorFunction() {
        var self = this;
        var initializeShardIteratorFunction = function () {
            self.kinesis.getShardIterator({
                StreamName: self.appName+'_InputStream',
                ShardId: 'shardId-000000000000',
                ShardIteratorType: 'LATEST'
            }, function (err, data) {
                if (err) console.log('ERROR getShardIterator:', err);
                else {
                    console.log("Iterator renewed");
                    self.currentShardIterator = data.ShardIterator;
                }
            });
        }
        return initializeShardIteratorFunction;
    }

    run() {
        var self = this;
        super.run(self.getInitializeShardIteratorFunction(), LOOPING_INTERVAL_IN_MS);
    }

/**
 * This function asynchronously updates the scoreboard.
 * We work to reduce the amount of data to be updated by keeping only the latest 
 * updated data for each user.
 * @param {*} records 
 */
    async updateScoreboard(records) {
        console.log("Updating scoreboard")
        // activating semaphore for updates
        this.updateHasFinished = false;
        // because for every reading you can get many different records from the same user
        // we want just the most recent one;
        let arrayToBePublished = [];
        let recordsCleanup = function(record) {
            let recordAsObject = JSON.parse(new String(record.Data));
            let currentIdx = arrayToBePublished.findIndex( (r) => { return r.Nickname == recordAsObject.Nickname });
            if (currentIdx!=-1) {
                if (arrayToBePublished[currentIdx].Timestamp <= recordAsObject.Timestamp) 
                    arrayToBePublished.splice(currentIdx,1,recordAsObject);
            } else arrayToBePublished.push(recordAsObject);
        };
        records.forEach(record => {
            recordsCleanup(record);
        });
        for (const record of arrayToBePublished) {
            await this.updateArray(this.normalizeRecord(record));

        }
        // deactivating semaphore for updates
        this.updateHasFinished = true;
    }

    retrieveData(callback) {
        var self = this;
        if (this.updateHasFinished) {
            if (this.currentShardIterator) {
                var params = {
                    ShardIterator: self.currentShardIterator
                };
                self.kinesis.getRecords(params, function (err, data) {
                    if (err) {
                        console.log(err.code);
                        console.log(err);
                        switch(err.code) {
                            case "ExpiredIteratorException":
                                self.getInitializeShardIteratorFunction()();
                                callback(null,null);
                                break;
                            case "CredentialsError": 
                                self.awsfacade.refreshSession((err,data) => {
                                    if (err) {
                                        console.log(err.code);
                                        console.log(err);
                                        console.log("FAILURE REFRESHING SESSION");
                                        callback(err,null);
                                    } else {
                                        // initialize services with new credentials
                                        console.log("SESSION CREDENTIALS refreshed")
                                        self.initializeAWSServices();
                                        callback(null,data);
                                    }
                                });
                                break;
                            default:
                                callback(err,null);
                        };
                    }
                    else {
                        if (data) {
                            if (data.Records && data.Records.length > 0) 
                                self.updateScoreboard(data.Records);
                            self.currentShardIterator = data.NextShardIterator;
                            callback(null,data);
                        }
                    }
                });
            } else {
                var err = new Error("CurrentShardIterator is null.");
                err.code = "NullShardIterator";
                callback(err,null);
            }
        } else callback(null,null);
    };
}
