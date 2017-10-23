import { EventEmitter } from 'events';
import { Socket } from 'net';
import { TLSSocket, TlsOptions } from 'tls';
import { Receiver } from './Receiver';
import { Transmitter } from './Transmitter';
import { RosException } from '../RosException';
import * as debug from 'debug';
import i18n from '../locale';

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
    private connected: boolean  = false;

    /**
     * Connecting status
     */
    private connecting: boolean = false;

    /**
     * Closing status
     */
    private closing: boolean = false;

    /**
     * Constructor which receive the options of the connection
     * 
     * @param options 
     */
    constructor(options: any) {
        super();

        this.socket      = new Socket();
        this.transmitter = new Transmitter(this.socket);
        this.receiver    = new Receiver(this.socket);

        this.host = options.host;
        if (options.timeout) this.timeout = options.timeout;
        if (options.port) this.port = options.port;
        if (options.tls) {
            if (!options.port) this.port = 8729;
            this.socket = new TLSSocket(this.socket, options.tls);
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

    /**
     * Connect to the routerboard
     */
    public connect(): Connector {
        if (!this.connected) {
            if (!this.connecting) {
                this.connecting = true;
                this.socket.connect(this.port, this.host);
            }
        }
        return this;
    }

    /**
     * Writes data through the open socket
     * 
     * @param data 
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
     * @param tag 
     * @param callback 
     */
    public read(tag: string, callback: (packet: string[]) => void): void {
        this.receiver.read(tag, callback);
    }

    /**
     * Unregister a tag, so it no longer waits for data
     * @param tag 
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
     */
    private onConnect(): () => void {
        const $this = this;
        return () => {
            $this.connecting = false;
            $this.connected = true;
            info('Connected on %s', $this.host);
            $this.transmitter.runPool();
            $this.emit('connected', $this);
        };
    }

    /**
     * Socket end event listener.
     * Terminates the connection after
     * the socket is released
     */
    private onEnd(): () => void {
        const $this = this;
        return () => {
            $this.emit('close', $this);
            $this.destroy();
        };
    }

    /**
     * Socket error event listener.
     * Emmits the error while trying to connect and
     * destroys the socket.
     */
    private onError(): (err: any) => void {
        const $this = this;
        return (err: any) => {
            err = new RosException(err.errno, err);
            error('Problem while trying to connect to %s. Error: %s', $this.host, err.message);
            $this.emit('error', err, $this);
            $this.destroy();
        };
    }

    /**
     * Socket timeout event listener
     * Emmits timeout error and destroys the socket
     */
    private onTimeout(): () => void {
        const $this = this;
        return () => {
            $this.emit('timeout', new RosException('SOCKTMOUT', { seconds: $this.timeout}), $this);
            $this.destroy();
        };
    }

    /**
     * Socket data event listener
     * Receives the data and sends it to processing
     */
    private onData(): (data: Buffer) => void {
        const $this = this;
        return (data: Buffer) => {
            info('Got data from the socket, will process it');
            $this.receiver.processRawData(data);
        };
    }

}
