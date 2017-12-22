import { EventEmitter } from 'events';
import { Channel } from './Channel';
import { RosException } from './RosException';
import * as debug from 'debug';

const info = debug('routeros-api:stream:info');
const error = debug('routeros-api:stream:error');

/**
 * Stream class is responsible for handling
 * continuous data from some parts of the
 * routeros, like /ip/address/listen or
 * /tool/torch which keeps sending data endlessly.
 * It is also possible to pause/resume/stop generated
 * streams.
 */
export class Stream extends EventEmitter {

    /**
     * Main channel of the stream
     */
    private channel: Channel;

    /**
     * Parameters of the menu and search of
     * what to stream
     */
    private params: string[];

    /**
     * The callback function sent to the
     * streaming listener, which will get an error
     * if any, or the packet received from the
     * command
     */
    private callback: (err: Error, packet?: any, stream?: Stream) => void;

    /**
     * If is streaming flag
     */
    private streaming: boolean = true;

    /**
     * If is pausing flag
     */
    private pausing: boolean   = false;

    /**
     * If is paused flag
     */
    private paused: boolean    = false;

    /**
     * If is stopping flag
     */
    private stopping: boolean  = false;

    /**
     * If is stopped flag
     */
    private stopped: boolean   = false;

    /**
     * Constructor, it also starts the streaming after construction
     * 
     * @param {Channel} channel
     * @param {Array} params 
     * @param {function} callback 
     */
    constructor(channel: Channel, params: string[], callback?: (err: Error, packet?: any, stream?: Stream) => void) {
        super();
        this.channel  = channel;
        this.params   = params;
        this.callback = callback;

        this.start();
    }

    /**
     * Function to receive the callback which
     * will receive data, if not provided over the
     * constructor or changed later after the streaming
     * have started.
     * 
     * @param {function} callback 
     */
    public data(callback: (err: Error, packet?: any, stream?: Stream) => void): void {
        this.callback = callback;
    }

    /**
     * Resume the paused stream, using the same channel
     * 
     * @returns {Promise}
     */
    public resume(): Promise<void> {
        if (this.stopped || this.stopping) return Promise.reject(new RosException('STREAMCLOSD'));

        if (!this.streaming) {
            this.pausing = false;
            this.start();
            this.streaming = true;
        }

        return Promise.resolve();
    }

    /**
     * Pause the stream, but don't destroy the channel
     * 
     * @returns {Promise}
     */
    public pause(): Promise<void> {
        if (this.stopped || this.stopping) return Promise.reject(new RosException('STREAMCLOSD'));

        if (this.streaming) {
            this.pausing = true;
            return this.stop().then(() => {
                this.pausing = false;
                this.paused = true;
                return Promise.resolve();
            }).catch((err) => {
                return Promise.reject(err);
            });
        }

        return Promise.resolve();
    }

    /**
     * Stop the stream entirely, can't re-stream after
     * this if called directly.
     * 
     * @returns {Promise}
     */
    public stop(): Promise<void> {
        if (this.stopped || this.stopping) return Promise.reject(new RosException('STREAMCLOSD'));

        if (this.paused) {
            this.streaming = false;
            this.stopping = false;
            this.stopped = true;
            if (this.channel) this.channel.close(true);
            return Promise.resolve();
        }

        if (!this.pausing) this.stopping = true;

        let chann = new Channel(this.channel.Connector);
        chann.on('close', () => { chann = null; });

        return chann.write(['/cancel', '=tag=' + this.channel.Id]).then(() => {
            this.streaming = false;
            if (!this.pausing) {
                this.stopping = false;
                this.stopped = true;
            }
            return Promise.resolve();
        }).catch((err: Error) => {
            return Promise.reject(err);
        });
    }

    /**
     * Alias for stop()
     */
    public close(): Promise<void> {
        return this.stop();
    }

    /**
     * Write over the connection and start the stream
     */
    private start(): void {
        if (!this.stopped && !this.stopping) {
            this.channel.on('close', () => { this.stopped = false; });
            this.channel.on('stream', this.onStream.bind(this));

            this.channel.write(this.params.slice(), true)
                .then(this.onDone.bind(this))
                .catch(this.onTrap.bind(this));
        }
    }

    /**
     * When receiving the stream packet, give it to
     * the callback
     * 
     * @returns {function}
     */
    private onStream(packet: any): void {
        if (this.callback) this.callback(null, packet, this);
    }

    /**
     * When receiving a trap over the connection,
     * when pausing, will receive a 'interrupted' message,
     * this will not be considered as an error but a flag
     * for the pause and resume function
     * 
     * @returns {function}
     */
    private onTrap(data: any): void {
        if (data.message === 'interrupted') {
            this.streaming = false;
        } else {
            if (this.callback) this.callback(new Error(data.message), null, this);
        }
    }

    /**
     * When the channel stops sending data.
     * It will close the channel if the
     * intention was stopping it.
     * 
     * @returns {function}
     */
    private onDone(): void {
        if (this.stopped && this.channel) {
            this.channel.close(true);
        }
    }
}
