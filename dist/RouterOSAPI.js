"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Connector_1 = require("./connector/Connector");
const Channel_1 = require("./Channel");
const RosException_1 = require("./RosException");
const RStream_1 = require("./RStream");
const crypto = require("crypto");
const debug = require("debug");
const timers_1 = require("timers");
const events_1 = require("events");
const info = debug('routeros-api:api:info');
const error = debug('routeros-api:api:error');
/**
 * Creates a connection object with the credentials provided
 */
class RouterOSAPI extends events_1.EventEmitter {
    /**
     * Constructor, also sets the language of the thrown errors
     *
     * @param {Object} options
     */
    constructor(options) {
        super();
        /**
         * Connected flag
         */
        this.connected = false;
        /**
         * Connecting flag
         */
        this.connecting = false;
        /**
         * Closing flag
         */
        this.closing = false;
        /**
         * Counter for channels open
         */
        this.channelsOpen = 0;
        /**
         * Flag if the connection was held by the keepalive parameter
         * or keepaliveBy function
         */
        this.holdingConnectionWithKeepalive = false;
        this.setOptions(options);
    }
    /**
     * Set connection options, affects before connecting
     *
     * @param options connection options
     */
    setOptions(options) {
        this.host = options.host;
        this.user = options.user;
        this.password = options.password;
        this.port = options.port || 8728;
        this.timeout = options.timeout || 10;
        this.tls = options.tls;
        this.keepalive = options.keepalive || false;
    }
    /**
     * Tries a connection to the routerboard with the provided credentials
     *
     * @returns {Promise}
     */
    connect() {
        if (this.connecting)
            return Promise.reject('ALRDYCONNECTING');
        if (this.connected)
            return Promise.resolve(this);
        info('Connecting on %s', this.host);
        this.connecting = true;
        this.connected = false;
        this.connector = new Connector_1.Connector({
            host: this.host,
            port: this.port,
            timeout: this.timeout,
            tls: this.tls,
        });
        return new Promise((resolve, reject) => {
            const endListener = (e) => {
                this.connected = false;
                this.connecting = false;
                if (e)
                    reject(e);
            };
            this.connector.once('error', endListener);
            this.connector.once('timeout', endListener);
            this.connector.once('close', () => {
                endListener();
                this.emit('close');
            });
            this.connector.once('connected', () => {
                this.login().then(() => {
                    this.connecting = false;
                    this.connected = true;
                    this.connector.removeListener('error', endListener);
                    this.connector.removeListener('timeout', endListener);
                    const connectedErrorListener = (e) => {
                        this.connected = false;
                        this.connecting = false;
                        this.emit('error', e);
                    };
                    this.connector.once('error', connectedErrorListener);
                    this.connector.once('timeout', connectedErrorListener);
                    if (this.keepalive)
                        this.keepaliveBy('#');
                    info('Logged in on %s', this.host);
                    resolve(this);
                }).catch((e) => {
                    this.connecting = false;
                    this.connected = false;
                    reject(e);
                });
            });
            this.connector.connect();
        });
    }
    /**
     * Writes a command over the socket to the routerboard
     * on a new channel
     *
     * @param {string|Array} params
     * @param {Array<string|string[]>} moreParams
     * @returns {Promise}
     */
    write(params, ...moreParams) {
        params = this.concatParams(params, moreParams);
        let chann = this.openChannel();
        this.channelsOpen++;
        // If it's the first connection on the pool, hold the connection
        // to prevent a timeout before receiving a response
        // if the command takes too long to process by the RouterOS
        // on the other end
        if (this.channelsOpen === 1)
            this.holdConnection();
        chann.on('close', () => {
            chann = null; // putting garbage collector to work :]
            this.channelsOpen--;
            // If the channels count reaches 0
            // release the hold created so it can
            // timeout normally
            if (this.channelsOpen === 0)
                this.releaseConnectionHold();
        });
        return chann.write(params);
    }
    /**
     * Returns a stream object for handling continuous data
     * flow.
     *
     * @param {string|Array} params
     * @param {function} callback
     * @returns {RStream}
     */
    stream(params = [], ...moreParams) {
        let callback = moreParams.pop();
        if (typeof callback !== 'function') {
            if (callback)
                moreParams.push(callback);
            callback = null;
        }
        params = this.concatParams(params, moreParams);
        return new RStream_1.RStream(this.openChannel(), params, callback);
    }
    /**
     * Keep the connection alive by running a set of
     * commands provided instead of the random command
     *
     * @param {string|Array} params
     * @param {function} callback
     */
    keepaliveBy(params = [], ...moreParams) {
        this.holdingConnectionWithKeepalive = true;
        if (this.keptaliveby)
            timers_1.clearTimeout(this.keptaliveby);
        let callback = moreParams.pop();
        if (typeof callback !== 'function') {
            if (callback)
                moreParams.push(callback);
            callback = null;
        }
        params = this.concatParams(params, moreParams);
        const exec = () => {
            if (!this.closing) {
                if (this.keptaliveby)
                    timers_1.clearTimeout(this.keptaliveby);
                this.keptaliveby = setTimeout(() => {
                    this.write(params.slice()).then((data) => {
                        if (typeof callback === 'function')
                            callback(null, data);
                        exec();
                    }).catch((err) => {
                        if (typeof callback === 'function')
                            callback(err, null);
                        exec();
                    });
                }, this.timeout * 1000 / 2);
            }
        };
        exec();
    }
    /**
     * Closes the connection.
     * It can be openned again without recreating
     * an object from this class.
     *
     * @returns {Promise}
     */
    close() {
        if (this.closing) {
            return Promise.reject(new RosException_1.RosException('ALRDYCLOSNG'));
        }
        if (!this.connected) {
            return Promise.resolve(this);
        }
        if (this.connectionHoldInterval) {
            timers_1.clearTimeout(this.connectionHoldInterval);
        }
        timers_1.clearTimeout(this.keptaliveby);
        return new Promise((resolve) => {
            this.closing = true;
            this.connector.once('close', () => {
                this.connector.destroy();
                this.connector = null;
                this.closing = false;
                this.connected = false;
                resolve(this);
            });
            this.connector.close();
        });
    }
    /**
     * Opens a new channel either for just writing or streaming
     *
     * @returns {Channel}
     */
    openChannel() {
        return new Channel_1.Channel(this.connector);
    }
    /**
     * Holds the connection if keepalive wasn't set
     * so when a channel opens, ensure that we
     * receive a response before a timeout
     */
    holdConnection() {
        if (this.connected && !this.holdingConnectionWithKeepalive) {
            if (this.connectionHoldInterval)
                timers_1.clearTimeout(this.connectionHoldInterval);
            const holdConnInterval = () => {
                this.connectionHoldInterval = setTimeout(() => {
                    let chann = this.openChannel();
                    chann.on('close', () => { chann = null; });
                    chann.write(['#']).then(() => {
                        holdConnInterval();
                    }).catch(() => {
                        holdConnInterval();
                    });
                }, this.timeout * 1000 / 2);
            };
            holdConnInterval();
        }
    }
    /**
     * Release the connection that was held
     * when waiting for responses from channels open
     */
    releaseConnectionHold() {
        if (this.connectionHoldInterval)
            timers_1.clearTimeout(this.connectionHoldInterval);
    }
    /**
     * Login on the routerboard to provide
     * api functionalities, using the credentials
     * provided.
     *
     * @returns {Promise}
     */
    login() {
        this.connecting = true;
        info('Sending login to %s, waiting for challenge', this.host);
        return this.write('/login').then((data) => {
            info('Received challenge on %s, will send credentials. Data: %o', this.host, data);
            const challenge = new Buffer(this.password.length + 17);
            const challengeOffset = this.password.length + 1;
            const ret = data[0].ret;
            challenge.write(String.fromCharCode(0) + this.password);
            challenge.write(ret, challengeOffset, ret.length, 'hex');
            const resp = '00' + crypto.createHash('MD5').update(challenge).digest('hex');
            return this.write('/login', ['=name=' + this.user, '=response=' + resp]);
        }).then(() => {
            info('Credentials accepted on %s, we are connected', this.host);
            return Promise.resolve(this);
        }).catch((err) => {
            if (err.message === 'cannot log in') {
                err = new RosException_1.RosException('CANTLOGIN');
            }
            this.connector.destroy();
            error('Couldn\'t loggin onto %s, Error: %O', this.host, err);
            return Promise.reject(err);
        });
    }
    concatParams(firstParameter, parameters) {
        if (typeof firstParameter === 'string')
            firstParameter = [firstParameter];
        for (let parameter of parameters) {
            if (typeof parameter === 'string')
                parameter = [parameter];
            if (parameter.length > 0)
                firstParameter = firstParameter.concat(parameter);
        }
        return firstParameter;
    }
}
exports.RouterOSAPI = RouterOSAPI;
//# sourceMappingURL=RouterOSAPI.js.map