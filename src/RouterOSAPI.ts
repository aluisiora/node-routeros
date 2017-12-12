import { TlsOptions } from 'tls';
import { Connector } from './connector/Connector';
import { Channel } from './Channel';
import { RosException } from './RosException';
import { IRosOptions } from './IRosOptions';
import { Stream } from './Stream';
import i18n from './locale';
import * as crypto from 'crypto';
import * as debug from 'debug';
import { setInterval, clearTimeout } from 'timers';
import { EventEmitter } from 'events';

const info = debug('routeros-api:api:info');
const error = debug('routeros-api:api:error');

/**
 * Creates a connection object with the credentials provided
 */
export class RouterOSAPI extends EventEmitter {

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
     * Counter for channels open
     */
    private channelsOpen: number = 0;

    /**
     * Flag if the connection was held by the keepalive parameter
     * or keepaliveBy function
     */
    private holdingConnectionWithKeepalive: boolean = false;

    /**
     * Store the timeout when holding the connection
     * when waiting for a channel response
     */
    private connectionHoldInterval: NodeJS.Timer;

    private errorCallback: (e: Error) => void;

    /**
     * Constructor, also sets the language of the thrown errors
     * 
     * @param {Object} options 
     */
    constructor(options: IRosOptions) {
        super();
        this.host      = options.host;
        this.user      = options.user;
        this.password  = options.password;
        this.port      = options.port || 8728;
        this.timeout   = options.timeout || 10;
        this.tls       = options.tls;
        this.keepalive = options.keepalive || false;
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
            const errorListener = (e: Error) => reject(e);
            const timeoutListener = (e: Error) => reject(e);

            this.connector.once('error', errorListener);
            this.connector.once('timeout', timeoutListener);

            this.connector.once('connected', () => {
                this.login().then(() => {
                    this.connecting = false;
                    this.connected = true;

                    this.connector.removeListener('error', errorListener);
                    this.connector.removeListener('timeout', timeoutListener);

                    this.connector.once('error', (e: Error) => this.emit('error', e));
                    this.connector.once('timeout', (e: Error) => this.emit('error', e));

                    if (this.keepalive) this.keepaliveBy('#');

                    info('Logged in on %s', this.host);

                    resolve(this);
                }).catch((e: Error) => {
                    this.connecting = false;
                    this.connected = false;
                    reject(e);
                });
            });

            this.connector.connect();
        });
    }

    /**
     * Writes a command over the socket to the routerboard
     * on a new channel
     * 
     * @param {string|Array} params 
     * @param {Array<string|string[]>} moreParams
     * @returns {Promise}
     */
    public write(params: string | string[], ...moreParams: Array<string|string[]>): Promise<object[]> {
        params = this.concatParams(params, moreParams);
        let chann = this.openChannel();
        this.channelsOpen++;

        // If it's the first connection on the pool, hold the connection
        // to prevent a timeout before receiving a response
        // if the command takes too long to process by the RouterOS
        // on the other end
        if (this.channelsOpen === 1) this.holdConnection();

        chann.on('close', () => { 
            chann = null; // putting garbage collector to work :]
            this.channelsOpen--;

            // If the channels count reaches 0
            // release the hold created so it can
            // timeout normally
            if (this.channelsOpen === 0) this.releaseConnectionHold();
        });
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
    public stream(params: string | string[] = [], ...moreParams: any[]): Stream {
        let callback = moreParams.pop();
        if (typeof callback !== 'function') {
            if (callback) moreParams.push(callback);
            callback = null;
        }
        params = this.concatParams(params, moreParams);
        return new Stream(this.openChannel(), params, callback);
    }

    /**
     * Keep the connection alive by running a set of
     * commands provided instead of the random command
     * 
     * @param {string|Array} params 
     * @param {function} callback 
     */
    public keepaliveBy(params: string | string[] = [], ...moreParams: any[]): void {
        this.holdingConnectionWithKeepalive = true;

        if (this.keptaliveby) clearTimeout(this.keptaliveby);

        let callback = moreParams.pop();
        if (typeof callback !== 'function') {
            if (callback) moreParams.push(callback);
            callback = null;
        }
        params = this.concatParams(params, moreParams);

        const exec = () => {
            if (!this.closing) {
                if (this.keptaliveby) clearTimeout(this.keptaliveby);
                this.keptaliveby = setTimeout(() => {
                    this.write(params.slice()).then((data) => {
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

        if (this.connectionHoldInterval) {
            clearTimeout(this.connectionHoldInterval);
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
     * Holds the connection if keepalive wasn't set
     * so when a channel opens, ensure that we
     * receive a response before a timeout
     */
    private holdConnection() {
        if (this.connected && !this.holdingConnectionWithKeepalive) {
            if (this.connectionHoldInterval) clearTimeout(this.connectionHoldInterval);
            const holdConnInterval = () => {
                this.connectionHoldInterval = setTimeout(() => {
                    let chann = this.openChannel();
                    chann.on('close', () => { chann = null; });
                    chann.write(['#']).then(() => {
                        holdConnInterval();
                    }).catch(() => {
                        holdConnInterval();
                    });
                }, this.timeout * 1000 / 2);
            };
            holdConnInterval();
        }
    }

    /**
     * Release the connection that was held
     * when waiting for responses from channels open
     */
    private releaseConnectionHold() {
        if (this.connectionHoldInterval) clearTimeout(this.connectionHoldInterval);
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

    private concatParams(firstParameter: string | string[], parameters: any[]) {
        if (typeof firstParameter === 'string') firstParameter = [firstParameter];
        for (let parameter of parameters) {
            if (typeof parameter === 'string') parameter = [parameter];
            if (parameter.length > 0) firstParameter = firstParameter.concat(parameter);
        }
        return firstParameter;
    }

}
