/**
  * utilities to do sigv4
  * @class SigV4Utils
  */
 function SigV4Utils() { }

 SigV4Utils.prototype.getSignatureKey = function (key, date, region, service) {
     var kDate = AWS.util.crypto.hmac('AWS4' + key, date, 'buffer');
     var kRegion = AWS.util.crypto.hmac(kDate, region, 'buffer');
     var kService = AWS.util.crypto.hmac(kRegion, service, 'buffer');
     var kCredentials = AWS.util.crypto.hmac(kService, 'aws4_request', 'buffer');
     return kCredentials;
 };
 
 SigV4Utils.prototype.getSignedUrl = function (host, region, credentials) {
     var datetime = AWS.util.date.iso8601(new Date()).replace(/[:\-]|\.\d{3}/g, '');
     var date = datetime.substr(0, 8);
 
     var method = 'GET';
     var protocol = 'wss';
     var uri = '/mqtt';
     var service = 'iotdevicegateway';
     var algorithm = 'AWS4-HMAC-SHA256';
 
     var credentialScope = date + '/' + region + '/' + service + '/' + 'aws4_request';
     var canonicalQuerystring = 'X-Amz-Algorithm=' + algorithm;
     canonicalQuerystring += '&X-Amz-Credential=' + encodeURIComponent(credentials.accessKeyId + '/' + credentialScope);
     canonicalQuerystring += '&X-Amz-Date=' + datetime;
     canonicalQuerystring += '&X-Amz-SignedHeaders=host';
 
     var canonicalHeaders = 'host:' + host + '\n';
     var payloadHash = AWS.util.crypto.sha256('', 'hex')
     var canonicalRequest = method + '\n' + uri + '\n' + canonicalQuerystring + '\n' + canonicalHeaders + '\nhost\n' + payloadHash;
 
     var stringToSign = algorithm + '\n' + datetime + '\n' + credentialScope + '\n' + AWS.util.crypto.sha256(canonicalRequest, 'hex');
     var sigv4 = new SigV4Utils();
     var signingKey = sigv4.getSignatureKey(credentials.secretAccessKey, date, region, service);
     var signature = AWS.util.crypto.hmac(signingKey, stringToSign, 'hex');
 
     canonicalQuerystring += '&X-Amz-Signature=' + signature;
     if (credentials.sessionToken) {
         canonicalQuerystring += '&X-Amz-Security-Token=' + encodeURIComponent(credentials.sessionToken);
     }
 
     var requestUrl = protocol + '://' + host + uri + '?' + canonicalQuerystring;
     return requestUrl;
 };
 
 function WSClient(clientId,host,region,credentials,messageReceivedCallback) {
    var sigv4 = new SigV4Utils();
    var requestURL = sigv4.getSignedUrl(host, region, credentials);
    this.client = new Paho.MQTT.Client(requestURL, clientId);
    var self = this;
    this.messageCallback = messageReceivedCallback;
    var connectOptions = {
        onSuccess: function () {
            console.log('IoT Connected with success');
            self.client.subscribe("ALIENATTACK");
        },
        useSSL: true,
        timeout: 3,
        mqttVersion: 4,
        onFailure: function () {
            console.log('failure');
        }
    };
    this.client.connect(connectOptions);
    this.client.onMessageArrived = WSClient.prototype.onMessageArrived.bind(this);
}

WSClient.prototype.onMessageArrived = function(message) {
    console.log("onMessageArrived:"+message.payloadString);
    if (this.messageCallback) this.messageCallback(message.payloadString);
};

WSClient.prototype.disconnect = function() {
    this.client.disconnect();
}