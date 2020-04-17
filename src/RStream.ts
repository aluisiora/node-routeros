import { EventEmitter } from 'events';
import { Channel } from './Channel';
import { RosException } from './RosException';
import { setTimeout, clearTimeout } from 'timers';
import { debounce } from './utils';

/**
 * Stream class is responsible for handling
 * continuous data from some parts of the
 * routeros, like /ip/address/listen or
 * /tool/torch which keeps sending data endlessly.
 * It is also possible to pause/resume/stop generated
 * streams.
 */
export class RStream extends EventEmitter {
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
    private callback: (err: Error, packet?: any, stream?: RStream) => void;

    /**
     * The function that will send empty data
     * unless debounced by real data from the command
     */
    private debounceSendingEmptyData: any;

    /** Flag for turning on empty data debouncing */
    private shouldDebounceEmptyData: boolean = false;

    /**
     * If is streaming flag
     */
    private streaming: boolean = true;

    /**
     * If is pausing flag
     */
    private pausing: boolean = false;

    /**
     * If is paused flag
     */
    private paused: boolean = false;

    /**
     * If is stopping flag
     */
    private stopping: boolean = false;

    /**
     * If is stopped flag
     */
    private stopped: boolean = false;

    /**
     * If got a trap error
     */
    private trapped: boolean = false;

    /**
     * Save the current section of the packet, if has any
     */
    private currentSection: string = null;

    private forcelyStop: boolean = false;

    /**
     * Store the current section in a single
     * array before sending when another section comes
     */
    private currentSectionPacket: any[] = [];

    /**
     * Waiting timeout before sending received section packets
     */
    private sectionPacketSendingTimeout: NodeJS.Timer;

    /**
     * Constructor, it also starts the streaming after construction
     *
     * @param {Channel} channel
     * @param {Array} params
     * @param {function} callback
     */
    constructor(
        channel: Channel,
        params: string[],
        callback?: (err: Error, packet?: any, stream?: RStream) => void,
    ) {
        super();
        this.channel = channel;
        this.params = params;
        this.callback = callback;
    }

    /**
     * Function to receive the callback which
     * will receive data, if not provided over the
     * constructor or changed later after the streaming
     * have started.
     *
     * @param {function} callback
     */
    public data(
        callback: (err: Error, packet?: any, stream?: RStream) => void,
    ): void {
        this.callback = callback;
    }

    /**
     * Resume the paused stream, using the same channel
     *
     * @returns {Promise}
     */
    public resume(): Promise<void> {
        if (this.stopped || this.stopping)
            return Promise.reject(new RosException('STREAMCLOSD'));

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
        if (this.stopped || this.stopping)
            return Promise.reject(new RosException('STREAMCLOSD'));

        if (this.pausing || this.paused) return Promise.resolve();

        if (this.streaming) {
            this.pausing = true;
            return this.stop(true)
                .then(() => {
                    this.pausing = false;
                    this.paused = true;
                    return Promise.resolve();
                })
                .catch((err) => {
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
    public stop(pausing: boolean = false): Promise<void> {
        if (this.stopped || this.stopping) return Promise.resolve();

        if (!pausing) this.forcelyStop = true;

        if (this.paused) {
            this.streaming = false;
            this.stopping = false;
            this.stopped = true;
            if (this.channel) this.channel.close(true);
            return Promise.resolve();
        }

        if (!this.pausing) this.stopping = true;

        let chann = new Channel(this.channel.Connector);
        chann.on('close', () => {
            chann = null;
        });

        if (this.debounceSendingEmptyData)
            this.debounceSendingEmptyData.cancel();

        return chann
            .write(['/cancel', '=tag=' + this.channel.Id])
            .then(() => {
                this.streaming = false;
                if (!this.pausing) {
                    this.stopping = false;
                    this.stopped = true;
                }
                this.emit('stopped');
                return Promise.resolve();
            })
            .catch((err: Error) => {
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
    public start(): void {
        if (!this.stopped && !this.stopping) {
            this.channel.on('close', () => {
                if (this.forcelyStop || (!this.pausing && !this.paused)) {
                    if (!this.trapped) this.emit('done');
                    this.emit('close');
                }
                this.stopped = false;
            });

            this.channel.on('stream', (packet: any) => {
                if (this.debounceSendingEmptyData)
                    this.debounceSendingEmptyData.run();
                this.onStream(packet);
            });

            this.channel.once('trap', this.onTrap.bind(this));
            this.channel.once('done', this.onDone.bind(this));

            this.channel.write(this.params.slice(), true, false);

            this.emit('started');

            if (this.shouldDebounceEmptyData) this.prepareDebounceEmptyData();
        }
    }

    public prepareDebounceEmptyData() {
        this.shouldDebounceEmptyData = true;

        const intervalParam = this.params.find((param) => {
            return /=interval=/.test(param);
        });

        let interval = 2000;
        if (intervalParam) {
            const val = intervalParam.split('=')[2];
            interval = parseInt(val, null) * 1000;
        }

        this.debounceSendingEmptyData = debounce(() => {
            if (
                !this.stopped ||
                !this.stopping ||
                !this.paused ||
                !this.pausing
            ) {
                this.onStream([]);
                this.debounceSendingEmptyData.run();
            }
        }, interval + 300);
    }

    /**
     * When receiving the stream packet, give it to
     * the callback
     *
     * @returns {function}
     */
    private onStream(packet: any): void {
        this.emit('data', packet);
        if (this.callback) {
            if (packet['.section']) {
                clearTimeout(this.sectionPacketSendingTimeout);

                const sendData = () => {
                    this.callback(
                        null,
                        this.currentSectionPacket.slice(),
                        this,
                    );
                    this.currentSectionPacket = [];
                };

                this.sectionPacketSendingTimeout = setTimeout(
                    sendData.bind(this),
                    300,
                );

                if (
                    this.currentSectionPacket.length > 0 &&
                    packet['.section'] !== this.currentSection
                ) {
                    clearTimeout(this.sectionPacketSendingTimeout);
                    sendData();
                }

                this.currentSection = packet['.section'];
                this.currentSectionPacket.push(packet);
            } else {
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
    private onTrap(data: any): void {
        if (data.message === 'interrupted') {
            this.streaming = false;
        } else {
            this.stopped = true;
            this.trapped = true;
            if (this.callback) {
                this.callback(new Error(data.message), null, this);
            } else {
                this.emit('error', data);
            }
            this.emit('trap', data);
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
