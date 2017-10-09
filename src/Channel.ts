import { EventEmitter } from 'events';
import { Connector } from './connector/Connector';
import * as debug from 'debug';
import i18n from './locale';

const info = debug('routeros-api:channel:info');
const error = debug('routeros-api:channel:error');

interface IRawPacket {
    packet: string[];
    data: (packet: string[]) => {};
    trap: (packet: string[]) => {};
}

export class Channel extends EventEmitter {

    private id: string;
    private connector: Connector;

    private data: any[] = [];
    private trapped: boolean = false;
    private streaming: boolean = false;

    constructor(connector) {
        super();
        this.id = Math.random().toString(36).substring(10, 26);
        this.connector = connector;
        this.once('unknown', this.onUnknown());
    }

    public write(menu: string, params: string[]): Promise<object[]> {
        params = [menu].concat(params);
        params.push('.tag=' + this.id);

        this.on('data', (packet: object) => this.data.push(packet));

        return new Promise((resolve, reject) => {
            this.once('done', () => {
                resolve(this.data);
            });
            this.once('trap', () => {
                reject(new Error(this.data[0].message));
            });

            this.connector.read(this.id, (packet: string[]) => this.processPacket(packet));
            this.connector.write(params);
        });
    }

    public close(): void {
        this.emit('close');
        this.removeAllListeners();
        this.connector.stopRead(this.id);
        return;
    }

    private processPacket(packet: string[]): void {
        const reply = packet.shift();

        info('Processing reply %s with data %o', reply, packet);

        const parsed = this.parsePacket(packet);

        if (packet.length > 0) this.emit('data', parsed);

        switch (reply) {
            case '!re':
                if (this.streaming) this.emit('stream', parsed);
                break;
            case '!done':
                if (this.trapped) this.emit('trap');
                else this.emit('done');
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

    private parsePacket(packet: string[]): object {
        const obj = {};
        for (const line of packet) {
            const linePair = line.split('=');
            linePair.shift(); // remove empty index
            obj[linePair.shift()] = linePair.join('=');
        }
        info('Parsed line, got %o as result', obj);
        return obj;
    }

    private onUnknown(): (reply: string) => void {
        const $this = this;
        return (reply: string) => {
            throw new Error(i18n.t('UNKNOWNREPLY', { reply: reply }));
        };
    }

}
