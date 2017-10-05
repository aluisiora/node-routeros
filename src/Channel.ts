declare const lang;

import { EventEmitter } from 'events';

import { Connector } from './connector/Connector';

interface IRawPacket {
    packet: string[];
    data: (packet: string[]) => {};
    trap: (packet: string[]) => {};
}

export class Channel extends EventEmitter {

    private id: string;
    private connector: Connector;

    private data: any[];
    private trapped: boolean = false;

    constructor(connector) {
        super();
        this.id = Math.random().toString(24);
        this.connector = connector;

        this.once('unknown', (reply) => {
            throw new Error(lang('unknown reply', reply));
        });
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

        switch (reply) {
            case '!re':
                this.emit('data', this.parsePacket(packet));
                break;
            case '!done':
                if (this.trapped) this.emit('trap');
                else this.emit('done');
                this.close();
                break;
            case '!trap':
                this.trapped = true;
                this.data = [this.parsePacket(packet)];
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
        return obj;
    }

}
