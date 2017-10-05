declare const lang;

import { EventEmitter } from 'events';
import { Socket } from 'net';
import { TLSSocket, TlsOptions } from 'tls';

import { Receiver } from './Receiver';
import { Transmitter } from './Transmitter';

export interface IConnectorOptions {
    host: string;
    port?: number;
    timeout?: number;
    tls?: TlsOptions;
}

export class Connector extends EventEmitter {

    public host: string;
    public port: number = 8728;
    public timeout: number = 10;

    private socket: Socket;
    private transmitter: Transmitter;
    private receiver: Receiver;

    private connected: boolean  = false;
    private connecting: boolean = false;

    private writesPool: Buffer[] = [];

    constructor(options: IConnectorOptions) {
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

        this.socket.once('connect', this.onConnect);
        this.socket.once('end', this.onEnd);
        this.socket.once('error', this.onError);
        this.socket.once('timeout', this.onTimeout);
        this.socket.once('fatal', this.onEnd);

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
        this.transmitter.write(String.fromCharCode(0));
        return this;
    }

    public read(tag: string, callback: (packet: string[]) => void): void {
        this.receiver.read(tag, callback);
    }

    public stopRead(tag: string): void {
        this.receiver.stop(tag);
    }

    public close(): void {
        this.socket.end();
    }

    public end(): void {
        this.close();
    }

    public destroy(): void {
        this.socket.destroy();
        this.removeAllListeners();
    }

    private onConnect(): void {
        this.connecting  = false;
        this.connected   = true;
        this.emit('connected', this);
    }

    private onEnd(): void {
        this.destroy();
        this.emit('close', this);
    }

    private onError(e: Error): void {
        this.destroy();
        this.emit('error', e, this);
    }

    private onTimeout(): void {
        this.destroy();
        this.emit('timeout', new Error(lang('socket timeout', this.timeout)), this);
    }

}
