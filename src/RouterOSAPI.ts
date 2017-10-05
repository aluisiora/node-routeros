declare const i18n;
declare const lang;

import { TlsOptions } from 'tls';

import { Connector, IConnectorOptions } from './connector/Connector';
import { Channel } from './Channel';

import * as crypto from 'crypto';

interface IRouterOSAPIOptions extends IConnectorOptions {
    user: string;
    password?: string;
}

export class RouterOSAPI {

    public host: string;
    public user: string;
    public password: string;
    public port: number;
    public timeout: number;
    public tls: TlsOptions;
    public connected: boolean  = false;
    public connecting: boolean = false;
    public status: string;

    private connector: Connector;

    constructor(options: IRouterOSAPIOptions) {
        this.host     = options.host;
        this.user     = options.user;
        this.password = options.password;
        this.port     = options.port;
        this.timeout  = options.timeout;
        this.tls      = options.tls;
    }

    public connect(): Promise<RouterOSAPI> {
        if (this.connecting) return;
        if (this.connected) return Promise.resolve(this);

        this.connecting = true;
        this.connected = false;

        if (this.connector) {
            this.connector.close();
            delete this.connector;
        }

        this.connector = new Connector({
            host   : this.host,
            port   : this.port,
            timeout: this.timeout,
            tls    : this.tls,
        });

        return new Promise((resolve, reject) => {
            this.connector.once('connected', () => {
                this.login().then(() => {
                    this.connecting = false;
                    this.connected = true;
                    resolve(this);
                }, (e: Error) => {
                    this.connecting = false;
                    this.connected = false;
                    reject(e);
                });
            });
            this.connector.once('error', (e: Error) => reject(e));
            this.connector.once('timeout', (e: Error) => reject(e));
            this.connector.once('close', (e: Error) => reject(e));
            this.connector.connect();
        });
    }

    public write(menu: string, params: string[] = []): Promise<object[]> {
        let chann = this.openChannel();
        chann.on('close', () => { chann = null; });
        return chann.write(menu, params);
    }

    public setLocale(locale: string): void {
        i18n.setLocale(locale);
    }

    private openChannel(): Channel {
        return new Channel(this.connector);
    }

    private login(): Promise<RouterOSAPI> {
        this.connecting = true;
        return this.write('/login').then((data: object) => {
            const challenge = new Buffer(this.password.length + 17);
            const challengeOffset = this.password.length + 1;
            challenge.write(String.fromCharCode(0) + this.password, 0);
            challenge.write(data[0].ret, challengeOffset, data[0].ret - challengeOffset, 'hex');
            const resp = '00' + crypto.createHash('MD5').update(challenge).digest('hex');
            return this.write('/login', ['=name=' + this.user, '=response=' + resp]);
        }).then(() => {
            return Promise.resolve(this);
        }).catch((err: Error) => {
            return Promise.reject(err);
        });
    }

}
