// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
/**
 * Modal
 * 
 * Provides resources for using a pop-up modal dialog.
 * One must provide the proper div for the modal, within the html file.
 * This div MUST BE of class modalDialog (see modaldialog.css for more info)
 */
function Modal(modalDiv) {
    this.modalDiv = modalDiv;
    this.modalDivId = this.modalDiv.id;
    // hidden at start
    this.modalDiv.style.zIndex = -99999;
    // Location history, for the case when the user
    // wants the window move back to certain location when
    // the pop up is closed
    this.locationHistory = [];
    this.locationHistory.push(window.location);
    // configuring ESC to close the pop-up
    this.ESCPressed = false;
    var self = this;
    window.addEventListener("keydown", function keydown(e) {
        var keycode = e.which || window.event.keycode;
        if(keycode == 27) {
            self.ESCPressed = true;
            // supress further pressing of ESC
            e.preventDefault();
        }
    });
}


Modal.prototype.show = function(internalHTMLContent,params) {
    this.modalDiv.style.zIndex = 99999;
    this.locationHistory.push(window.location);
    window.location = "#"+this.modalDivId;
    var actionOnClose = ' ';
    if (params && params.actionOnClose) 
        actionOnClose = 'onClick="'+params.actionOnClose+'" ';
    this.ESCPressed = false;
    this.modalDiv.innerHTML = 
        '<div id="modalInnerDiv" class="fieldContainer">'+
        '<a href="#close" title="Close" '+actionOnClose+' class="close">X</a>'
        +internalHTMLContent+
        '</div>';
} 

Modal.prototype.setInnerHTML = function(innerHTML) {
    this.modalDiv.innerHTML = innerHTML;
}

Modal.prototype.close = function(callback) {
    this.modalDiv.style.zIndex = -99999;
    let lastLocation = this.locationHistory.pop();
    window.location = lastLocation;
    // This timeout exists only to give time to the zIndex to be updated
    setTimeout( function() {
        if (callback) callback();
    },10);
}

Modal.prototype.hide = function() {
    this.modalDiv.style.zIndex = -99999;
}