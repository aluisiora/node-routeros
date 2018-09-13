"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    }
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
exports.__esModule = true;
var events_1 = require("events");
var RosException_1 = require("../RosException");
var debug = require("debug");
var info = debug('routeros-api:connector:connector:info');
var error = debug('routeros-api:connector:connector:error');
/**
 * Connector class responsible for communicating with
 * the routeros via api, sending and receiving buffers.
 *
 * The main focus of this class is to be able to
 * construct and destruct dinamically by the RouterOSAPI class
 * when needed, so the authentication parameters don't
 * need to be changed every time we need to reconnect.
 */
var Connector = /** @class */ (function (_super) {
    __extends(Connector, _super);
    /**
     * Constructor which receive the options of the connection
     *
     * @param {Object} options
     */
    function Connector(options) {
        var _this = _super.call(this) || this;
        /**
         * Connected status
         */
        _this.connected = false;
        /**
         * Connecting status
         */
        _this.connecting = false;
        /**
         * Closing status
         */
        _this.closing = false;
        _this.host = options.host;
        if (options.timeout)
            _this.timeout = options.timeout;
        if (options.port)
            _this.port = options.port;
        if (typeof options.tls === 'boolean' && options.tls)
            options.tls = {};
        if (typeof options.tls === 'object') {
            if (!options.port)
                _this.port = 8729;
            _this.tls = options.tls;
        }
        return _this;
    }
    /**
     * Connect to the routerboard
     *
     * @returns {Connector}
     */
    Connector.prototype.connect = function () {
        if (!this.connected) {
            if (!this.connecting) {
                this.connecting = true;
                if (this.tls) {
                    this.socket = tls_1.connect(this.port, this.host, this.tls, this.onConnect.bind(this));
                    this.transmitter = new Transmitter_1.Transmitter(this.socket);
                    this.receiver = new Receiver_1.Receiver(this.socket);
                    this.socket.on('data', this.onData.bind(this));
                    this.socket.on('tlsClientError', this.onError.bind(this));
                }
                else {
                    this.socket = new net_1.Socket();
                    this.transmitter = new Transmitter_1.Transmitter(this.socket);
                    this.receiver = new Receiver_1.Receiver(this.socket);
                    this.socket.once('connect', this.onConnect.bind(this));
                    this.socket.once('end', this.onEnd.bind(this));
                    this.socket.once('timeout', this.onTimeout.bind(this));
                    this.socket.once('fatal', this.onEnd.bind(this));
                    this.socket.on('error', this.onError.bind(this));
                    this.socket.on('data', this.onData.bind(this));
                    this.socket.setTimeout(this.timeout * 1000);
                    this.socket.setKeepAlive(true);
                    this.socket.connect(this.port, this.host);
                }
            }
        }
        return this;
    };
    /**
     * Writes data through the open socket
     *
     * @param {Array} data
     * @returns {Connector}
     */
    Connector.prototype.write = function (data) {
        for (var _i = 0, data_1 = data; _i < data_1.length; _i++) {
            var line = data_1[_i];
            this.transmitter.write(line);
        }
        this.transmitter.write(null);
        return this;
    };
    /**
     * Register a tag to receive data
     *
     * @param {string} tag
     * @param {function} callback
     */
    Connector.prototype.read = function (tag, callback) {
        this.receiver.read(tag, callback);
    };
    /**
     * Unregister a tag, so it no longer waits for data
     * @param {string} tag
     */
    Connector.prototype.stopRead = function (tag) {
        this.receiver.stop(tag);
    };
    /**
     * Start closing the connection
     */
    Connector.prototype.close = function () {
        if (!this.closing) {
            this.closing = true;
            this.socket.end();
        }
    };
    /**
     * Destroy the socket, no more data
     * can be exchanged from now on and
     * this class itself must be recreated
     */
    Connector.prototype.destroy = function () {
        this.socket.destroy();
        this.removeAllListeners();
    };
    /**
     * Socket connection event listener.
     * After the connection is stablished,
     * ask the transmitter to run any
     * command stored over the pool
     *
     * @returns {function}
     */
    Connector.prototype.onConnect = function () {
        this.connecting = false;
        this.connected = true;
        info('Connected on %s', this.host);
        this.transmitter.runPool();
        this.emit('connected', this);
    };
    /**
     * Socket end event listener.
     * Terminates the connection after
     * the socket is released
     *
     * @returns {function}
     */
    Connector.prototype.onEnd = function () {
        this.emit('close', this);
        this.destroy();
    };
    /**
     * Socket error event listener.
     * Emmits the error while trying to connect and
     * destroys the socket.
     *
     * @returns {function}
     */
    Connector.prototype.onError = function (err) {
        err = new RosException_1.RosException(err.errno, err);
        error('Problem while trying to connect to %s. Error: %s', this.host, err.message);
        this.emit('error', err, this);
        this.destroy();
    };
    /**
     * Socket timeout event listener
     * Emmits timeout error and destroys the socket
     *
     * @returns {function}
     */
    Connector.prototype.onTimeout = function () {
        this.emit('timeout', new RosException_1.RosException('SOCKTMOUT', { seconds: this.timeout }), this);
        this.destroy();
    };
    /**
     * Socket data event listener
     * Receives the data and sends it to processing
     *
     * @returns {function}
     */
    Connector.prototype.onData = function (data) {
        info('Got data from the socket, will process it');
        this.receiver.processRawData(data);
    };
    return Connector;
}(events_1.EventEmitter));
exports.Connector = Connector;
