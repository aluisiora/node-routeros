import { EventEmitter } from 'events';
import { Socket } from 'net';
import { TLSSocket } from 'tls';
import { Receiver } from './Receiver';
import { Transmitter } from './Transmitter';
export class Connector extends EventEmitter {
    constructor(options) {
        super();
        this.port = 8728;
        this.timeout = 10;
        this.connected = false;
        this.connecting = false;
        this.writesPool = [];
        this.socket = new Socket();
        this.transmitter = new Transmitter(this.socket);
        this.receiver = new Receiver(this.socket);
        this.host = options.host;
        if (options.timeout)
            this.timeout = options.timeout;
        if (options.port)
            this.port = options.port;
        if (options.tls) {
            if (!options.port)
                this.port = 8729;
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
        this.transmitter.write(String.fromCharCode(0));
        return this;
    }
    read(tag, callback) {
        this.receiver.read(tag, callback);
    }
    stopRead(tag) {
        this.receiver.stop(tag);
    }
    close() {
        this.socket.end();
    }
    end() {
        this.close();
    }
    destroy() {
        this.socket.destroy();
        this.removeAllListeners();
    }
    onConnect() {
        this.connecting = false;
        this.connected = true;
        this.emit('connected', this);
    }
    onEnd() {
        this.destroy();
        this.emit('close', this);
    }
    onError(e) {
        this.destroy();
        this.emit('error', e, this);
    }
    onTimeout() {
        this.destroy();
        this.emit('timeout', new Error(lang('socket timeout', this.timeout)), this);
    }
}
