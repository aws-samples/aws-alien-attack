


function ApiGatewayWebSocket(awsFacade, websocketCallbacks, callback) {
    this.messageCallback = websocketCallbacks.messageCallback;
    this.closeCallback = websocketCallbacks.closeCallback;
    this.errorCallback = websocketCallbacks.errorCallback;
    let self = this;
    this.URL = null;
    awsFacade.getWebSocketEndpoint((err, data) => {
        if (err) {
            console.log('Error', err);
            if (callback) callback(err);
        } else {
            console.log(data.Error)
            if (data.Error || data == '') callback(new Error('WebSocket Param is EMPTY'));
            else {
                console.log('Success getting websocket URL', data);
                self.URL = data;
                self.ws = new WebSocket(self.URL);
                self.ws.onmessage = ApiGatewayWebSocket.prototype.onMessageListener.bind(self);
                self.ws.onclose = ApiGatewayWebSocket.prototype.onCloseListener.bind(self);
                self.ws.onerror = ApiGatewayWebSocket.prototype.onErrorListener.bind(self);
                ApiGatewayWebSocket.prototype.setURL(self.URL);
            }
        }
    });
    if (callback) callback();
}

ApiGatewayWebSocket.prototype.setURL = function(URL) {
    this.URL = URL;
}

ApiGatewayWebSocket.prototype.onMessageListener = function(message) {
    if (this.messageCallback) this.messageCallback(message);
}

ApiGatewayWebSocket.prototype.onErrorListener = function(err) {
    if (this.errorCallback) this.errorCallback(err);
}

ApiGatewayWebSocket.prototype.onCloseListener = function(closeMessage) {
    if (this.closeCallback) this.closeCallback(closeMessage)
}

ApiGatewayWebSocket.prototype.sendMessage = function(message) {
    if (message) {
        if (message.action)
            this.ws.send(JSON.stringify(message));
    }
}

ApiGatewayWebSocket.prototype.close = function() {
    this.ws.close();
}

ApiGatewayWebSocket.prototype.isOpen = function() {
    return this.ws != null;
}

ApiGatewayWebSocket.prototype.reConnect = function() {
    this.ws = new WebSocket(this.URL);
    this.ws.onmessage = ApiGatewayWebSocket.prototype.onMessageListener.bind(this);
    this.ws.onclose = ApiGatewayWebSocket.prototype.onCloseListener.bind(this);
    this.ws.onerror = ApiGatewayWebSocket.prototype.onErrorListener.bind(this);
}