"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const RosException_1 = require("./RosException");
const debug = require("debug");
const info = debug('routeros-api:channel:info');
const error = debug('routeros-api:channel:error');
/**
 * Channel class is responsible for generating
 * ids for the channels and writing over
 * the ids generated, while listening for
 * their responses
 */
class Channel extends events_1.EventEmitter {
    /**
     * Constructor
     *
     * @param {Connector} connector
     */
    constructor(connector) {
        super();
        /**
         * Data received related to the channel
         */
        this.data = [];
        /**
         * If received a trap instead of a positive response
         */
        this.trapped = false;
        /**
         * If is streaming content
         */
        this.streaming = false;
        this.id = Math.random().toString(36).substring(3);
        this.connector = connector;
        this.once('unknown', this.onUnknown.bind(this));
    }
    /**
     * Get the id of the channel
     *
     * @returns {string}
     */
    get Id() {
        return this.id;
    }
    /**
     * Get the connector used in the channel
     *
     * @returns {Connector}
     */
    get Connector() {
        return this.connector;
    }
    /**
     * Organize the data to be written over the socket with the id
     * generated. Adds a reader to the id provided, so we wait for
     * the data.
     *
     * @param {Array} params
     * @returns {Promise}
     */
    write(params, isStream = false) {
        this.streaming = isStream;
        params.push('.tag=' + this.id);
        this.on('data', (packet) => this.data.push(packet));
        return new Promise((resolve, reject) => {
            this.once('done', (data) => resolve(data));
            this.once('trap', (data) => reject(new Error(data.message)));
            this.readAndWrite(params);
        });
    }
    /**
     * Closes the channel, algo asking for
     * the connector to remove the reader.
     * If streaming, not forcing will only stop
     * the reader, not the listeners of the events
     *
     * @param {boolean} force - force closing by removing all listeners
     */
    close(force = false) {
        this.emit('close');
        if (!this.streaming || force) {
            this.removeAllListeners();
        }
        this.connector.stopRead(this.id);
    }
    /**
     * Register the reader for the tag and write the params over
     * the socket
     *
     * @param {Array} params
     */
    readAndWrite(params) {
        this.connector.read(this.id, (packet) => this.processPacket(packet));
        this.connector.write(params);
    }
    /**
     * Process the data packet received to
     * figure out the answer to give to the
     * channel listener, either if it's just
     * the data we were expecting or if
     * a trap was given.
     *
     * @param {Array} packet
     */
    processPacket(packet) {
        const reply = packet.shift();
        info('Processing reply %s with data %o', reply, packet);
        const parsed = this.parsePacket(packet);
        if (packet.length > 0 && !this.streaming)
            this.emit('data', parsed);
        switch (reply) {
            case '!re':
                if (this.streaming)
                    this.emit('stream', parsed);
                break;
            case '!done':
                if (this.trapped)
                    this.emit('trap', this.data[0]);
                else
                    this.emit('done', this.data);
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
    /**
     * Parse the packet line, separating the key from the data.
     * Ex: transform '=interface=ether2' into object {interface:'ether2'}
     *
     * @param {Array} packet
     * @return {Object}
     */
    parsePacket(packet) {
        const obj = {};
        for (const line of packet) {
            const linePair = line.split('=');
            linePair.shift(); // remove empty index
            obj[linePair.shift()] = linePair.join('=');
        }
        info('Parsed line, got %o as result', obj);
        return obj;
    }
    /**
     * Waits for the unknown event.
     * It shouldn't happen, but if it does, throws the error and
     * stops the channel
     *
     * @param {string} reply
     * @returns {function}
     */
    onUnknown(reply) {
        throw new RosException_1.RosException('UNKNOWNREPLY', { reply: reply });
    }
}
exports.Channel = Channel;
//# sourceMappingURL=Channel.js.map