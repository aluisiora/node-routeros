"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const net_1 = require("net");
const tls_1 = require("tls");
const Receiver_1 = require("./Receiver");
const Transmitter_1 = require("./Transmitter");
const RosException_1 = require("../RosException");
const debug = require("debug");
const info = debug('routeros-api:connector:connector:info');
const error = debug('routeros-api:connector:connector:error');
// interface IConnectorOptions {
//     host: string;
//     port?: number;
//     timeout?: number;
//     tls?: TlsOptions;
// }
class Connector extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.port = 8728;
        this.timeout = 10;
        this.connected = false;
        this.connecting = false;
        this.closing = false;
        this.writesPool = [];
        this.socket = new net_1.Socket();
        this.transmitter = new Transmitter_1.Transmitter(this.socket);
        this.receiver = new Receiver_1.Receiver(this.socket);
        this.host = options.host;
        if (options.timeout)
            this.timeout = options.timeout;
        if (options.port)
            this.port = options.port;
        if (options.tls) {
            if (!options.port)
                this.port = 8729;
            this.socket = new tls_1.TLSSocket(this.socket, options.tls);
        }
        this.socket.once('connect', this.onConnect());
        this.socket.once('end', this.onEnd());
        this.socket.once('timeout', this.onTimeout());
        this.socket.once('fatal', this.onEnd());
        this.socket.on('error', this.onError());
        this.socket.on('data', this.onData());
        this.socket.setTimeout(this.timeout * 1000);
        this.socket.setKeepAlive(true);
    }
    connect() {
        if (!this.connected) {
            if (!this.connecting) {
                this.connecting = true;
                this.socket.connect(this.port, this.host);
            }
        }
        return this;
    }
    write(data) {
        for (const line of data) {
            this.transmitter.write(line);
        }
        this.transmitter.write(null);
        return this;
    }
    read(tag, callback) {
        this.receiver.read(tag, callback);
    }
    stopRead(tag) {
        this.receiver.stop(tag);
    }
    close() {
        if (!this.closing) {
            this.closing = true;
            this.socket.end();
        }
    }
    destroy() {
        this.socket.destroy();
        this.removeAllListeners();
    }
    onConnect() {
        const $this = this;
        return () => {
            $this.connecting = false;
            $this.connected = true;
            info('Connected');
            $this.transmitter.runPool();
            $this.emit('connected', $this);
        };
    }
    onEnd() {
        const $this = this;
        return () => {
            $this.destroy();
            $this.emit('close', $this);
        };
    }
    onError() {
        const $this = this;
        return (err) => {
            $this.destroy();
            $this.emit('error', err, $this);
        };
    }
    onTimeout() {
        const $this = this;
        return () => {
            $this.destroy();
            $this.emit('timeout', new RosException_1.RosException('SOCKTMOUT'), $this);
        };
    }
    onData() {
        const $this = this;
        return (data) => {
            info('Got data from the socket, will process it');
            $this.receiver.processRawData(data);
        };
    }
}
exports.Connector = Connector;
