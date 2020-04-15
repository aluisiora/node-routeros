import { EventEmitter } from 'events';
import { Socket } from 'net';
import * as tls from 'tls';
import { Receiver } from './Receiver';
import { Transmitter } from './Transmitter';
import { RosException } from '../RosException';
import * as debug from 'debug';

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
export class Connector extends EventEmitter {
    /**
     * The host or address of where to connect to
     */
    public host: string;

    /**
     * The port of the API
     */
    public port: number;

    /**
     * The timeout in seconds of the connection
     */
    public timeout: number;

    /**
     * The socket of the connection
     */
    private socket: Socket;

    /**
     * The transmitter object to write commands
     */
    private transmitter: Transmitter;

    /**
     * The receiver object to read commands
     */
    private receiver: Receiver;

    /**
     * Connected status
     */
    private connected: boolean = false;

    /**
     * Connecting status
     */
    private connecting: boolean = false;

    /**
     * Closing status
     */
    private closing: boolean = false;

    /**
     * TLS data
     */
    private tls: tls.ConnectionOptions;

    /**
     * Constructor which receive the options of the connection
     *
     * @param {Object} options
     */
    constructor(options: any) {
        super();

        this.host = options.host;
        if (options.timeout) this.timeout = options.timeout;
        if (options.port) this.port = options.port;
        if (typeof options.tls === 'boolean' && options.tls) options.tls = {};
        if (typeof options.tls === 'object') {
            if (!options.port) this.port = 8729;
            this.tls = options.tls;
        }
    }

    /**
     * Connect to the routerboard
     *
     * @returns {Connector}
     */
    public connect(): Connector {
        if (!this.connected) {
            if (!this.connecting) {
                this.connecting = true;
                if (this.tls) {
                    this.socket = tls.connect(
                        this.port,
                        this.host,
                        this.tls,
                        this.onConnect.bind(this),
                    );
                    this.transmitter = new Transmitter(this.socket);
                    this.receiver = new Receiver(this.socket);
                    this.socket.on('data', this.onData.bind(this));
                    this.socket.on('tlsClientError', this.onError.bind(this));
                    this.socket.once('end', this.onEnd.bind(this));
                    this.socket.once('timeout', this.onTimeout.bind(this));
                    this.socket.once('fatal', this.onEnd.bind(this));
                    this.socket.on('error', this.onError.bind(this));
                    this.socket.setTimeout(this.timeout * 1000);
                    this.socket.setKeepAlive(true);
                } else {
                    this.socket = new Socket();
                    this.transmitter = new Transmitter(this.socket);
                    this.receiver = new Receiver(this.socket);
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
    public write(data: string[]): Connector {
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
    public read(tag: string, callback: (packet: string[]) => void): void {
        this.receiver.read(tag, callback);
    }

    /**
     * Unregister a tag, so it no longer waits for data
     * @param {string} tag
     */
    public stopRead(tag: string): void {
        this.receiver.stop(tag);
    }

    /**
     * Start closing the connection
     */
    public close(): void {
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
    public destroy(): void {
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
    private onConnect(): void {
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
    private onEnd(): void {
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
    private onError(err: any): void {
        err = new RosException(err.errno, err);
        error(
            'Problem while trying to connect to %s. Error: %s',
            this.host,
            err.message,
        );
        this.emit('error', err, this);
        this.destroy();
    }

    /**
     * Socket timeout event listener
     * Emmits timeout error and destroys the socket
     *
     * @returns {function}
     */
    private onTimeout(): void {
        this.emit(
            'timeout',
            new RosException('SOCKTMOUT', { seconds: this.timeout }),
            this,
        );
        this.destroy();
    }

    /**
     * Socket data event listener
     * Receives the data and sends it to processing
     *
     * @returns {function}
     */
    private onData(data: Buffer): void {
        info('Got data from the socket, will process it');
        this.receiver.processRawData(data);
    }
}
