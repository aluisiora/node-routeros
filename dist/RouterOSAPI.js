import { Connector } from './connector/Connector';
import { Channel } from './Channel';
import * as crypto from 'crypto';
export class RouterOSAPI {
    constructor(options) {
        this.connected = false;
        this.connecting = false;
        this.host = options.host;
        this.user = options.user;
        this.password = options.password;
        this.port = options.port;
        this.timeout = options.timeout;
        this.tls = options.tls;
    }
    connect() {
        if (this.connecting)
            return;
        if (this.connected)
            return Promise.resolve(this);
        this.connecting = true;
        this.connected = false;
        if (this.connector) {
            this.connector.close();
            delete this.connector;
        }
        this.connector = new Connector({
            host: this.host,
            port: this.port,
            timeout: this.timeout,
            tls: this.tls,
        });
        return new Promise((resolve, reject) => {
            this.connector.once('connected', () => {
                this.login().then(() => {
                    this.connecting = false;
                    this.connected = true;
                    resolve(this);
                }, (e) => {
                    this.connecting = false;
                    this.connected = false;
                    reject(e);
                });
            });
            this.connector.once('error', (e) => reject(e));
            this.connector.once('timeout', (e) => reject(e));
            this.connector.once('close', (e) => reject(e));
            this.connector.connect();
        });
    }
    write(menu, params = []) {
        let chann = this.openChannel();
        chann.on('close', () => { chann = null; });
        return chann.write(menu, params);
    }
    setLocale(locale) {
        i18n.setLocale(locale);
    }
    openChannel() {
        return new Channel(this.connector);
    }
    login() {
        this.connecting = true;
        return this.write('/login').then((data) => {
            const challenge = new Buffer(this.password.length + 17);
            const challengeOffset = this.password.length + 1;
            challenge.write(String.fromCharCode(0) + this.password, 0);
            challenge.write(data[0].ret, challengeOffset, data[0].ret - challengeOffset, 'hex');
            const resp = '00' + crypto.createHash('MD5').update(challenge).digest('hex');
            return this.write('/login', ['=name=' + this.user, '=response=' + resp]);
        }).then(() => {
            return Promise.resolve(this);
        }).catch((err) => {
            return Promise.reject(err);
        });
    }
}
