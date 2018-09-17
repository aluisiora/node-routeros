"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const Channel_1 = require("./Channel");
const RosException_1 = require("./RosException");
const debug = require("debug");
const timers_1 = require("timers");
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
class RStream extends events_1.EventEmitter {
    /**
     * Constructor, it also starts the streaming after construction
     *
     * @param {Channel} channel
     * @param {Array} params
     * @param {function} callback
     */
    constructor(channel, params, callback) {
        super();
        /**
         * If is streaming flag
         */
        this.streaming = true;
        /**
         * If is pausing flag
         */
        this.pausing = false;
        /**
         * If is paused flag
         */
        this.paused = false;
        /**
         * If is stopping flag
         */
        this.stopping = false;
        /**
         * If is stopped flag
         */
        this.stopped = false;
        /**
         * Save the current section of the packet, if has any
         */
        this.currentSection = null;
        /**
         * Store the current section in a single
         * array before sending when another section comes
         */
        this.currentSectionPacket = [];
        this.channel = channel;
        this.params = params;
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
    data(callback) {
        this.callback = callback;
    }
    /**
     * Resume the paused stream, using the same channel
     *
     * @returns {Promise}
     */
    resume() {
        if (this.stopped || this.stopping)
            return Promise.reject(new RosException_1.RosException('STREAMCLOSD'));
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
    pause() {
        if (this.stopped || this.stopping)
            return Promise.reject(new RosException_1.RosException('STREAMCLOSD'));
        if (this.pausing || this.paused)
            return Promise.resolve();
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
    stop() {
        if (this.stopped || this.stopping)
            return Promise.resolve();
        if (this.paused) {
            this.streaming = false;
            this.stopping = false;
            this.stopped = true;
            if (this.channel)
                this.channel.close(true);
            return Promise.resolve();
        }
        if (!this.pausing)
            this.stopping = true;
        let chann = new Channel_1.Channel(this.channel.Connector);
        chann.on('close', () => { chann = null; });
        return chann.write(['/cancel', '=tag=' + this.channel.Id]).then(() => {
            this.streaming = false;
            if (!this.pausing) {
                this.stopping = false;
                this.stopped = true;
            }
            return Promise.resolve();
        }).catch((err) => {
            return Promise.reject(err);
        });
    }
    /**
     * Alias for stop()
     */
    close() {
        return this.stop();
    }
    /**
     * Write over the connection and start the stream
     */
    start() {
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
    onStream(packet) {
        if (this.callback) {
            if (packet['.section']) {
                timers_1.clearTimeout(this.sectionPacketSendingTimeout);
                const sendData = () => {
                    this.callback(null, this.currentSectionPacket.slice(), this);
                    this.currentSectionPacket = [];
                };
                this.sectionPacketSendingTimeout = timers_1.setTimeout(sendData.bind(this), 300);
                if (this.currentSectionPacket.length > 0 && packet['.section'] !== this.currentSection) {
                    timers_1.clearTimeout(this.sectionPacketSendingTimeout);
                    sendData();
                }
                this.currentSection = packet['.section'];
                this.currentSectionPacket.push(packet);
            }
            else {
                this.callback(null, packet, this);
            }
        }
    }
    /**
     * When receiving a trap over the connection,
     * when pausing, will receive a 'interrupted' message,
     * this will not be considered as an error but a flag
     * for the pause and resume function
     *
     * @returns {function}
     */
    onTrap(data) {
        if (data.message === 'interrupted') {
            this.streaming = false;
        }
        else {
            this.stopped = true;
            if (this.callback)
                this.callback(new Error(data.message), null, this);
        }
    }
    /**
     * When the channel stops sending data.
     * It will close the channel if the
     * intention was stopping it.
     *
     * @returns {function}
     */
    onDone() {
        if (this.stopped && this.channel) {
            this.channel.close(true);
        }
    }
}
exports.RStream = RStream;
//# sourceMappingURL=RStream.js.map