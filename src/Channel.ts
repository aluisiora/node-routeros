import { EventEmitter } from 'events';
import { Connector } from './connector/Connector';
import { RosException } from './RosException';
import * as debug from 'debug';

const info = debug('routeros-api:channel:info');
const error = debug('routeros-api:channel:error');

/**
 * Channel class is responsible for generating
 * ids for the channels and writing over
 * the ids generated, while listening for
 * their responses
 */
export class Channel extends EventEmitter {
    /**
     * Id of the channel
     */
    private id: string;

    /**
     * The connector object
     */
    private connector: Connector;

    /**
     * Data received related to the channel
     */
    private data: any[] = [];

    /**
     * If received a trap instead of a positive response
     */
    private trapped: boolean = false;

    /**
     * If is streaming content
     */
    private streaming: boolean = false;

    /**
     * Constructor
     *
     * @param {Connector} connector
     */
    constructor(connector) {
        super();
        this.id = Math.random().toString(36).substring(3);
        this.connector = connector;
        this.once('unknown', this.onUnknown.bind(this));
    }

    /**
     * Get the id of the channel
     *
     * @returns {string}
     */
    get Id(): string {
        return this.id;
    }

    /**
     * Get the connector used in the channel
     *
     * @returns {Connector}
     */
    get Connector(): Connector {
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
    public write(
        params: string[],
        isStream = false,
        returnPromise = true,
    ): Promise<object[]> {
        this.streaming = isStream;

        params.push('.tag=' + this.id);

        if (returnPromise) {
            this.on('data', (packet: object) => this.data.push(packet));

            return new Promise((resolve, reject) => {
                this.once('done', (data) => resolve(data));
                this.once('trap', (data) => reject(new Error(data.message)));

                this.readAndWrite(params);
            });
        }
        this.readAndWrite(params);
        return;
    }

    /**
     * Closes the channel, algo asking for
     * the connector to remove the reader.
     * If streaming, not forcing will only stop
     * the reader, not the listeners of the events
     *
     * @param {boolean} force - force closing by removing all listeners
     */
    public close(force = false): void {
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
    private readAndWrite(params: string[]): void {
        this.connector.read(this.id, (packet: string[]) =>
            this.processPacket(packet),
        );
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
    private processPacket(packet: string[]): void {
        const reply = packet.shift();

        info('Processing reply %s with data %o', reply, packet);

        const parsed = this.parsePacket(packet);

        if (reply === '!trap') {
            this.trapped = true;
            this.emit('trap', parsed);
            return;
        }

        if (packet.length > 0 && !this.streaming) this.emit('data', parsed);

        switch (reply) {
            case '!re':
                if (this.streaming) this.emit('stream', parsed);
                break;
            case '!done':
                if (!this.trapped) this.emit('done', this.data);
                this.close();
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
    private parsePacket(packet: string[]): object {
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
    private onUnknown(reply: string): void {
        throw new RosException('UNKNOWNREPLY', { reply: reply });
    }
}
