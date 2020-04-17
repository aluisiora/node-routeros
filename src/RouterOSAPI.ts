import { TlsOptions } from 'tls';
import { Connector } from './connector/Connector';
import { Channel } from './Channel';
import { RosException } from './RosException';
import { IRosOptions } from './IRosOptions';
import { RStream } from './RStream';
import * as crypto from 'crypto';
import * as debug from 'debug';
import { clearTimeout } from 'timers';
import { EventEmitter } from 'events';
import { IRosGenericResponse } from './IRosGenericResponse';

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
    public connected: boolean = false;

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

    private registeredStreams: RStream[] = [];

    /**
     * Constructor, also sets the language of the thrown errors
     *
     * @param {Object} options
     */
    constructor(options: IRosOptions) {
        super();
        this.setOptions(options);
    }

    /**
     * Set connection options, affects before connecting
     *
     * @param options connection options
     */
    public setOptions(options: IRosOptions): void {
        this.host = options.host;
        this.user = options.user;
        this.password = options.password;
        this.port = options.port || 8728;
        this.timeout = options.timeout || 10;
        this.tls = options.tls;
        this.keepalive = options.keepalive || false;
    }

    /**
     * Tries a connection to the routerboard with the provided credentials
     *
     * @returns {Promise}
     */
    public connect(): Promise<RouterOSAPI> {
        if (this.connecting) return Promise.reject('ALRDYCONNECTING');
        if (this.connected) return Promise.resolve(this);

        info('Connecting on %s', this.host);

        this.connecting = true;
        this.connected = false;

        this.connector = new Connector({
            host: this.host,
            port: this.port,
            timeout: this.timeout,
            tls: this.tls,
        });

        return new Promise((resolve, reject) => {
            const endListener = (e?: Error) => {
                this.stopAllStreams();
                this.connected = false;
                this.connecting = false;
                if (e) reject(e);
            };

            this.connector.once('error', endListener);
            this.connector.once('timeout', endListener);
            this.connector.once('close', () => {
                this.emit('close');
                endListener();
            });

            this.connector.once('connected', () => {
                this.login()
                    .then(() => {
                        this.connecting = false;
                        this.connected = true;

                        this.connector.removeListener('error', endListener);
                        this.connector.removeListener('timeout', endListener);

                        const connectedErrorListener = (e: Error) => {
                            this.connected = false;
                            this.connecting = false;
                            this.emit('error', e);
                        };

                        this.connector.once('error', connectedErrorListener);
                        this.connector.once('timeout', connectedErrorListener);

                        if (this.keepalive) this.keepaliveBy('#');

                        info('Logged in on %s', this.host);

                        resolve(this);
                    })
                    .catch((e: RosException) => {
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
    public write(
        params: string | string[],
        ...moreParams: Array<string | string[]>
    ): Promise<IRosGenericResponse[]> {
        params = this.concatParams(params, moreParams);
        let chann = this.openChannel();
        this.holdConnection();

        chann.once('close', () => {
            chann = null; // putting garbage collector to work :]
            this.decreaseChannelsOpen();
            this.releaseConnectionHold();
        });
        return chann.write(params);
    }

    /**
     * Writes a command over the socket to the routerboard
     * on a new channel and return an event of what happens
     * with the responses. Listen for 'data', 'done', 'trap' and 'close'
     * events.
     *
     * @param {string|Array} params
     * @param {Array<string|string[]>} moreParams
     * @returns {RStream}
     */
    public writeStream(
        params: string | string[],
        ...moreParams: Array<string | string[]>
    ): RStream {
        params = this.concatParams(params, moreParams);
        const stream = new RStream(this.openChannel(), params);

        stream.on('started', () => {
            this.holdConnection();
        });

        stream.on('stopped', () => {
            this.unregisterStream(stream);
            this.decreaseChannelsOpen();
            this.releaseConnectionHold();
        });

        stream.start();

        this.registerStream(stream);

        return stream;
    }

    /**
     * Returns a stream object for handling continuous data
     * flow.
     *
     * @param {string|Array} params
     * @param {function} callback
     * @returns {RStream}
     */
    public stream(
        params: string | string[] = [],
        ...moreParams: any[]
    ): RStream {
        let callback = moreParams.pop();
        if (typeof callback !== 'function') {
            if (callback) moreParams.push(callback);
            callback = null;
        }
        params = this.concatParams(params, moreParams);
        const stream = new RStream(this.openChannel(), params, callback);

        stream.on('started', () => {
            this.holdConnection();
        });

        stream.on('stopped', () => {
            this.unregisterStream(stream);
            this.decreaseChannelsOpen();
            this.releaseConnectionHold();
            stream.removeAllListeners();
        });

        stream.start();
        stream.prepareDebounceEmptyData();

        this.registerStream(stream);

        return stream;
    }

    /**
     * Keep the connection alive by running a set of
     * commands provided instead of the random command
     *
     * @param {string|Array} params
     * @param {function} callback
     */
    public keepaliveBy(
        params: string | string[] = [],
        ...moreParams: any[]
    ): void {
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
                    this.write(params.slice())
                        .then((data) => {
                            if (typeof callback === 'function')
                                callback(null, data);
                            exec();
                        })
                        .catch((err: Error) => {
                            if (typeof callback === 'function')
                                callback(err, null);
                            exec();
                        });
                }, (this.timeout * 1000) / 2);
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

        clearTimeout(this.keptaliveby);

        this.stopAllStreams();

        return new Promise((resolve) => {
            this.closing = true;
            this.connector.once('close', () => {
                this.connector.destroy();
                this.connector = null;
                this.closing = false;
                this.connected = false;
                resolve(this);
            });
            this.connector.close();
        });
    }

    /**
     * Opens a new channel either for just writing or streaming
     *
     * @returns {Channel}
     */
    private openChannel(): Channel {
        this.increaseChannelsOpen();
        return new Channel(this.connector);
    }

    private increaseChannelsOpen() {
        this.channelsOpen++;
    }

    private decreaseChannelsOpen() {
        this.channelsOpen--;
    }

    private registerStream(stream: RStream) {
        this.registeredStreams.push(stream);
    }

    private unregisterStream(stream: RStream) {
        this.registeredStreams = this.registeredStreams.filter(
            (registeredStreams) => registeredStreams !== stream,
        );
    }

    private stopAllStreams() {
        for (const registeredStream of this.registeredStreams) {
            registeredStream.stop();
        }
    }

    /**
     * Holds the connection if keepalive wasn't set
     * so when a channel opens, ensure that we
     * receive a response before a timeout
     */
    private holdConnection() {
        // If it's not the first connection to open
        // don't try to hold it again
        if (this.channelsOpen !== 1) return;

        if (this.connected && !this.holdingConnectionWithKeepalive) {
            if (this.connectionHoldInterval)
                clearTimeout(this.connectionHoldInterval);
            const holdConnInterval = () => {
                this.connectionHoldInterval = setTimeout(() => {
                    let chann = new Channel(this.connector);
                    chann.on('close', () => {
                        chann = null;
                    });
                    chann
                        .write(['#'])
                        .then(() => {
                            holdConnInterval();
                        })
                        .catch(() => {
                            holdConnInterval();
                        });
                }, (this.timeout * 1000) / 2);
            };
            holdConnInterval();
        }
    }

    /**
     * Release the connection that was held
     * when waiting for responses from channels open
     */
    private releaseConnectionHold() {
        // If there are channels still open
        // don't release the hold
        if (this.channelsOpen > 0) return;

        if (this.connectionHoldInterval)
            clearTimeout(this.connectionHoldInterval);
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
        info('Sending 6.43+ login to %s', this.host);
        return this.write('/login', [
            `=name=${this.user}`,
            `=password=${this.password}`,
        ])
            .then((data: any[]) => {
                if (data.length === 0) {
                    info(
                        '6.43+ Credentials accepted on %s, we are connected',
                        this.host,
                    );
                    return Promise.resolve(this);
                } else if (data.length === 1) {
                    info(
                        'Received challenge on %s, will send credentials. Data: %o',
                        this.host,
                        data,
                    );

                    const challenge = Buffer.alloc(this.password.length + 17);
                    const challengeOffset = this.password.length + 1;

                    // Here we have 32 chars with hex encoded 16 bytes of challenge data
                    const ret = data[0].ret;

                    challenge.write(String.fromCharCode(0) + this.password);

                    // To write 32 hec chars to buffer as bytes we need to write 16 bytes
                    challenge.write(
                        ret,
                        challengeOffset,
                        ret.length / 2,
                        'hex',
                    );

                    const resp =
                        '00' +
                        crypto
                            .createHash('MD5')
                            .update(challenge)
                            .digest('hex');

                    return this.write('/login', [
                        '=name=' + this.user,
                        '=response=' + resp,
                    ])
                        .then(() => {
                            info(
                                'Credentials accepted on %s, we are connected',
                                this.host,
                            );
                            return Promise.resolve(this);
                        })
                        .catch((err: Error) => {
                            if (
                                err.message === 'cannot log in' ||
                                err.message ===
                                    'invalid user name or password (6)'
                            ) {
                                err = new RosException('CANTLOGIN');
                            }
                            this.connector.destroy();
                            error(
                                "Couldn't loggin onto %s, Error: %O",
                                this.host,
                                err,
                            );
                            return Promise.reject(err);
                        });
                }
                error(
                    'Unknown return from /login command on %s, data returned: %O',
                    this.host,
                    data,
                );
                Promise.reject(new RosException('CANTLOGIN'));
            })
            .catch((err: Error) => {
                if (
                    err.message === 'cannot log in' ||
                    err.message === 'invalid user name or password (6)'
                ) {
                    err = new RosException('CANTLOGIN');
                }
                this.connector.destroy();
                error("Couldn't loggin onto %s, Error: %O", this.host, err);
                return Promise.reject(err);
            });
    }

    private concatParams(firstParameter: string | string[], parameters: any[]) {
        if (typeof firstParameter === 'string')
            firstParameter = [firstParameter];
        for (let parameter of parameters) {
            if (typeof parameter === 'string') parameter = [parameter];
            if (parameter.length > 0)
                firstParameter = firstParameter.concat(parameter);
        }
        return firstParameter;
    }
}
