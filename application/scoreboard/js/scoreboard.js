// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
class Scoreboard {

    constructor(document) {
        this.header = ["Nickname", "Score", "Shots", "Level", "Lives"];
        this.document = document;
        this.currentSession = null;
        this.scoreboard = [];
        this.zeroedGamers = [];
        this.loopInterval = null;
        this.updateTable();
        this.awsfacade = new AWSFacade(AWS_CONFIG);
        this.SSM = null;
        this.DynamoDB = null;
        this.appName = AWS_CONFIG.APPNAME;
    };

    login(username, password, callback) {
        if (!username || username.trim() == '' || !password || password.trim() == '')
            callback(new Error("Username and password must be provided"), null);
        else {
            let self = this;
            this.awsfacade.login(username, password, function (err, _) {
                if (err) {
                    console.log(err.message);
                    callback(new Error("Invalid login data."), null);
                }
                else {
                    self.initializeAWSServices();
                    self.loggedin = true;
                    self.loadCurrentSession(function (err, sessionData) {
                        if (err) {
                            console.log(err);
                            callback(err, null);
                        }
                        else {
                            if (sessionData) {
                                if (DEBUG) {
                                    console.log(new Date());
                                    console.log('Scoreboard.login:sessionData:', sessionData);
                                }
                                if (sessionData.Scoreboard) {
                                    sessionData.Scoreboard.forEach((record) => {
                                        self.updateArray(self.normalizeRecord(record));
                                    });
                                };
                                self.setCurrentSession(sessionData);
                                self.run();
                            }
                            callback(null, username);
                        }
                    });
                }
            });
        }
    }

    initializeAWSServices() {
        this.SSM = this.awsfacade.getSSM();
        this.DynamoDB = this.awsfacade.getDynamoDB();
    }

    setCurrentSession(sessionData) {
        this.currentSession = sessionData;
    }

    getCurrentSession() {
        return this.currentSession;
    }

    currentSessionIsOpened() {
        return (this.currentSession && !this.currentSession.ClosingTime);
    }

    /**
     * 
     * @param {*} callback function of the type (err,sessionData)
     */
    loadCurrentSession(callback) {
        let param = {
            "Name": "/"+this.appName.toLowerCase()+"/session"
        };
        let self = this;
        this.SSM.getParameter(param,
            function (err, sessionParamResponse) {
                if (err) callback(err, null);
                else {
                    let sessionData = null;
                    try {
                        sessionData = JSON.parse(sessionParamResponse.Parameter.Value);
                        if (!sessionData || sessionData.ClosingTime)
                            // there is no open session
                            callback(null, null);
                        else {
                            // the session is open, return its data.
                            self.readSessionData(sessionData.SessionId, function (errddb, sessionDataFromDDB) {
                                if (errddb) {
                                    console.log(errddb);
                                    console.log("double check parameters in resources/js/awsconfig.js is UPPERCASE")
                                    alert(errddb);
                                } else {
                                    if (!sessionDataFromDDB) {
                                        // nobody played yet
                                        sessionDataFromDDB = sessionData;
                                        sessionDataFromDDB["Scoreboard"] = [];
                                    }
                                    callback(null, sessionDataFromDDB);
                                }
                            });
                        }
                    } catch (error) {
                        callback(error, null);
                    }
                }
            });
    }

    /**
     * Reads current session data from DynamoDB
     * @param {*} sessionId 
     * @param {*} callback 
     */
    readSessionData(sessionId, callback) {
        var getParams = {
            "TableName": this.appName+"Session",
            "Key": { "SessionId": sessionId },
            "ConsistentRead": true
        };
        this.DynamoDB.get(getParams, function (err, data) {
            if (err) {
                var errorDetails = {
                    "Error": err,
                    "ParametersToDynamoDB": getParams,
                    "ResponseFromDynamoDB": data,
                };
                callback(new Error("Error reading sessionData", errorDetails));
            }
            else {
                callback(null, data.Item);
            }
        });
    };



    /**
     * 
     * @param {*} callback 
     */
    recordSessionStart(callback) {

        let self=this;
        let createSSMRecord = function(appName,session,callback) {
            let parameter = {
                "Name": "/"+appName.toLowerCase()+"/session",
                "Type": "String",
                "Value": JSON.stringify(session),
                "Description": "Currently opened or recently closed session",
                Overwrite: true
            }
            self.SSM.putParameter(parameter,callback);
        };

        let createSessionRecord = function(appName,session,callback) {
            let newSession = {
                "SessionId" : session.SessionId,
                "OpeningTime" : session.OpeningTime,
                "Scoreboard" : [],
                "GameType" : session.GameType,
                "TotalSeats" : session.TotalSeats
            }
            let parameter = {
                "TableName" : appName+"Session",
                "Item" : newSession
            };
            self.DynamoDB.put(parameter,callback);
        };

        let createSessionControlRecord = function(appName,session,callback) {
            let newSessionControl = {
                "SessionId" : session.SessionId,
                "FinishedGamers" : [],
                "PlayingGamers" : [],
                "OccupiedSeats" : 0,
                "TotalSeats" : session.TotalSeats
            }
            let parameter = {
                "TableName" : appName+"SessionControl",
                "Item" : newSessionControl
            };
            self.DynamoDB.put(parameter,callback);
        };

        let createSessionTopXRecord = function(appName,session,callback) {
            let sessionTopX = {
                "SessionId" : session.SessionId,
                "TopX" : []
            }
            let parameter = {
                "TableName" : appName+"SessionTopX",
                "Item" : sessionTopX
            };
            self.DynamoDB.put(parameter,callback);
        };

        this.currentSession.OpeningTime = (new Date()).toJSON();
        // We are hardcoding the available session seats to keep it under the free tier for DynamoDB
        // Further implementations should be able to scale the shars
        // TODO AUTOMATE THE SESSION LIMITS
        this.currentSession.TotalSeats = 150;
        let session=this.currentSession;
        let appName=this.appName;
        createSSMRecord(appName, session, (error,_) => {
            if (error) callback(error);
            else {
                createSessionRecord(appName, session, (error,_) => {
                    if (error) callback(error);
                    else {
                        createSessionControlRecord(appName, session, (error,_) => {
                            if (error) callback(error);
                            else {
                                createSessionTopXRecord(appName,session, (error,_) => {
                                    if (error) callback(error);
                                    else callback(null,session.SessionId);
                                })
                            }
                        })
                    }
                })
            }
        });
    };

    recordSessionEnding(callback) {
        this.currentSession.ClosingTime = (new Date()).toJSON();
        let self=this;
        let recordSessionEndingSSM = function(session,callback) {
            let currentSessionToSSM = Object.assign({},session);
            delete currentSessionToSSM.Scoreboard;
            var putParameterParam = {
                'Name': "/"+self.appName.toLowerCase()+'/session',
                'Type': 'String',
                'Value': JSON.stringify(currentSessionToSSM),
                'Description': 'Currently opened or recently closed session',
                 Overwrite: true
            }
            self.SSM.putParameter(putParameterParam,callback);
        };

        let updateSessionClosingTimeDDB = function(session,callback) {
            self.readSessionData(session.SessionId, (error, sessionInfo) => {
                if (error) callback(error, null);
                else {
                    sessionInfo.ClosingTime = session.ClosingTime;
                    let putParameter = {
                        'TableName': self.appName+'Session',
                        'Item': sessionInfo
                    };
                    self.DynamoDB.put(putParameter, (error, data) => {
                            if (error) callback(error, null);
                            else {
                                callback(null, data);
                            }
                        }
                    );
                } 
            });
        }

        recordSessionEndingSSM(this.currentSession,(error,_) => {
            if (error) callback(err);
            else updateSessionClosingTimeDDB(self.currentSession, (error,_) => {
                callback(error);
            });
        });
    }


    start(gameTypeDetails, callback) {
        /*  
            { SessionId : xxxxx, Timestamp: '2018-07-12T13:43:08.024Z', Nickname: 'John', Lives: 3, Score: 150, Shoots: 5, Level: 1 },
            { SessionId : xxxxx,Timestamp: '2018-07-12T13:43:08.024Z', Nickname: 'Mary', Lives: 2, Score: 125, Shoots: 5, Level: 1 },
            { SessionId : xxxxx,Timestamp: '2018-07-12T13:43:08.024Z', Nickname: 'Louis', Lives: 2, Score: 175, Shoots: 10, Level: 1 },
            { SessionId : xxxxx, Timestamp: '2018-07-12T13:43:08.024Z', Nickname: 'Jane', Lives: 3, Score: 150, Shoots: 50, Level: 1 },
            { SessionId : xxxxx,Timestamp: '2018-07-12T13:43:08.024Z', Nickname: 'Louise', Lives: 2, Score: 150, Shoots: 50, Level: 1 } 
        */
        let self = this;
        let synchronizeGameSessions = function(session, callback) {
            let listeners = {
                messageCallback: (event) => {
                    if (event.data != 'start') console.error("Unknown Message received through websocket: ", event);
                    else console.info("Success sending messages");
                },
                closeCallback: (event) => {
                    console.log(event);
                    if (event.code == 1001) {
                        ApiGatewayWebSocket.prototype.reConnect();
                    }
                }
            };
            self.webSocket = new ApiGatewayWebSocket(self.awsfacade, listeners, function(err,_) {
                if (err) {
                    console.log('Error creating websocket: ', err);
                    callback(err);
                } else callback();
            });
        }            
        this.scoreboard = [];
        this.zeroedGamers = [];
        this.loopInterval = null;
        if (gameTypeDetails.Synchronized && (gameTypeDetails.GameType == 'SINGLE_TRIAL' || gameTypeDetails.GameType == 'TIME_CONSTRAINED')) {
            synchronizeGameSessions(gameTypeDetails.SessionId, (err,_) => {
                if (err && callback) callback(null, false);//callback(false); // Maybe add some sort of modal or something to notify the websocket doesnt work
                else if(callback) callback(null, true); 
            });
        }
        this.updateTable();
        this.currentSession = gameTypeDetails;
        this.recordSessionStart(function (err, sessionName) {
            if (err) console.log(err);
            else console.log('Session started:', sessionName);
        });
        this.run();
    };

    sync() {
        if (this.webSocket != null && this.webSocket.isOpen()) {
            this.webSocket.sendMessage({
                'action': 'start-game'
            });
        } else console.error(new Error('Websocket not Open'));
    }

    stop() {
        clearInterval(this.loopInterval);
        this.recordSessionEnding( (err, data) => {
            if (err) {
                alert(err);
                console.log(data);
            } else {
                alert('Game finished');
            }
        });
    }

    retrieveData() {
        throw new Error("NOT IMPLEMENTED");
    }

    moveToLogin() {
        clearInterval(this.loopInterval);
        console.log("MOVE TO LOGIN");
        this.document.getElementById('TimerDiv').style.display = 'none';
        this.document.getElementById('LoginDiv').style.display = 'block';
        this.document.getElementById('SessionNameDiv').style.display = 'none';
        this.document.getElementById('GameTypeSelectionDiv').style.display = 'none';
        this.document.getElementById('StartStopButtons').style.display = 'none';
        this.document.getElementById('scoreboard').style.display = 'block';
        this.document.getElementById('txtUsername').value = '';
        this.document.getElementById('txtPassword').value = '';
        this.document.getElementById('txtSessionName').value = '';
        this.document.getElementById('txtSessionName').readOnly = false;
        this.document.getElementById('CurrentSessionDetailsDiv').style.display = 'block';
    }

    run(preLoopFunction, intervalInMs) {
        var self = this;
        var toRun = this.retrieveData.bind(this);
        var toRunWrapper = function() {
            if (AWS.config.credentials.needsRefresh()) {
                self.awsfacade.refreshSession((error,_) => {
                    if (error) {
                        console.log(error.code);
                        console.log(error);
                        self.moveToLogin();
                    } else {
                        console.log(new Date()," Session Refreshed.");
                        toRun((error,_) => {
                            if (error) {
                                console.log(error.code);
                                console.log(error);
                                self.moveToLogin();
                            }
                        });
                    }
                });
            } 
            else 
                toRun((error,_) => {
                    if (error) {
                        console.log(error.code);
                        console.log(error);
                        self.moveToLogin();
                    }
                });
        };
    
        if (preLoopFunction) {
            if (typeof preLoopFunction === "function") preLoopFunction()
            else throw new Error("preLoopFunction must be a function. Type is " + (typeof preLoopFunction));
        };
        self.loopInterval = setInterval(toRunWrapper, intervalInMs);
    }

    /**
     * Remove properties that are not relevant for the Scoreboard
     * @param {*} record 
     */
    normalizeRecord(record) {
        if (record) {
            delete record.SessionId;
        };
        return record;
    }

    updateArray(newValue) {
        var gamerIdx = this.scoreboard.findIndex((e) => { return e.Nickname == newValue.Nickname });
        if (gamerIdx == -1) {
            this.scoreboard.push(newValue);
            this.updateTable();
        }
        else {
            var gamerItem = this.scoreboard[gamerIdx];
            if (newValue.Timestamp > gamerItem.Timestamp)
            // because kinesis can deliver more than once, 
            // we want to guarantee that we will only expend time in inserting new data
            {
                this.scoreboard.splice(gamerIdx, 1, newValue);
                this.updateTable();
            }
        }
    }
  
    updateTable() {
        var self = this;
        this.sort(function () {
            var table = self.document.createElement("table");
            table.setAttribute('id', "scoreboardtable");
            var tr = table.insertRow(-1);

            for (var i = 0; i < self.header.length; i++) {
                var th = self.document.createElement("th");
                th.innerHTML = self.header[i];
                tr.appendChild(th);
            }

            // ADD JSON DATA TO THE TABLE AS ROWS.
            for (var i = 0; i < self.scoreboard.length; i++) {
                tr = table.insertRow(-1);
                for (var j = 0; j < self.header.length; j++) {
                    var tabCell = tr.insertCell(-1);
                    tabCell.innerHTML = self.scoreboard[i][self.header[j]];
                }
            }

            var divContainer = self.document.getElementById("scoreboard");
            if (divContainer.childNodes[0]) divContainer.removeChild(divContainer.childNodes[0]);
            divContainer.innerHTML = "";
            divContainer.appendChild(table);
        });
    }

    sort(callback) {
        this.scoreboard.sort(GameUtils.scoreboardSortingFunction);
        callback();
    };
}