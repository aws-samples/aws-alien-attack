// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
/*
  alienattack.js

  the core logic for the Alien Attack game.

*/


/*  
    Game Class

    The Game class represents a Alien Attack game.
    Create an instance of it, change any of the default values
    in the settings, and call 'start' to run the game.

    Call 'initialise' before 'start' to set the canvas the game
    will draw to.

    Call 'moveShip' or 'shipFire' to control the ship.

    Listen for 'gameWon' or 'gameLost' events to handle the game
    ending.
*/


/**
 * Created to represent the score state, in order to determine wether a post
 * must be done to kinesis.
 */
class ScoreState {
    constructor() {
        this.state = {
            lives: null,
            score: null,
            shots: null,
            level: null,
        };
    }

    updateState(newGameState) {
        var result = false;
        var selfState = this.state;
        if (newGameState) {
            Object.keys(this.state).forEach((property) => {
                if (newGameState[property]) {
                    if (selfState[property] != newGameState[property]) {
                        selfState[property] = newGameState[property];
                        result = true;
                    }
                }
            });
        };
        return result;
    };
}

//  Creates an instance of the Game class.
function Game() {

    this.PUBLISHING_INTERVAL = 300; // publish state at each 300ms; This can be set free when we implement kinesis autoscaling
    this.publishingInterval = null;

    this.awsfacade = new AWSFacade(AWS_CONFIG);
    this.session = null;

    // Check internet connection state
    this.isConnected = true;

    // This will be useful when the webso
    this.websocketEnabled = false;

    // Cleaning sessionStorage
    if (typeof (Storage) !== "undefined") {
       sessionStorage.clear();
    } else {
        console.log('No support for local storage');
    }

    // scorestate
    this.scorestate = new ScoreState();

    // load sprite
    this.invaderImg = new Sprite('./../images/invader1.png', 1, 2);
    this.shipImg = new Sprite('./../images/ship.png', 1, 2);

    //  Set the initial config.
    this.config = {
        bombRate: 0.05,
        bombMinVelocity: 50,
        bombMaxVelocity: 50,
        invaderInitialVelocity: 25,
        invaderAcceleration: 0,
        invaderDropDistance: 20,
        rocketVelocity: 120,
        rocketMaxFireRate: 2,
        gameWidth: 400,
        gameHeight: 300,
        fps: 50,
        debugMode: false,
        invaderRanks: 5,
        invaderFiles: 10,
        shipSpeed: 120,
        levelDifficultyMultiplier: 0.2,
        pointsPerInvader: 5
    };

    //  All state is in the variables below.
    this.username = null;
    this.width = 0;
    this.height = 0;
    this.gameBounds = { left: 0, top: 0, right: 0, bottom: 0 };
    this.intervalId = 0;
    this.lives = 3;    
    this.score = 0;
    this.level = 1;
    this.shots = 0;

    //  The state stack.
    this.stateStack = [];

    //  Input/output
    this.pressedKeys = {};
    this.gameCanvas = null;

    //  All sounds.
    this.sounds = null;
    this.isMute = false;

    // Not logged in
    this.loggedin = false;

    // Indicates that the user wants to register or login
    // If the user closes the register-or-login window
    // then he just plays
    this.userWantsRegisterOrLogin = true;
    this.userWantsToRegister = true; //let's replace previous variable
    this.userWantsToLogin = true; //let's replace previous variable
    window.addEventListener("unload", this.onbeforeunload.bind(this));
}

Game.prototype.resetGamer = () => {
    game.lives = 3;    
    game.score = 0;
    game.level = 1;
    game.shots = 0;
}

Game.prototype.onbeforeunload = (event) => {
    game.deallocateGamer( function(err,_) {
        if (err) return err.message;
        else return;
    });
}

//  Initialises the Game with a canvas.
Game.prototype.initialise = function (gameCanvas) {

    //
    this.awsfacade.getConfig(function(err,_) {
        if (err) {
            if (DEBUG) console.log("ERROR LOADING CONFIG");
        } else {
            if (DEBUG) console.log("CONFIG LOADED");
        }
    })
    //  Set the game canvas.
    this.gameCanvas = gameCanvas;

    //  Set the game width and height.
    this.width = gameCanvas.width;
    this.height = gameCanvas.height;

    //  Set the state game bounds.
    this.gameBounds = {
        left: gameCanvas.width / 2 - this.config.gameWidth / 2,
        right: gameCanvas.width / 2 + this.config.gameWidth / 2,
        top: gameCanvas.height / 2 - this.config.gameHeight / 2,
        bottom: gameCanvas.height / 2 + this.config.gameHeight / 2,
    };

    // Create and load the sounds.
    this.sounds = new Sounds(this.isMute);
    this.sounds.init();
    this.sounds.loadSound('shoot', 'sounds/shoot.wav');
    this.sounds.loadSound('bang', 'sounds/bang.wav');
    this.sounds.loadSound('explosion', 'sounds/explosion.wav');
};


Game.prototype.moveToState = function (state) {

    //  If we are in a state, leave it.
    if (this.currentState() && this.currentState().leave) {
        this.currentState().leave(game);
        this.stateStack.pop();
    }

    //  If there's an enter function for the new state, call it.
    if (state.enter) {
        state.enter(game);
    }

    //  Set the current state.
    this.stateStack.pop();
    this.stateStack.push(state);
};

//  Start the Game.
Game.prototype.start = function () {
    this.moveToState(new RegisterOrLoginState());
};

Game.prototype.run = function () {

    //  Set the game variables.
    this.lives = 3;
    this.config.debugMode = /debug=true/.test(window.location.href);

    //  Start the game loop.
    var game = this;
    if (!this.publishingInterval) this.publishingInterval = setInterval( game.publishScore.bind(game), game.PUBLISHING_INTERVAL );
    if (!this.intervalId) this.intervalId = setInterval(function () { GameLoop(game); }, 1000 / this.config.fps);
    //  Move into the 'welcome' state.
    this.moveToState(new WelcomeState());
}

//  Returns the current state.
Game.prototype.currentState = function () {
    return this.stateStack.length > 0 ? this.stateStack[this.stateStack.length - 1] : null;
};

//  Mutes or unmutes the game.
Game.prototype.toggleMute = function () {
    
    if (this.isMute == true) {
        this.sounds.mute = true;
        this.isMute = false;
    } else if (this.isMute == false) {
        this.sounds.mute = false;
        this.isMute = true;
    } else {
        this.sounds.mute = this.sounds.mute ? false : true;
        this.isMute = this.sounds.mute;
    }
    return this.isMute;
};

//  The main loop.
function GameLoop(game) {
    var currentState = game.currentState();
    if (currentState) {
        //  Delta t is the time to update/draw.
        var dt = 1 / game.config.fps;

        //  Get the drawing context.
        var ctx = this.gameCanvas.getContext("2d");

        //  Update if we have an update function. Also draw
        //  if we have a draw function.
        if (currentState.update) {
            currentState.update(game, dt);
        }
        if (currentState.draw) {
            currentState.draw(game, dt, ctx);
        }
    }
}

Game.prototype.pushState = function (state) {

    //  If there's an enter function for the new state, call it.
    if (state.enter) {
        state.enter(game);
    }
    //  Set the current state.
    this.stateStack.push(state);
};

Game.prototype.popState = function () {

    //  Leave and pop the state.
    if (this.currentState()) {
        if (this.currentState().leave) {
            this.currentState().leave(game);
        }

        //  Set the current state.
        this.stateStack.pop();
    }
};

//  The stop function stops the game.
Game.prototype.stop = function Stop() {
    clearInterval(this.intervalId);
    this.intervalId = null;
};

//  Inform the game a key is down.
Game.prototype.keyDown = function (keyCode) {
    this.pressedKeys[keyCode] = true;
    //  Delegate to the current state too.
    if (this.currentState() && this.currentState().keyDown) {
        this.currentState().keyDown(this, keyCode);
    }
};

//  Inform the game a key is up.
Game.prototype.keyUp = function (keyCode) {
    delete this.pressedKeys[keyCode];
    //  Delegate to the current state too.
    if (this.currentState() && this.currentState().keyUp) {
        this.currentState().keyUp(this, keyCode);
    }
};

/**
 * Everystate that contains a modal popup window must
 * implement this
 * @param {*} params 
 */
Game.prototype.modalClose = function (params) {
    if (this.currentState() && this.currentState().modalClose) {
        this.currentState().modalClose(params);
    }
}

Game.prototype.publishScore = function() {
    if (this.scorestate.updateState(
        {
            'score': this.score,
            'lives': this.lives,
            'shots': this.shots,
            'level': this.level
        }
    )) {
        this.publishStatus(function (err, _) {
            if (err && DEBUG) console.log(err);
        });
    };
}

Game.prototype.publishStatus = function (callback) {
    if (this.session) {
        var status = {
            Timestamp: (new Date()).toJSON(),
            SessionId: game.session.SessionId,
            Nickname: game.username,
            Lives: game.lives,
            Score: game.score,
            Shots: game.shots,
            Level: game.level
        };
        this.awsfacade.publishStatus(status, callback);
    }
}

Game.prototype.userHasAlreadyPlayed = function () {
    let result = this.awsfacade.getUserAttribute("custom:hasAlreadyPlayed");
    return (result == 1);
}

/**
 * An user can play if:
 * (1) The user is registered.
 * (2) The user is logged in AND a session is opened OR
 *     The user is logged in AND the user will play without hav
 */
Game.prototype.userCanPlay = function () {
    let canPlay = false;
    if (this.loggedin) {
        if (!this.session)
            //Playing without a session. Score will not be recorded, but player can have fun
            canPlay = true;
        else {
            switch (this.session.GameType) {
                case "MULTIPLE_TRIALS":
                    canPlay = true;
                    break;
                case "SINGLE_TRIAL":
                    if (this.userHasAlreadyPlayed()) canPlay = false;
                    else canPlay = true;
                    break;
                case "TIME_CONSTRAINED":
                    // session deadline will control if user can still play
                    canPlay = true;
                    break;
                default:
                    console.log("Unexpected value for this.session.GameType:", this.session.GameType);
                    canPlay = true;
            }
        }
        /*
        // THIS IS A TIP FOR THE FUTURE IMPLEMENTATION OF THE WEBSOCKET ENABLED VERSION OF THE GAME

        if (this.loggedin && !this.awsfacade.userHasAlreadyPlayed()) {
            var result = {};
            if (this.websocketEnabled) {
                result.WelcomeMessage = 'Wait for the game to begin'; 
                result.RespondToSpacebarPressed = false;
                return result;
            }
            else {
                result.WelcomeMessage  = "Press 'Space' to start the game"; 
                result.RespondToSpacebarPressed = true;
                return result;
            }
        } else return null;
        */
    }
    return canPlay;
}

Game.prototype.deallocateGamer = function(callback) {
    if (this.loggedin){
        this.awsfacade.deallocateGamer(this.username,callback);
    } else callback()
}

function RegisterOrLoginState() {
    this.modal = new Modal(document.getElementById("modalDialog"));
    this.modalDialogString =
        `<div id="registerOrLoginDiv">
        <h2>Alien Attack</h2>
        <p>Click the button in accordance to your choice</p>
        <br>
        <input type="button" class="button" value="REGISTER" onclick="game.modalClose('register')"/>
        <input type="button" class="button" value="LOGIN" onclick="game.modalClose('login')"/>
    </div>`;
    this.modal.show(this.modalDialogString, { actionOnClose: "game.modalClose('CLOSE')" });
}


RegisterOrLoginState.prototype.modalClose = function (selectedButton) {
    this.modal.close(
        function () {
            switch (selectedButton.toUpperCase()) {
                case 'REGISTER':
                    game.moveToState(new RegisterState());
                    break;
                case 'LOGIN':
                    game.moveToState(new LoginState());
                    break;
                case 'CLOSE':
                    game.userWantsRegisterOrLogin = false;
                    game.run();
                    break;
                default:
                    game.userWantsRegisterOrLogin = false;
                    game.run();
            }
        }
    );
}

function RegisterState() {
    this.modal = new Modal(document.getElementById("modalDialog"));
    var modalDialogString =
        `<h2>AlienAttack:REGISTER</h2>
        <label>Nickname* (username; DO NOT USE YOUR EMAIL)</label>
        <input type="text" name="nickname" id="registerDiv.nickname" onfocusout="function validateNickname() {
          function is_email(email){      
              var emailReg = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
              return emailReg.test(email); 
          }
          
          var nicknameField = document.getElementById('registerDiv.nickname');
          if (nicknameField.value.trim() != '') {
            if (is_email(nicknameField.value)) {
               alert('Please DO NOT use your email as the nickname');
               nicknameField.value = '';
               nicknameField.focus();
            }
          }
        }; validateNickname()"/>
        <label>E-mail*</label>
        <input type="text" name="email" id="registerDiv.email" />
        <label>Password* (6 or more characters) </label>
        <input type="password" name="password" id="registerDiv.password" />
        <label>Confirm (and memorize) your password</label>
        <input type="password" name="password" id="registerDiv.confirmPassword" />
        <label>Your company's web domain (ex: aws.amazon.com)*</label>
        <input type="text" name="website" id="registerDiv.website" />
        <br>
        <input type="button" class="button" value="REGISTER" onclick="game.modalClose('REGISTER')"/>
        <label>(*) required fields</label>`;
    this.modal.show(modalDialogString, { actionOnClose: "game.modalClose('CLOSE')" });
}

RegisterState.prototype.modalClose = function (msg) {
    var self = this;
    this.modal.close(function () {
        switch (msg.toUpperCase()) {
            case 'CLOSE':
                game.moveToState(new RegisterOrLoginState());
                break;
            case 'REGISTER':
                self.register();
                break;
            case 'SUCCESS':
                game.moveToState(new LoginState());
                break;
            case 'FAILURE':
                game.moveToState(new RegisterState());
                break;
        }
    });
}

RegisterState.prototype.register = function () {
    var username = document.getElementById('registerDiv.nickname').value;
    var email = document.getElementById('registerDiv.email').value;
    var password = document.getElementById('registerDiv.password').value;
    var confirmationPassword = document.getElementById('registerDiv.confirmPassword').value;
    var website = document.getElementById('registerDiv.website').value;
    if (!username || username.trim() == '' || !password || password.trim() == '' || !confirmationPassword || confirmationPassword.trim() == '' || !email || email.trim() == '' || !website || website.trim() == '') {
        alert("Please fill in all required fields");
        game.moveToState(new RegisterOrLoginState());
    } else 
    if (password != confirmationPassword) {
        alert("Password confirmation doesn't match.");
        game.moveToState(new RegisterOrLoginState());
    }
    else {
        var attributeList = [];
        attributeList.push({ Name: 'website', Value: website });
        attributeList.push({ Name: 'email', Value: email });
        game.awsfacade.signUp(username, password, attributeList, attributeList, function (err, data) {
            if (err) {
                console.log('ERROR - RegisterState:', err);
                game.moveToState(new RegisterFailureState(err));
            }
            else {
                console.log('Registration successful');
                console.log(data);
                game.userWantsRegisterOrLogin = false;
                game.moveToState(new RegisterSuccessState());
            }
        });
    }
}


function RegisterFailureState(err) {
    this.modal = new Modal(document.getElementById("modalDialog"));
    var modalDialogString =
        `<h2>AlienAttack:REGISTER - #FAILURE#</h2>
         <h3>`+ err.message + `.</h3>
         Try again.`;
    this.modal.show(modalDialogString, { actionOnClose: "game.modalClose()" });
}

RegisterFailureState.prototype.modalClose = function () {
    this.modal.close(function () { game.moveToState(new RegisterState()); });
}

function RegisterSuccessState() {
    this.modal = new Modal(document.getElementById("modalDialog"));
    var modalDialogString =
        `<h2>AlienAttack:REGISTER - SUCCESS</h2>
         <h3>You are registered!</h3>
         <h3>Check your email for login details.</h3>`;
    this.modal.show(modalDialogString, { actionOnClose: "game.modalClose()" });
}

RegisterSuccessState.prototype.modalClose = function () {
    this.modal.close(function () { game.moveToState(new LoginState()); });
}


function LoginState() {
    this.modal = new Modal(document.getElementById("modalDialog"));
    var modalDialogString =
        `<h2>AlienAttack:LOGIN</h2>
        <label>Nickname (username)</label>
        <input type="text" name="nickname" id="loginDiv.nickname" />   
        <label>Password</label>
        <input type="password" name="password" id="loginDiv.password" />
        <br>
        <input type="button" class="button" value="LOGIN" onclick="game.modalClose('DO_LOGIN')"/>
        Forgot your password? Reset it <a href="${game.awsfacade.resetPassswordUrl}" target="_blank">here</a>`;
    this.modal.show(modalDialogString, { actionOnClose: "game.modalClose('CLOSE')" });
}

LoginState.prototype.enter = function (game) {
    document.getElementById("loginDiv.password").addEventListener("keydown", function keydown(e) {
        var keycode = e.which || window.event.keycode;
        if(keycode == 13 /* enter */) {
            game.modalClose('DO_LOGIN');
        }
    });
}


LoginState.prototype.modalClose = function (msg) {
    var self = this;
    this.modal.close(function () {
        switch (msg.toUpperCase()) {
            case 'CLOSE':
                game.moveToState(new RegisterOrLoginState());
            break;
            case 'MOVE_TO_LOGIN_AGAIN':
                game.moveToState(new LoginState());
            break;
            case 'DO_LOGIN':
                self.login();
            break;
            case 'WAIT_FOR_SESSION': 
                game.moveToState(new WaitForSessionState());
            break;
        }
    });
}

LoginState.prototype.login = function () {
    var username = document.getElementById('loginDiv.nickname').value;
    var password = document.getElementById('loginDiv.password').value;
    if (!username || username.trim() == '' || !password || password.trim() == '') {
        alert("Invalid login data.");
        game.modalClose('MOVE_TO_LOGIN_AGAIN');
    }
    else {
        game.awsfacade.login(username, password,
            function (err, _) {
                if (err) {
                    console.log(err.message);
                    alert("Invalid login data.");
                    game.modalClose('MOVE_TO_LOGIN_AGAIN');
                }
                else {
                    alert("Hi " + username + "! You are logged in to Alien Attack.");
                    game.loggedin = true;
                    game.username = username;
                    game.userWantsRegisterOrLogin = false;
                    game.modalClose('WAIT_FOR_SESSION');
                }
            });
    }
}

function SessionErrorState(error) {
    this.modal = new Modal(document.getElementById("modalDialog"));
    var modalDialogString =
        `<h2>AlienAttack:</h2>
         <p><h3>Error joining the session</h3></p>
        <p>`+
        "Error (<b>" + error.errorCode + "</b>) : <b>" + error.errorMessage + "</b></p>" +
        `<br><p>Click <b>OK</b> to try again. Close the window to go to the login screen.</p>
        <br>
        <input type="button" class="button" value="OK" onclick="game.modalClose('RETRY')"/><br>`;
    this.modal.show(modalDialogString, { actionOnClose: "game.modalClose('CLOSE')" });
}

SessionErrorState.prototype.modalClose = function (msg) {
    switch(msg) {
        case "RETRY":
            this.modal.close(function () {
                game.moveToState(new WaitForSessionState());
            });
        break;
        case "CLOSE":
            this.modal.close(function () {
                game.moveToState(new LoginState());
            });
        break;
    }

}


function WaitForSessionState() {
    this.session = null;
    // how many times to you want to wait for a session
    this.retryLimit = 3;
    // The interval to check for a session
    this.checkingInterval = null;
    // the countdown for testing if the session is available
    this.countdown = 10;
    this.sessionHasStarted = false;
    this.modal = new Modal(document.getElementById("modalDialog"));
    var modalDialogString =
        `<h2>AlienAttack:WAITING</h2>
         <p><h4>Waiting for session to start</h4></p
        <p>
        <b>You can wait, or close this window to play disconnected.</b>
        <br>
        <br>
        (countdown is just for you to know that we are waiting too)
        </p>
        <br>
        <p id="waitingForSessionCountdown" /p>
        <br>
        <br>
        <div id="waitForSessionButtonsDiv" style="display:none;">
            <br>
            <input type="button" class="button" id="btnJOIN" value="JOIN session" onclick="game.modalClose('JOIN_SESSION')" />
            <input type="button" class="button" id="btnJOIN" value="play DISCONNECTED" onclick="game.modalClose('PLAY_ALONE')" />
            <br>
        </div>`;
    this.modal.show(modalDialogString, { actionOnClose: "game.modalClose('REGISTER_OR_LOGIN')" });
}

WaitForSessionState.prototype.enter = function( game ) {
    var self = this;
    this.checkingInterval = setInterval(function () {
        document.getElementById('waitingForSessionCountdown').innerHTML = self.countdown;
        game.awsfacade.getSession(function (err, session) {
            if (err) {
                console.log(err);
            }
            else {
                if (session) {
                    // get the session
                    self.session = session;
                    // if session is open
                    if (self.session.OpeningTime && !self.session.ClosingTime) {
                        self.sessionHasStarted = true;
                        // cancel the checking interval
                        clearInterval(self.checkingInterval);
                        // present the buttons
                        document.getElementById("waitingForSessionCountdown").innerHTML = "<h4>Session "+self.session.SessionId+" is OPEN.</h4>";
                        document.getElementById("waitForSessionButtonsDiv").style.display = "block";
                        // clear checking intervals
                        self.checkingInterval = null;
                    }
                }
            }
            self.countdown--;
            if (self.countdown < 0) self.countdown = 10;
        });
    }, 1000);
}

WaitForSessionState.prototype.playConnected = function() {
    let self=this;
    this.modal.close( () => {
        if (self.sessionHasStarted) {
            // the session is opened. Let's allocate user
            let self=this;
            game.awsfacade.allocateGamer(game.username, function (err, data) {
                if (err) {
                    let errorDetails = null;
                    try {
                        errorDetails = JSON.parse(data);
                    } catch {
                        console.log(err);
                        errorDetails = "Unknown error. Check the logs.";
                    };
                    game.moveToState(new SessionErrorState(errorDetails));
                } else {
                    game.session = self.session;
                    console.log(game.session);
                    if (game.session.Synchronized) {
                        if (game.session.SynchronizeTime) game.moveToState(new LateStartWarning());
                        else game.moveToState(new WaitForManagerState(game));
                    } else {
                        // This is where we should move to a lobby if the session is synchronized.
                        // start the scoreboard (should this be here?)
                        clearInterval(game.scoreboardInterval);
                        game.scoreboardInterval = setInterval( function() {
                            game.awsfacade.getScoreboard(game.session.SessionId,function(err,data) {
                                let scoreboard = [];
                                if (err) console.log(err);
                                else scoreboard = data;
                                starfield.setScoreboard(scoreboard);
                            })
                        },2000);
                        game.run();
                    }
                    
                }
            });
        }
    });
}

WaitForSessionState.prototype.playAlone = function() {
    this.modal.close( () => {
        game.session = null;
        starfield.setScoreboard([]);
        clearInterval(game.scoreboardInterval);
        game.run();
    });
}

WaitForSessionState.prototype.modalClose = function (msg) {
    clearInterval(this.checkingInterval);
    this.checkingInterval = null;
    if (msg && msg.statusCode) {
        // error reading session
        this.modal.close(function () {
            game.moveToState(new SessionErrorState(msg));
        });
    } else {
        switch(msg) {
            case "JOIN_SESSION":
                this.playConnected();
            break;
            case "PLAY_ALONE":
                this.playAlone();
            break;
            case "REGISTER_OR_LOGIN":
                this.modal.close(function () {
                    game.moveToState(new RegisterOrLoginState());
                }); 
            break;
            default:
                this.playAlone();
        }
    }
}

function LateStartWarning() {
    this.modal = new Modal(document.getElementById("modalDialog"));
    var modalDialogString = 
        `<h2>AlienAttack:</h2>
        <p><h3>The game has already begun, do you still wish to join?</h3><p>
        <br>
        <input type="button" class="button" value="AGREE" onclick="game.modalClose('JOIN_SESSION')"/>`
    this.modal.show(modalDialogString, { actionOnClose: "game.modalClose('CLOSE')" });
}

LateStartWarning.prototype.modalClose = function(msg) {
    switch(msg) {
        case "JOIN_SESSION":
            this.playConnected();
        break;
        case "CLOSE":
            game.moveToState(new WaitForSessionState());
        break;
    }
}

LateStartWarning.prototype.playConnected = function() {
    console.log("about to play")
    this.modal.close(() => {
        clearInterval(game.scoreboardInterval);
        game.scoreboardInterval = setInterval( function() {
            game.awsfacade.getScoreboard(game.session.SessionId,function(err,data) {
                let scoreboard = [];
                if (err) console.log(err);
                else scoreboard = data;
                starfield.setScoreboard(scoreboard);
            })
        },2000);
        game.run();
    })
}

function WaitForManagerState(game) {
    this.modal = new Modal(document.getElementById("modalDialog"));
    var modalDialogString =
        `<h2>AlienAttack:</h2>
        <p><h3>Waiting for Manager to start Game</h3></p>
        <br>
        <input type="button" class="button" value="Play Alone" onclick="game.modalClose('PLAY_ALONE')"/>`;
    this.modal.show(modalDialogString, { actionOnClose: "game.modalClose('CLOSE')" });
    let listeners = { messageCallback: WaitForManagerState.prototype.onMessageFromWebSocket.bind(this),
                    closeCallback: WaitForManagerState.prototype.onCloseWebsocket.bind(this) };
    var self = this;
    this.webSocket = new ApiGatewayWebSocket(game.awsfacade, listeners, function(err, _) {
        if (err) {
            self.modal.close();
            clearInterval(game.scoreboardInterval);
            game.scoreboardInterval = setInterval( function() {
                game.awsfacade.getScoreboard(game.session.SessionId,function(err,data) {
                    let scoreboard = [];
                    if (err) console.log(err);
                    else scoreboard = data;
                    starfield.setScoreboard(scoreboard);
                })
            },2000);
            game.run();
        }
    });
    game.publishStatus(function(err, _) {
        if (err) console.log(err);
    });
}

WaitForManagerState.prototype.modalClose = function(msg) {
    switch(msg) {
        case 'PLAY_ALONE':
            this.webSocket.close();
            this.playAlone();
        break;
        case 'CLOSE':
            game.moveToState(new WaitForSessionState());
        break;
    }
}

WaitForManagerState.prototype.playAlone = function() {
    this.modal.close( () => {
        game.session = null;
        starfield.setScoreboard([]);
        clearInterval(game.scoreboardInterval);
        game.run();
    });
}

WaitForManagerState.prototype.onMessageFromWebSocket = function(message) {
    // Need a whole lot more error handling here
    if (message.data == 'start') {
        this.modal.close();
        clearInterval(game.scoreboardInterval);
        game.scoreboardInterval = setInterval( function() {
            game.awsfacade.getScoreboard(game.session.SessionId,function(err,data) {
                let scoreboard = [];
                if (err) console.log(err);
                else scoreboard = data;
                starfield.setScoreboard(scoreboard);
            })
        },2000);
        game.run();
    }
}

WaitForManagerState.prototype.onCloseWebsocket = function() {
    if (event.code == 1001) {
        this.webSocket.reConnect();
    } else console.log('WebSocket Closed');
}

function WelcomeState() {
    //this.wsclient = null;
    this.welcomeMessage = "Press 'Space' to start the game";
    this.userCanPlay = game.userCanPlay();
    this.respondToSpacebarPressed = true;
    /** 
    if (this.userCanPlay && game.websocketEnabled) {
        this.wsclient = new WSClient(game.username,game.awsfacade.getServiceConfig('iotgateway'),AWS_CONFIG.region,game.awsfacade.getCredentials(),WelcomeState.prototype.onMessageFromWebSocket.bind(this));
    }
    */
}

WelcomeState.prototype.draw = function (game, dt, ctx) {
    //  Clear the background.
    ctx.clearRect(0, 0, game.width, game.height);

    ctx.font = "30px Arial";
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = "center";
    ctx.textAlign = "center";
    ctx.fillText("Alien Attack", game.width / 2, game.height / 2 - 40);
    ctx.font = "16px Arial";
    if (this.userCanPlay)
        ctx.fillText(this.welcomeMessage, game.width / 2, game.height / 2);
    else ctx.fillText('You must register and login to play. A session must exists to have your score recorded.', game.width / 2, game.height / 2);
};

WelcomeState.prototype.keyDown = function (game, keyCode) {
    if ((keyCode == 32) && this.respondToSpacebarPressed) {
        //  Space starts the game.
        game.resetGamer();
        /*
        game.level = 1;
        game.score = 0;
        game.lives = 3;
        */
        game.moveToState(new LevelIntroState(game.level));
    }
};

WelcomeState.prototype.onMessageFromWebSocket = function (message) {
    console.log('WelcomeState.prototype.onMessageFromWebSocket:', message);
    if (message && message.toUpperCase() == 'START') {
        this.wsclient.disconnect();
        //  Space starts the game.
        game.resetGamer();
        /*
        game.level = 1;
        game.score = 0;
        game.lives = 3;
        */
        game.moveToState(new LevelIntroState(game.level));
    } else {
        console.log('Strange message from WS:', message);
    }
}

function GameOverState() {
    console.log('GAME OVER');
    clearInterval(game.scoreboardInterval);
    let self=this;
    game.publishStatus(function (err, data) {
        if (err) console.log(err);
        else {
            clearInterval(self.publishingInterval);
            self.publishingInterval = null;
        }
    });
    this.moveToWaitForSessionState = function keydown(e) {
        var keycode = e.which || window.event.keycode;
        if(keycode == 13 /* ENTER */) {
            window.removeEventListener("keydown",self.moveToWaitForSessionState);
            game.resetGamer();
            game.moveToState(new WaitForSessionState()); 
        }
    };
}

GameOverState.prototype.enter = function(game) {
    window.addEventListener("keydown", this.moveToWaitForSessionState);
}

GameOverState.prototype.update = function (game, dt) {

};

GameOverState.prototype.draw = function (game, dt, ctx) {

    //  Clear the background.
    ctx.clearRect(0, 0, game.width, game.height+40);

    ctx.font = "30px Arial";
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = "center";
    ctx.textAlign = "center";
    ctx.fillText("Game Over!", game.width / 2, game.height / 2 - 40);
    ctx.font = "16px Arial";
    ctx.fillText("You scored " + game.score + ", shot " + game.shots + " times, and got to level " + game.level, game.width / 2, game.height / 2);
    ctx.fillText("Press the ENTER to play again", game.width / 2, game.height / 2 + 40);
};


//  Create a PlayState with the game config and the level you are on.
function PlayState(config, level) {
    this.config = config;
    this.level = level;

    //  Game state.
    this.invaderCurrentVelocity = 10;
    this.invaderCurrentDropDistance = 0;
    this.invadersAreDropping = false;
    this.lastRocketTime = null;

    //  Game entities.
    this.ship = null;
    this.invaders = [];
    this.rockets = [];
    this.bombs = [];
}

PlayState.prototype.enter = function (game) {

    //  Create the ship.
    this.ship = new Ship(game.width / 2, game.gameBounds.bottom);

    //  Setup initial state.
    this.invaderCurrentVelocity = 10;
    this.invaderCurrentDropDistance = 0;
    this.invadersAreDropping = false;

    //  Set the ship speed for this level, as well as invader params.
    var levelMultiplier = this.level * this.config.levelDifficultyMultiplier;
    this.shipSpeed = this.config.shipSpeed;
    this.invaderInitialVelocity = this.config.invaderInitialVelocity + (levelMultiplier * this.config.invaderInitialVelocity);
    this.bombRate = this.config.bombRate + (levelMultiplier * this.config.bombRate);
    this.bombMinVelocity = this.config.bombMinVelocity + (levelMultiplier * this.config.bombMinVelocity);
    this.bombMaxVelocity = this.config.bombMaxVelocity + (levelMultiplier * this.config.bombMaxVelocity);

    //  Create the invaders.
    var ranks = this.config.invaderRanks;
    var files = this.config.invaderFiles;
    var invaders = [];
    for (var rank = 0; rank < ranks; rank++) {
        for (var file = 0; file < files; file++) {
            invaders.push(new Invader(
                (game.width / 2) + ((files / 2 - file) * 200 / files),
                (game.gameBounds.top + rank * 20),
                rank, file, 'Invader'));
        }
    }
    this.invaders = invaders;
    this.invaderCurrentVelocity = this.invaderInitialVelocity;
    this.invaderVelocity = { x: -this.invaderInitialVelocity, y: 0 };
    this.invaderNextVelocity = null;
};

PlayState.prototype.update = function (game, dt) {

    //  If the left or right arrow keys are pressed, move
    //  the ship. Check this on ticks rather than via a keydown
    //  event for smooth movement, otherwise the ship would move
    //  more like a text editor caret.
    if (game.pressedKeys[37]) {
        this.ship.x -= this.shipSpeed * dt;
    }
    if (game.pressedKeys[39]) {
        this.ship.x += this.shipSpeed * dt;
    }
    if (game.pressedKeys[32]) {
        this.fireRocket();
    }

    //  Keep the ship in bounds.
    if (this.ship.x < game.gameBounds.left) {
        this.ship.x = game.gameBounds.left;
    }
    if (this.ship.x > game.gameBounds.right) {
        this.ship.x = game.gameBounds.right;
    }

    //  Move each bomb.
    for (var i = 0; i < this.bombs.length; i++) {
        var bomb = this.bombs[i];
        bomb.y += dt * bomb.velocity;

        //  If the rocket has gone off the screen remove it.
        if (bomb.y > this.height) {
            this.bombs.splice(i--, 1);
        }
    }

    //  Move each rocket.
    for (i = 0; i < this.rockets.length; i++) {
        var rocket = this.rockets[i];
        rocket.y -= dt * rocket.velocity;

        //  If the rocket has gone off the screen remove it.
        if (rocket.y < 0) {
            this.rockets.splice(i--, 1);
        }
    }

    //  Move the invaders.
    var hitLeft = false, hitRight = false, hitBottom = false;
    for (i = 0; i < this.invaders.length; i++) {
        var invader = this.invaders[i];
        var newx = invader.x + this.invaderVelocity.x * dt;
        var newy = invader.y + this.invaderVelocity.y * dt;
        if (hitLeft == false && newx < game.gameBounds.left) {
            hitLeft = true;
        }
        else if (hitRight == false && newx > game.gameBounds.right) {
            hitRight = true;
        }
        else if (hitBottom == false && newy > game.gameBounds.bottom) {
            hitBottom = true;
        }

        if (!hitLeft && !hitRight && !hitBottom) {
            invader.x = newx;
            invader.y = newy;
        }
    }

    //  Update invader velocities.
    if (this.invadersAreDropping) {
        this.invaderCurrentDropDistance += this.invaderVelocity.y * dt;
        if (this.invaderCurrentDropDistance >= this.config.invaderDropDistance) {
            this.invadersAreDropping = false;
            this.invaderVelocity = this.invaderNextVelocity;
            this.invaderCurrentDropDistance = 0;
        }
    }
    //  If we've hit the left, move down then right.
    if (hitLeft) {
        this.invaderCurrentVelocity += this.config.invaderAcceleration;
        this.invaderVelocity = { x: 0, y: this.invaderCurrentVelocity };
        this.invadersAreDropping = true;
        this.invaderNextVelocity = { x: this.invaderCurrentVelocity, y: 0 };
    }
    //  If we've hit the right, move down then left.
    if (hitRight) {
        this.invaderCurrentVelocity += this.config.invaderAcceleration;
        this.invaderVelocity = { x: 0, y: this.invaderCurrentVelocity };
        this.invadersAreDropping = true;
        this.invaderNextVelocity = { x: -this.invaderCurrentVelocity, y: 0 };
    }
    //  If we've hit the bottom, it's game over.
    if (hitBottom) {
        this.lives = 0;
    }

    //  Check for rocket/invader collisions.
    for (i = 0; i < this.invaders.length; i++) {
        var invader = this.invaders[i];
        var bang = false;

        for (var j = 0; j < this.rockets.length; j++) {
            var rocket = this.rockets[j];

            if (rocket.x >= (invader.x - invader.width / 2) && rocket.x <= (invader.x + invader.width / 2) &&
                rocket.y >= (invader.y - invader.height / 2) && rocket.y <= (invader.y + invader.height / 2)) {

                //  Remove the rocket, set 'bang' so we don't process
                //  this rocket again.
                this.rockets.splice(j--, 1);
                bang = true;
                game.score += this.config.pointsPerInvader;
                break;
            }
        }
        if (bang) {
            this.invaders.splice(i--, 1);
            game.sounds.playSound('bang');
        }
    }

    //  Find all of the front rank invaders.
    var frontRankInvaders = {};
    for (var i = 0; i < this.invaders.length; i++) {
        var invader = this.invaders[i];
        //  If we have no invader for game file, or the invader
        //  for game file is futher behind, set the front
        //  rank invader to game one.
        if (!frontRankInvaders[invader.file] || frontRankInvaders[invader.file].rank < invader.rank) {
            frontRankInvaders[invader.file] = invader;
        }
    }

    //  Give each front rank invader a chance to drop a bomb.
    for (var i = 0; i < this.config.invaderFiles; i++) {
        var invader = frontRankInvaders[i];
        if (!invader) continue;
        var chance = this.bombRate * dt;
        if (chance > Math.random()) {
            //  Fire!
            this.bombs.push(new Bomb(invader.x, invader.y + invader.height / 2,
                this.bombMinVelocity + Math.random() * (this.bombMaxVelocity - this.bombMinVelocity)));
        }
    }

    //  Check for bomb/ship collisions.
    for (var i = 0; i < this.bombs.length; i++) {
        var bomb = this.bombs[i];
        if (bomb.x >= (this.ship.x - this.ship.width / 2) && bomb.x <= (this.ship.x + this.ship.width / 2) &&
            bomb.y >= (this.ship.y - this.ship.height / 2) && bomb.y <= (this.ship.y + this.ship.height / 2)) {
            this.bombs.splice(i--, 1);
            game.lives--;
            game.sounds.playSound('explosion');
        }

    }

    //  Check for invader/ship collisions.
    for (var i = 0; i < this.invaders.length; i++) {
        var invader = this.invaders[i];
        if ((invader.x + invader.width / 2) > (this.ship.x - this.ship.width / 2) &&
            (invader.x - invader.width / 2) < (this.ship.x + this.ship.width / 2) &&
            (invader.y + invader.height / 2) > (this.ship.y - this.ship.height / 2) &&
            (invader.y - invader.height / 2) < (this.ship.y + this.ship.height / 2)) {
            //  Dead by collision!
            game.lives = 0;
            game.sounds.playSound('explosion');
        }
    }

    // update game status and publish if necessary
    if (game.scorestate.updateState(
        {
            'score': game.score,
            'lives': game.lives,
            'shots': game.shots,
            'level': game.level
        }
    )) {
        game.publishStatus(function (err, data) {
            if (err) console.log(err);
        });
    };

    //  Check for failure
    if (game.lives <= 0) {
        game.moveToState(new GameOverState());
    }

    //  Check for victory
    if (this.invaders.length === 0) {
        game.score += this.level * 50;
        game.level += 1;
        game.moveToState(new LevelIntroState(game.level));
    }
};

PlayState.prototype.draw = function (game, dt, ctx) {

    //  Clear the background.
    ctx.clearRect(0, 0, game.width, game.height);

    //  Draw ship.
    game.shipImg.draw(ctx, this.ship.x - (this.ship.width / 2), this.ship.y - (this.ship.height / 2));

    //  Draw invaders.
    for (var i = 0; i < this.invaders.length; i++) {
        var invader = this.invaders[i];
        game.invaderImg.draw(ctx, invader.x - invader.width / 2, invader.y - invader.height / 2);
    }

    //  Draw bombs.
    ctx.fillStyle = '#ff5555';
    for (var i = 0; i < this.bombs.length; i++) {
        var bomb = this.bombs[i];
        ctx.fillRect(bomb.x - 2, bomb.y - 2, 4, 4);
    }

    //  Draw rockets.
    ctx.fillStyle = '#df3312';
    for (var i = 0; i < this.rockets.length; i++) {
        var rocket = this.rockets[i];
        ctx.fillRect(rocket.x, rocket.y - 2, 3, 4);
    };

    //  Draw info.
    var textYpos = game.gameBounds.bottom + ((game.height - game.gameBounds.bottom) / 2) + 14 / 2;
    ctx.font = "14px Arial";
    ctx.fillStyle = '#ffffff';
    var info = "Lives: " + game.lives;
    ctx.textAlign = "left";
    ctx.fillText(info, game.gameBounds.left, textYpos);
    info = "Score: " + game.score + ", Shots: " + game.shots + ", Level: " + game.level;
    ctx.textAlign = "right";
    ctx.fillText(info, game.gameBounds.right, textYpos);

    //  If we're in debug mode, draw bounds.
    if (this.config.debugMode) {
        ctx.strokeStyle = '#ff0000';
        ctx.strokeRect(0, 0, game.width, game.height);
        ctx.strokeRect(game.gameBounds.left, game.gameBounds.top,
            game.gameBounds.right - game.gameBounds.left,
            game.gameBounds.bottom - game.gameBounds.top);
    }
};
 

PlayState.prototype.keyDown = function (game, keyCode) {

    if (keyCode == 32) {
        //  Fire!
        this.fireRocket();
    }
    if (keyCode == 80) {
        //  Push the pause state.
        game.pushState(new PauseState());
    }
};

PlayState.prototype.keyUp = function (game, keyCode) {

};

PlayState.prototype.fireRocket = function () {
    //  If we have no last rocket time, or the last rocket time 
    //  is older than the max rocket rate, we can fire.
    if (this.lastRocketTime === null || ((new Date()).valueOf() - this.lastRocketTime) > (1000 / this.config.rocketMaxFireRate)) {
        //  Add a rocket.
        this.rockets.push(new Rocket(this.ship.x, this.ship.y - 12, this.config.rocketVelocity));
        this.lastRocketTime = (new Date()).valueOf();

        //  Play the 'shoot' sound.
        game.sounds.playSound('shoot');
        game.shots += 1;
    }
};


function PauseState() {

}

PauseState.prototype.keyDown = function (game, keyCode) {

    if (keyCode == 80) {
        //  Pop the pause state.
        game.popState();
    }
};

PauseState.prototype.draw = function (game, dt, ctx) {

    //  Clear the background.
    ctx.clearRect(0, 0, game.width, game.height);

    ctx.font = "14px Arial";
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText("Paused", game.width / 2, game.height / 2);
    return;
};

/*  
    Level Intro State

    The Level Intro state shows a 'Level X' message and
    a countdown for the level.
*/
function LevelIntroState(level) {
    this.level = level;
    this.countdownMessage = "3";
}

LevelIntroState.prototype.update = function (game, dt) {

    //  Update the countdown.
    if (this.countdown === undefined) {
        this.countdown = 3; // countdown from 3 secs
    }
    this.countdown -= dt;

    if (this.countdown < 2) {
        this.countdownMessage = "2";
    }
    if (this.countdown < 1) {
        this.countdownMessage = "1";
    }
    if (this.countdown <= 0) {
        //  Move to the next level, popping this state.
        game.moveToState(new PlayState(game.config, this.level));
    }

};

LevelIntroState.prototype.draw = function (game, dt, ctx) {

    //  Clear the background.
    ctx.clearRect(0, 0, game.width, game.height);

    ctx.font = "36px Arial";
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText("Level " + this.level, game.width / 2, game.height / 2);
    ctx.font = "24px Arial";
    ctx.fillText("Ready in " + this.countdownMessage, game.width / 2, game.height / 2 + 36);
    return;
};


/*
 
  Ship

  The ship has a position and that's about it.

*/
function Ship(x, y) {
    this.x = x;
    this.y = y;
    this.width = 20;
    this.height = 16;
}

/*
    Rocket

    Fired by the ship, they've got a position, velocity and state.

    */
function Rocket(x, y, velocity) {
    this.x = x;
    this.y = y;
    this.velocity = velocity;
}

/*
    Bomb

    Dropped by invaders, they've got position, velocity.

*/
function Bomb(x, y, velocity) {
    this.x = x;
    this.y = y;
    this.velocity = velocity;
}

/*
    Invader 

    Invader's have position, type, rank/file and that's about it. 
*/

function Invader(x, y, rank, file, type) {
    this.x = x;
    this.y = y;
    this.rank = rank;
    this.file = file;
    this.type = type;
    this.width = 18;
    this.height = 14;
}

/*
    Game State

    A Game State is simply an update and draw proc.
    When a game is in the state, the update and draw procs are
    called, with a dt value (dt is delta time, i.e. the number)
    of seconds to update or draw).

*/
function GameState(updateProc, drawProc, keyDown, keyUp, enter, leave) {
    this.updateProc = updateProc;
    this.drawProc = drawProc;
    this.keyDown = keyDown;
    this.keyUp = keyUp;
    this.enter = enter;
    this.leave = leave;
}

/*

    Sounds

    The sounds class is used to asynchronously load sounds and allow
    them to be played.

*/
function Sounds(isMute) {

    //  The audio context.
    this.audioContext = null;

    //  The actual set of loaded sounds.
    this.sounds = {};
}

Sounds.prototype.init = function () {

    //  Create the audio context, paying attention to webkit browsers.
    context = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new context();
    if (game.isMute == null) {
        this.mute = false;
        game.isMute = this.mute ;
    } else this.mute = game.isMute;
};

Sounds.prototype.loadSound = function (name, url) {

    //  Reference to ourselves for closures.
    var self = this;

    //  Create an entry in the sounds object.
    this.sounds[name] = null;

    //  Create an asynchronous request for the sound.
    var req = new XMLHttpRequest();
    req.open('GET', url, true);
    req.responseType = 'arraybuffer';
    req.onload = function () {
        self.audioContext.decodeAudioData(req.response, function (buffer) {
            self.sounds[name] = { buffer: buffer };
        });
    };
    try {
        req.send();
    } catch (e) {
        console.log("An exception occured getting sound the sound " + name + " this might be " +
            "because the page is running from the file system, not a webserver.");
        console.log(e);
    }
};

Sounds.prototype.playSound = function (name) {

    //  If we've not got the sound, don't bother playing it.
    if (this.sounds[name] === undefined || this.sounds[name] === null || game.isMute === true) {
        return;
    }

    //  Create a sound source, set the buffer, connect to the speakers and
    //  play the sound.
    var source = this.audioContext.createBufferSource();
    source.buffer = this.sounds[name].buffer;
    source.connect(this.audioContext.destination);
    source.start(0);
};

function Sprite(file) {
    this.image = new Image();
    this.image.src = file;
    var self = this;
};

Sprite.prototype.getImage = function () {
    return this.image;
}

Sprite.prototype.draw = function (canvas, x, y) {
    canvas.drawImage(this.image, x, y);
}
