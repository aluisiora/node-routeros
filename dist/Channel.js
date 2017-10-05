import { EventEmitter } from 'events';
export class Channel extends EventEmitter {
    constructor(connector) {
        super();
        this.trapped = false;
        this.id = Math.random().toString(24);
        this.connector = connector;
        this.once('unknown', (reply) => {
            throw new Error(lang('unknown reply', reply));
        });
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
        switch (reply) {
            case '!re':
                this.emit('data', this.parsePacket(packet));
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
                this.data = [this.parsePacket(packet)];
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
        return obj;
    }
}
