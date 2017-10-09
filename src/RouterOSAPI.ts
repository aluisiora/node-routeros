import { TlsOptions } from 'tls';
import { Connector } from './connector/Connector';
import { Channel } from './Channel';
import { RosException } from './RosException';
import i18n from './locale';
import * as crypto from 'crypto';
import * as debug from 'debug';

const info = debug('routeros-api:api:info');
const error = debug('routeros-api:api:error');

// interface IRouterOSAPIOptions {
//     host: string;
//     port?: number;
//     timeout?: number;
//     tls?: TlsOptions;
//     user: string;
//     password?: string;
// }

export class RouterOSAPI {

    public host: string;
    public user: string;
    public password: string;
    public port: number;
    public timeout: number;
    public tls: TlsOptions;
    public connected: boolean  = false;
    public connecting: boolean = false;
    public closing: boolean = false;

    private connector: Connector;

    constructor(options: any) {
        this.host     = options.host;
        this.user     = options.user;
        this.password = options.password;
        this.port     = options.port;
        this.timeout  = options.timeout;
        this.tls      = options.tls;
        i18n.changeLanguage(options.locale || 'en', (err?: Error) => {
            if (err) throw err;
        });
    }

    /**
     *
     */
    public connect(): Promise<RouterOSAPI> {
        if (this.connecting) return;
        if (this.connected) return Promise.resolve(this);

        info('Connecting on %s', this.host);

        this.connecting = true;
        this.connected = false;

        if (this.connector) {
            info('Already had a connector object, going to purge and recreate it');
            this.connector.destroy();
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
                    info('Logged in on %s', this.host);
                    resolve(this);
                }).catch((e: Error) => {
                    this.connecting = false;
                    this.connected = false;
                    reject(e);
                });
            });
            this.connector.once('error', (e: Error) => reject(e));
            this.connector.once('timeout', (e: Error) => reject(e));

            this.connector.connect();
        });
    }

    public write(menu: string, params: string[] = []): Promise<object[]> {
        let chann = this.openChannel();
        chann.on('close', () => { chann = null; });
        return chann.write(menu, params);
    }

    public close(): Promise<RouterOSAPI> {
        if (this.closing) {
            return Promise.reject(new RosException('ALRDYCLOSNG'));
        }

        if (!this.connected) {
            return Promise.resolve(this);
        }

        return new Promise((resolve) => {
            this.closing = true;
            this.connector.close();
            this.connector.once('close', () => resolve(this));
        });
    }

    private openChannel(): Channel {
        return new Channel(this.connector);
    }

    private login(): Promise<RouterOSAPI> {
        this.connecting = true;
        info('Sending login to %s, waiting for challenge', this.host);
        return this.write('/login').then((data: object) => {
            info('Received challenge on %s, will send credentials. Data: %o', this.host, data);

            const challenge = new Buffer(this.password.length + 17);
            const challengeOffset = this.password.length + 1;
            const ret = data[0].ret;

            challenge.write(String.fromCharCode(0) + this.password);
            challenge.write(ret, challengeOffset, ret.length - challengeOffset, 'hex');

            const resp = '00' + crypto.createHash('MD5').update(challenge).digest('hex');

            return this.write('/login', ['=name=' + this.user, '=response=' + resp]);
        }).then(() => {
            info('Credentials accepted on %s, we are connected', this.host);
            return Promise.resolve(this);
        }).catch((err: Error) => {
            if (err.message === 'cannot log in') {
                err = new RosException('CANTLOGIN');
            }
            this.connector.destroy();
            error('Couldn\'t loggin onto %s, Error: %O', this.host, err);
            return Promise.reject(err);
        });
    }

}
