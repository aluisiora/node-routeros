"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const net_1 = require("net");
const tls = require("tls");
const Receiver_1 = require("./Receiver");
const Transmitter_1 = require("./Transmitter");
const RosException_1 = require("../RosException");
const debug = require("debug");
const info = debug('routeros-api:connector:connector:info');
const error = debug('routeros-api:connector:connector:error');
/**
 * Connector class responsible for communicating with
 * the routeros via api, sending and receiving buffers.
 *
 * The main focus of this class is to be able to
 * construct and destruct dinamically by the RouterOSAPI class
 * when needed, so the authentication parameters don't
 * need to be changed every time we need to reconnect.
 */
class Connector extends events_1.EventEmitter {
    /**
     * Constructor which receive the options of the connection
     *
     * @param {Object} options
     */
    constructor(options) {
        super();
        /**
         * Connected status
         */
        this.connected = false;
        /**
         * Connecting status
         */
        this.connecting = false;
        /**
         * Closing status
         */
        this.closing = false;
        this.host = options.host;
        if (options.timeout)
            this.timeout = options.timeout;
        if (options.port)
            this.port = options.port;
        if (typeof options.tls === 'boolean' && options.tls)
            options.tls = {};
        if (typeof options.tls === 'object') {
            if (!options.port)
                this.port = 8729;
            this.tls = options.tls;
        }
    }
    /**
     * Connect to the routerboard
     *
     * @returns {Connector}
     */
    connect() {
        if (!this.connected) {
            if (!this.connecting) {
                this.connecting = true;
                if (this.tls) {
                    this.socket = tls.connect(this.port, this.host, this.tls, this.onConnect.bind(this));
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
    }
    /**
     * Writes data through the open socket
     *
     * @param {Array} data
     * @returns {Connector}
     */
    write(data) {
        for (const line of data) {
            this.transmitter.write(line);
        }
        this.transmitter.write(null);
        return this;
    }
    /**
     * Register a tag to receive data
     *
     * @param {string} tag
     * @param {function} callback
     */
    read(tag, callback) {
        this.receiver.read(tag, callback);
    }
    /**
     * Unregister a tag, so it no longer waits for data
     * @param {string} tag
     */
    stopRead(tag) {
        this.receiver.stop(tag);
    }
    /**
     * Start closing the connection
     */
    close() {
        if (!this.closing) {
            this.closing = true;
            this.socket.end();
        }
    }
    /**
     * Destroy the socket, no more data
     * can be exchanged from now on and
     * this class itself must be recreated
     */
    destroy() {
        this.socket.destroy();
        this.removeAllListeners();
    }
    /**
     * Socket connection event listener.
     * After the connection is stablished,
     * ask the transmitter to run any
     * command stored over the pool
     *
     * @returns {function}
     */
    onConnect() {
        this.connecting = false;
        this.connected = true;
        info('Connected on %s', this.host);
        this.transmitter.runPool();
        this.emit('connected', this);
    }
    /**
     * Socket end event listener.
     * Terminates the connection after
     * the socket is released
     *
     * @returns {function}
     */
    onEnd() {
        this.emit('close', this);
        this.destroy();
    }
    /**
     * Socket error event listener.
     * Emmits the error while trying to connect and
     * destroys the socket.
     *
     * @returns {function}
     */
    onError(err) {
        err = new RosException_1.RosException(err.errno, err);
        error('Problem while trying to connect to %s. Error: %s', this.host, err.message);
        this.emit('error', err, this);
        this.destroy();
    }
    /**
     * Socket timeout event listener
     * Emmits timeout error and destroys the socket
     *
     * @returns {function}
     */
    onTimeout() {
        this.emit('timeout', new RosException_1.RosException('SOCKTMOUT', { seconds: this.timeout }), this);
        this.destroy();
    }
    /**
     * Socket data event listener
     * Receives the data and sends it to processing
     *
     * @returns {function}
     */
    onData(data) {
        info('Got data from the socket, will process it');
        this.receiver.processRawData(data);
    }
}
exports.Connector = Connector;
//# sourceMappingURL=Connector.js.map