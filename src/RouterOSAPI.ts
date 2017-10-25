import { TlsOptions } from 'tls';
import { Connector } from './connector/Connector';
import { Channel } from './Channel';
import { RosException } from './RosException';
import { Stream } from './Stream';
import i18n from './locale';
import * as crypto from 'crypto';
import * as debug from 'debug';

const info = debug('routeros-api:api:info');
const error = debug('routeros-api:api:error');

/**
 * The main class of this npm package, this is the class that will
 * be exposed when importing or requiring.
 * The main use of this class is to choose when to connect and
 * write data.
 */
export class RouterOSAPI {

    /**
     * Host to connect
     */
    public host: string;

    /**
     * Username to use
     */
    public user: string;

    /**
     * Password of the username
     */
    public password: string;

    /**
     * Port of the API
     */
    public port: number;

    /**
     * Timeout of the connection
     */
    public timeout: number;

    /**
     * TLS Options to use, if any
     */
    public tls: TlsOptions;

    /**
     * Connected flag
     */
    public connected: boolean  = false;

    /**
     * Connecting flag
     */
    public connecting: boolean = false;

    /**
     * Closing flag
     */
    public closing: boolean = false;

    /**
     * Keep connection alive
     */
    public keepalive: boolean;
    
    /**
     * The connector which will be used
     */
    private connector: Connector;

    /**
     * The function timeout that will keep the connection alive
     */
    private keptaliveby: NodeJS.Timer;

    /**
     * Constructor, also sets the language of the thrown errors
     * 
     * @param {Object} options 
     */
    constructor(options: any) {
        this.host      = options.host;
        this.user      = options.user;
        this.password  = options.password;
        this.port      = options.port || 8728;
        this.timeout   = options.timeout || 10;
        this.tls       = options.tls;
        this.keepalive = options.keepalive || null;
        if (options.locale && options.locale !== 'en') {
            i18n.changeLanguage(options.locale, (err?: Error) => {
                if (err) throw err;
            });
        }
    }

    /**
     * Tries a connection to the routerboard with the provided credentials
     * 
     * @returns {Promise}
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
                    if (this.keepalive) this.keepaliveBy(['#']);
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

    /**
     * Writes a command over the socket to the routerboard
     * on a new channel
     * 
     * @param {string|Array} params 
     * @param {Array} params2
     * @returns {Promise}
     */
    public write(params: string | string[], params2: string[] = []): Promise<object[]> {
        if (typeof params === 'string') params = [params];
        params = params.concat(params2);
        let chann = this.openChannel();
        chann.on('close', () => { chann = null; });
        return chann.write(params);
    }

    /**
     * Returns a stream object for handling continuous data
     * flow.
     * 
     * @param {string|Array} params 
     * @param {function} callback 
     * @returns {Stream}
     */
    public stream(params: string | string[] = [], callback: (err: Error, packet?: any) => void): Stream {
        if (typeof params === 'string') params = [params];
        return new Stream(this.openChannel(), params, callback);
    }

    /**
     * Keep the connection alive by running a set of
     * commands provided instead of the random command
     * 
     * @param {string|Array} params 
     * @param {function} callback 
     */
    public keepaliveBy(params: string | string[] = [], callback?: (err: Error, packet?: any) => void): void {
        if (this.keptaliveby) clearTimeout(this.keptaliveby);

        if (typeof params === 'string') params = [params];

        const exec = () => {
            if (!this.closing) {
                if (this.keptaliveby) clearTimeout(this.keptaliveby);
                this.keptaliveby = setTimeout(() => {
                    this.write(params).then((data) => {
                        if (typeof callback === 'function') callback(null, data);
                        exec();
                    }).catch((err: Error) => {
                        if (typeof callback === 'function') callback(err, null);
                        exec();
                    });
                }, this.timeout * 1000 / 2);
            }
        };
        exec();
    }

    /**
     * Closes the connection.
     * It can be openned again without recreating
     * an object from this class.
     * 
     * @returns {Promise}
     */
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

    /**
     * Opens a new channel either for just writing or streaming
     * 
     * @returns {Channel}
     */
    private openChannel(): Channel {
        return new Channel(this.connector);
    }

    /**
     * Login on the routerboard to provide
     * api functionalities, using the credentials
     * provided.
     * 
     * @returns {Promise}
     */
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
