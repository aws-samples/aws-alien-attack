// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
class ScoreboardDynamo extends Scoreboard {


    initializeAWSServices() {
        this.DynamoDB = new AWS.DynamoDB.DocumentClient();
    }

    run() {
        var self = this;
        var preLoopFunction = function () {
            self.kinesis.getShardIterator({
                StreamName: self.appName+'_InputStream',
                ShardId: 'shardId-000000000000',
                ShardIteratorType: 'LATEST'
            }, function (err, data) {
                if (err) console.log('ERROR getShardIterator:', err);
                else {
                    self.currentShardIterator = data.ShardIterator;
                }
            });
        };
        super.run(preLoopFunction, 1000);
    }

    retrieveData() {
        var getParams = {
            "TableName": this.appName+"Session",
            "Key": { "SessionId": this.sessionDetails.SessionId },
            "ConsistentRead": "true"
        };
        var self = this;
        this.DynamoDB.get(getParams, function (err, data) {
            if (err) {
                console.log("ERROR");
                console.log(JSON.stringify(err))
            } else {
                data.Item.Scoreboard.forEach(function (record) {
                    self.updateArray(record);
                });;
            }
        });
    }

}