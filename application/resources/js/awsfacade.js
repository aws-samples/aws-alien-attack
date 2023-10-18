// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/**
 * reference: https://github.com/aws-amplify/amplify-js/tree/master/packages/amazon-cognito-identity-js
 */
class CognitoFacade {


    constructor(userPoolId, userPoolUrl, clientId, identityPoolId) {
        this.userPoolData = {
            UserPoolId: userPoolId,
            ClientId: clientId,
            UserPoolUrl: userPoolUrl
        };
        this.identityPoolId = identityPoolId;
        // Session is obtained after login
        this.sessionData = null;
        // The cognito user, after sign in
        this.cognitoUser = null;
        this.userPool = new AWSCognito.CognitoIdentityServiceProvider.CognitoUserPool(this.userPoolData);
        this.userAttributes = null;
        // userData = { "Username" : string, "UserAttributed" : }
        this.userData = {};
    }


    /**
     * 
     * @param {*} username 
     * @param {*} password 
     * @param {*} signupAttributes array of { "Name" : <name of attribute> , "Value" : <value for this attribute> }
     * @param {*} callback 
     */
    signUp(username, password, signupAttributes, mandatoryAttributes, callback) {
        signupAttributes.forEach((attribute) => {
            if (typeof attribute.Value == 'string') attribute.Value = attribute.Value.toLowerCase();
        })
        let providedSignupAttributes = null;
        if (signupAttributes && Array.isArray(signupAttributes)) {
            providedSignupAttributes = [];
            signupAttributes.forEach((e) => {
                providedSignupAttributes.push(new AmazonCognitoIdentity.CognitoUserAttribute(e));
            });
        }
        let mandatorySignupAttributes = null;
        if (mandatoryAttributes && Array.isArray(mandatoryAttributes)) {
            mandatorySignupAttributes = [];
            mandatoryAttributes.forEach((e) => {
                mandatorySignupAttributes.push(new AmazonCognitoIdentity.CognitoUserAttribute(e));
            });
        }
        this.userPool.signUp(username.toLowerCase(), password, providedSignupAttributes, mandatorySignupAttributes, callback);
    }

    updateAWSConfig(callback) {
        var credentialsHelper = { 'IdentityPoolId': this.identityPoolId, 'Logins': {} };
        credentialsHelper.Logins[this.userPoolData.UserPoolUrl] = this.sessionData.getIdToken().getJwtToken();
        AWS.config.credentials = new AWS.CognitoIdentityCredentials(credentialsHelper);
        AWS.config.credentials.refresh((error, data) => {
            if (error) {
                if (DEBUG) {
                    console.log(">>> ERROR REFRESHING CREDENTIALS");
                    console.log(">>> error.code:", error.code);
                    console.log(">>> error:", error);
                    if (error.code=="NotAuthorizedException") {
                        console.log(">>>credentialsHelper:",credentialsHelper);
                        console.log(">>>AWS.config.credentials:",AWS.config.credentials);
                    };  
                }
                if (callback) callback(error, null);
            } else {
                if (DEBUG) console.log(new Date(),"SESSION REFRESHED.");
                if (callback) callback(null, data);
            }
        });
    }

    login(username, password, callback) {
        var usernameForLogin = username.toLowerCase();
        var loginUserParams = { 'Username': usernameForLogin, 'Password': password };
        var authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(loginUserParams);
        var userData = {
            Pool: this.userPool,
            Username: usernameForLogin
        };
        this.cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);
        self = this;
        this.cognitoUser.authenticateUser(authenticationDetails, {
            onSuccess: function (session) {
                self.sessionData = session;
                self.updateAWSConfig((err) => {
                    if (err) callback(err);
                    else {
                        self.cognitoUser.getUserAttributes(function (err, result) {
                            if (err) {
                                self.userAttributes = {
                                    'error': err
                                };
                                callback(null, usernameForLogin);
                            }
                            else {
                                self.userAttributes = result;
                                callback(null, usernameForLogin);
                            };
                        });
                    }
                });
            },
            onFailure: function (err) {
                console.log("ERROR AUTHENTICATING USER");
                console.log(err);
                callback(err, null);
            }
        });
    }

    getCredentials() {
        var credentials = {};
        credentials.secretAccessKey = AWS.config.credentials.secretAccessKey;
        credentials.accessKeyId = AWS.config.credentials.accessKeyId;
        credentials.sessionToken = AWS.config.credentials.sessionToken;
        return credentials;
    }

    getUserAttributes(attributeName) {
        return this.userAttributes;
    }

    getSessionData() {
        return this.sessionData;
    }

    refreshCredentials(callback) {
        let refreshToken = this.sessionData.getRefreshToken();
        self = this;
        this.cognitoUser.refreshSession(refreshToken, (err, newSession) => {
            if (err) { if (callback) callback(err, null); }
            else {
                self.sessionData = newSession;
                self.updateAWSConfig(callback);
            }
        });
    }
};


class AWSFacade {

    constructor(config) {
        this.servicesConfiguration = null;
        this.API_SERVICES = [
            {
                "Resource": "config",
                "Method": "GET",
                "URL": config.API_ENDPOINT + "config",
                "AuthorizationRequired": false
            },
            {
                "Resource": "session",
                "Method": "GET",
                "URL": config.API_ENDPOINT + "session",
                "AuthorizationRequired": true
            },
            {
                "Resource": "websocket",
                "Method": "GET",
                "URL": config.API_ENDPOINT + "websocket",
                "AuthorizationRequired": true
            },
            {
                "Resource": "scoreboard",
                "Method": "GET",
                "URL": config.API_ENDPOINT + "scoreboard",
                "AuthorizationRequired": true
            },
            {
                "Resource": "updatestatus",
                "Method": "POST",
                "URL": config.API_ENDPOINT + "updatestatus",
                "Headers": [
                    { "Name": "Content-Type", "Value": "application/json" }
                ],
                "AuthorizationRequired": true
            },
            {
                "Resource": "allocate",
                "Method": "POST",
                "URL": config.API_ENDPOINT + "allocate",
                "Headers": [
                    { "Name": "Content-Type", "Value": "application/json" }
                ],
                "AuthorizationRequired": true
            },
            {
                "Resource": "deallocate",
                "Method": "POST",
                "URL": config.API_ENDPOINT + "deallocate",
                "Headers": [
                    { "Name": "Content-Type", "Value": "application/json" }
                ],
                "AuthorizationRequired": true
            }
        ];
        if (!config.region) config.region = 'us-east-1';
        AWS.config.update({ "region": config.region });
        this.cognitoFacade = null;
        this.resetPassswordUrl = config.RESET_PASS_URL;
        this.init();
    }


    init() {
        var self = this;
        this.getConfig(function (err, _) {
            if (err) console.log(err);
            else {
                let userPoolId = self.getServiceConfig('userpoolid');
                let userPoolURL = self.getServiceConfig('userpoolurl');
                let clientId = self.getServiceConfig('clientid');
                let identityPoolId = self.getServiceConfig('identitypoolid');
                self.cognitoFacade = new CognitoFacade(userPoolId, userPoolURL, clientId, identityPoolId);
            }
        });
    }

    /**
     * 
     * @param {*} request must be of type { "Resource" : <String> , ["Parameters" : <Object>] }
     * @param {*} callback 
     */
    makeAPIGatewayRequest(request, callback, sync) {
        // before anything, refreshCredentials if necessary
        if (AWS.config.credentials && AWS.config.credentials.needsRefresh()) this.refreshSession();
        let serviceDetails = null;
        let URLtoCall = null;
        if (!request || !request.Resource ||
            !(serviceDetails = this.API_SERVICES.find((e) => { return e.Resource == request.Resource }))) {
            var errorMSG = "Request is null, Request.Resource doesn't exists, or Request.Resource is invalid.";
            callback(new Error(errorMSG), request);
        } else {
            URLtoCall = serviceDetails.URL;
            let xhttp = new XMLHttpRequest();
            xhttp.onreadystatechange = function () {
                if (this.readyState == 4) {
                    if (this.status == 200) {
                        callback(null, this.responseText);
                    }
                    else callback(this.status, this.responseText);
                }
            };
            if (request.QueryStrings) URLtoCall = URLtoCall + "?" + request.QueryStrings;
            // XMLHttpRequest.open(method, url, async); by default, async is true.
            // So, by not providing "sync", we're making it true.
            xhttp.open(serviceDetails.Method, URLtoCall, !sync);
            if (serviceDetails.Headers) {
                serviceDetails.Headers.forEach(headerSpec => {
                    xhttp.setRequestHeader(headerSpec.Name, headerSpec.Value);
                });
            };
            // If authentication is required, include Authorization header.
            if (serviceDetails.AuthorizationRequired) {
                xhttp.setRequestHeader("Authorization", this.cognitoFacade.getSessionData().getIdToken().getJwtToken());
            }
            let message = null;
            if (request.Parameters) message = JSON.stringify(request.Parameters);
            else message = null;
            xhttp.send(message);
        }
    };


    /**
     * Put the status to kinesis
     * @param {*} status is in the form of 
     *    {
      "Level": 1,
      "Lives": 3,
      "Nickname": "John",
      "Score": 251,
      "SessionId": "X181001T215808",
      "Shots": 4,
      "Timestamp": "2018-10-10T23:57:26.137Z"
    }
     */
    publishStatus(status, callback) {
        var request = {
            "Resource": "updatestatus",
            "Parameters": status
        };
        this.makeAPIGatewayRequest(request, callback);
    }

    /**
     * 
     * @param {*} username a string with the username, without spaces
     * @param {*} callback function(err,data)
     */
    allocateGamer(username, callback) {
        var body = { "Username": username };
        var request = {
            "Resource": "allocate",
            "Parameters": body
        };
        this.makeAPIGatewayRequest(request, function (err, data) {
            if (err) callback(err,data);
            else {
                let response = null;
                if (data && data != "") response = JSON.parse(data);
                else response = "";
                if (response.successMessage) {
                    callback(null, response.successMessage)
                } else {
                    let error = null;
                    if (response.errorMessage && response.errorCode) {
                        error = new Error(response.errorMessage);
                        error.statusCode = response.errorCode;
                    } else {
                        error = new Error("Error without proper details");
                        console.log(response);
                    }
                    callback(error);
                }
            }
        });
    }

    deallocateGamer(username, callback) {
        var body = { "Username": username };
        var request = {
            "Resource": "deallocate",
            "Parameters": body
        };
        this.makeAPIGatewayRequest(request, function (err, data) {
            if (err) callback(err);
            else {
                let response = null;
                if (data && data != "") response = JSON.parse(data);
                else response = "";
                if (response.successMessage) {
                    callback(null, response.successMessage);
                } else {
                    let error = null;
                    if (response.errorMessage && response.errorCode) {
                        error = new Error(response.errorMessage);
                        error.statusCode = response.errorCode;
                    } else {
                        error = new Error("Error without proper details");
                        console.log(response);
                    }
                    callback(error);
                }
            }
        }, true);
    }

    getWebSocketEndpoint(callback) {
        let request = {
            "Resource": "websocket"
        };
        this.makeAPIGatewayRequest(request, (err, data) => {
            if (err) {
                callback(err, data);
            } else {
                let res = JSON.parse(data);
                callback(null, res);
            }
        })
    }

    getSession(callback) {
        let request = {
            "Resource": "session",
        };
        this.makeAPIGatewayRequest(request, function (err, data) {
            if (err) callback(err, data);
            else {
                let res = JSON.parse(data);
                if (typeof res == 'string') res = JSON.parse(res);
                callback(null, res);
            };
        });
    }

    /**
     * Calls /config from APIGateway returning
     * {
     *   "Parameters" : [
     *  {
     *     "Name" : "/<appname>/clientid",
     *     "Value" :  "thiswillbetheclinedid"
     *   }
     * , {
     *     "Name" : "/<appname>/iotgateway",
     *     "Value" :  "<endpointid>.iot.<region>.amazonaws.com"
     *   }
     * , {
     *     "Name" : "/<appname>/userpoolid",
     *     "Value" :  "<region>_<id>
     *   }
     * , {
     *     "Name" : "/<appname>/userpoolurl",
     *     "Value" :  "cognito-idp.<region>.amazonaws.com\/<userpoolurl>"
     *   }
     * ]
     * }
     * @param {*} callback
     */
    getConfig(callback) {
        let request = {
            "Resource": "config"
        };
        let self = this;
        this.makeAPIGatewayRequest(request, (err, data) => {
            if (err) {
                console.log(err);
                if (callback) callback(err, data);
            }
            else {
                let dataAsJSON = JSON.parse(data);
                self.servicesConfiguration = dataAsJSON.Parameters;
                if (callback) callback(null, dataAsJSON);
            }
        }, true);
    }

    getScoreboard(sessionId, callback) {
        let request = {
            "Resource": "scoreboard",
            "QueryStrings": "sessionId=" + sessionId
        };
        this.makeAPIGatewayRequest(request, function (err, data) {
            if (err) {
                console.log(err);
                if (callback) callback(err, data);
            }
            else {
                let dataAsJSON = JSON.parse(data);
                let sb = dataAsJSON.Scoreboard;
                sb.sort(GameUtils.scoreboardSortingFunction);
                if (callback) callback(null, sb);
            }
        });
    }

    getServiceConfig(parameterName) {
        if (!parameterName) throw new Error("Parameter name must be provided as input.");
        else {
            if (this.servicesConfiguration) {
                let cfg = this.servicesConfiguration.filter((e) => { return e.Name.indexOf(parameterName.toLowerCase()) > -1 });
                if (cfg) {
                    return (cfg[0]).Value;
                } else return null;
            } else return null;
        }
    }

    getUserPoolData(callback) {
        let self = this;
        let returnResult = function (err) {
            if (err) callback(err, null);
            else {
                let response = {
                    "UserPoolId": self.getServiceConfig("UserPoolId"),
                    "ClientId": self.getServiceConfig("ClientId"),
                    "UserPoolURL": self.getServiceConfig("UserPoolURL")
                };
                callback(null, response);
            }
        };
        if (this.servicesConfiguration) returnResult();
        else {
            this.getConfig(function (err, data) {
                if (err) returnResult(err)
                else returnResult();
            });
        }
    }


    /**
     * 
     * @param {*} username 
     * @param {*} password 
     * @param {*} signupAttributes 
     * @param {*} mandatoryAttributes 
     * @param {*} callback 
     */
    signUp(username, password, signupAttributes, mandatoryAttributes, callback) {
        let errorMessage = "";
        if (!username || username.trim() == "") errorMessage = errorMessage + "Username is required. ";
        if (!password || password.trim() == "") errorMessage = errorMessage + "Password is required. ";
        if (!signupAttributes || !Array.isArray(signupAttributes) || signupAttributes.length == 0) errorMessage = errorMessage + "Signup parameters are required. ";
        if (errorMessage != "") callback(new Error(errorMessage), null);
        else this.cognitoFacade.signUp(username, password, signupAttributes, mandatoryAttributes, callback);
    }

    login(username, password, callback) {
        let errorMessage = "";
        if (!username || username.trim() == "") errorMessage = errorMessage + "Username is required. ";
        if (!password || password.trim() == "") errorMessage = errorMessage + "Password is required. ";
        if (errorMessage != "") {
            console.log(">>>", errorMessage);
            callback(new Error(errorMessage), null);
        }
        this.cognitoFacade.login(username, password, callback);
    }

    getCredentials() {
        return this.cognitoFacade.getCredentials();
    }

    getSessionData() {
        return this.cognitoFacade.getSessionData();
    }

    getUserAttribute(attributeName) {
        var result = null;
        let attrData = this.cognitoFacade.getUserAttributes().filter((e) => { return e.Name == attributeName });
        if (attrData.length > 0) result = attrData[0].Value;
        return result;
    }

    getSSM() {
        return new AWS.SSM();
    }

    getDynamoDB() {
        return new AWS.DynamoDB.DocumentClient();
    }

    getKinesisDataStream() {
        return new AWS.Kinesis();
    }

    refreshSession(callback) {
        this.cognitoFacade.refreshCredentials(callback);
    }
}
