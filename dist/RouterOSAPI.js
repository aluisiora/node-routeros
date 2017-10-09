"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Connector_1 = require("./connector/Connector");
const Channel_1 = require("./Channel");
const RosException_1 = require("./RosException");
const i18n = require("i18n");
const crypto = require("crypto");
const debug = require("debug");
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
class RouterOSAPI {
    constructor(options) {
        this.connected = false;
        this.connecting = false;
        this.closing = false;
        this.host = options.host;
        this.user = options.user;
        this.password = options.password;
        this.port = options.port;
        this.timeout = options.timeout;
        this.tls = options.tls;
        i18n.setLocale(options.locale || 'en');
    }
    connect() {
        if (this.connecting)
            return;
        if (this.connected)
            return Promise.resolve(this);
        info('Connecting on %s', this.host);
        this.connecting = true;
        this.connected = false;
        if (this.connector) {
            info('Already had a connector object, going to purge and recreate it');
            this.connector.destroy();
            delete this.connector;
        }
        this.connector = new Connector_1.Connector({
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
                    info('Logged in on %s', this.host);
                    resolve(this);
                }).catch((e) => {
                    this.connecting = false;
                    this.connected = false;
                    reject(e);
                });
            });
            this.connector.once('error', (e) => reject(e));
            this.connector.once('timeout', (e) => reject(e));
            this.connector.connect();
        });
    }
    write(menu, params = []) {
        let chann = this.openChannel();
        chann.on('close', () => { chann = null; });
        return chann.write(menu, params);
    }
    close() {
        if (this.closing) {
            return Promise.reject(new RosException_1.RosException('ALRDYCLOSNG'));
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
    openChannel() {
        return new Channel_1.Channel(this.connector);
    }
    login() {
        this.connecting = true;
        info('Sending login to %s, waiting for challenge', this.host);
        return this.write('/login').then((data) => {
            info('Received challenge on %s, will send credentials. Data: %o', this.host, data);
            const challenge = new Buffer(this.password.length + 17);
            const challengeOffset = this.password.length + 1;
            const ret = data[0].ret;
            challenge.write(String.fromCharCode(0) + this.password);
            challenge.write(ret, challengeOffset, ret.length - challengeOffset, 'hex');
            const resp = '00' + crypto.createHash('MD5').update(challenge).digest('hex');
            return this.write('/login', ['=name=' + this.user, '=response=' + resp]);
        }).catch((err) => {
            error('Couldn\'t loggin onto %s, Error: %O', this.host, err);
            return Promise.reject(err);
        }).then(() => {
            info('Credentials accepted on %s, we are connected', this.host);
            return Promise.resolve(this);
        }).catch((err) => {
            error('Couldn\'t loggin onto %s, Error: %O', this.host, err);
            return Promise.reject(err);
        });
    }
}
exports.RouterOSAPI = RouterOSAPI;
