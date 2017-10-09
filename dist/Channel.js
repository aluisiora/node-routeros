"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const i18n = require("i18n");
const debug = require("debug");
const info = debug('routeros-api:channel:info');
const error = debug('routeros-api:channel:error');
class Channel extends events_1.EventEmitter {
    constructor(connector) {
        super();
        this.data = [];
        this.trapped = false;
        this.streaming = false;
        this.id = Math.random().toString(36).substring(10, 26);
        this.connector = connector;
        this.once('unknown', this.onUnknown());
    }
    write(menu, params) {
        params = [menu].concat(params);
        params.push('.tag=' + this.id);
        this.on('data', (packet) => this.data.push(packet));
        return new Promise((resolve, reject) => {
            this.once('done', () => {
                resolve(this.data);
            });
            this.once('trap', () => {
                reject(new Error(this.data[0].message));
            });
            this.connector.read(this.id, (packet) => this.processPacket(packet));
            this.connector.write(params);
        });
    }
    close() {
        this.emit('close');
        this.removeAllListeners();
        this.connector.stopRead(this.id);
        return;
    }
    processPacket(packet) {
        const reply = packet.shift();
        info('Processing reply %s with data %o', reply, packet);
        const parsed = this.parsePacket(packet);
        if (packet.length > 0)
            this.emit('data', parsed);
        switch (reply) {
            case '!re':
                if (this.streaming)
                    this.emit('stream', parsed);
                break;
            case '!done':
                if (this.trapped)
                    this.emit('trap');
                else
                    this.emit('done');
                this.close();
                break;
            case '!trap':
                this.trapped = true;
                this.data = [parsed];
                break;
            default:
                this.emit('unknown', reply);
                this.close();
                break;
        }
    }
    parsePacket(packet) {
        const obj = {};
        for (const line of packet) {
            const linePair = line.split('=');
            linePair.shift(); // remove empty index
            obj[linePair.shift()] = linePair.join('=');
        }
        info('Parsed line, got %o as result', obj);
        return obj;
    }
    onUnknown() {
        const $this = this;
        return (reply) => {
            throw new Error(i18n.__('unknown reply', reply));
        };
    }
}
exports.Channel = Channel;
