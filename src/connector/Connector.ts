import { EventEmitter } from 'events';
import { Socket } from 'net';
import { TLSSocket, TlsOptions } from 'tls';
import { Receiver } from './Receiver';
import { Transmitter } from './Transmitter';
import { RosException } from '../RosException';
import * as debug from 'debug';

const info = debug('routeros-api:connector:connector:info');
const error = debug('routeros-api:connector:connector:error');

// interface IConnectorOptions {
//     host: string;
//     port?: number;
//     timeout?: number;
//     tls?: TlsOptions;
// }

export class Connector extends EventEmitter {

    public host: string;
    public port: number = 8728;
    public timeout: number = 10;

    private socket: Socket;
    private transmitter: Transmitter;
    private receiver: Receiver;

    private connected: boolean  = false;
    private connecting: boolean = false;
    private closing: boolean = false;

    private writesPool: Buffer[] = [];

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

    public connect(): Connector {
        if (!this.connected) {
            if (!this.connecting) {
                this.connecting = true;
                this.socket.connect(this.port, this.host);
            }
        }
        return this;
    }

    public write(data: string[]): Connector {
        for (const line of data) {
            this.transmitter.write(line);
        }
        this.transmitter.write(null);
        return this;
    }

    public read(tag: string, callback: (packet: string[]) => void): void {
        this.receiver.read(tag, callback);
    }

    public stopRead(tag: string): void {
        this.receiver.stop(tag);
    }

    public close(): void {
        if (!this.closing) {
            this.closing = true;
            this.socket.end();
        }
    }

    public destroy(): void {
        this.socket.destroy();
        this.removeAllListeners();
    }

    private onConnect(): () => void {
        const $this = this;
        return () => {
            $this.connecting = false;
            $this.connected = true;
            info('Connected');
            $this.transmitter.runPool();
            $this.emit('connected', $this);
        };
    }

    private onEnd(): () => void {
        const $this = this;
        return () => {
            $this.destroy();
            $this.emit('close', $this);
        };
    }

    private onError(): (err: Error) => void {
        const $this = this;
        return (err: Error) => {
            $this.destroy();
            $this.emit('error', err, $this);
        };
    }

    private onTimeout(): () => void {
        const $this = this;
        return () => {
            $this.destroy();
            $this.emit('timeout', new RosException('SOCKTMOUT'), $this);
        };
    }

    private onData(): (data: Buffer) => void {
        const $this = this;
        return (data: Buffer) => {
            info('Got data from the socket, will process it');
            $this.receiver.processRawData(data);
        };
    }

}
