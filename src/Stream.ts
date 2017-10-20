import { EventEmitter } from 'events';
import { Channel } from './Channel';
import { RosException } from './RosException';

export class Stream extends EventEmitter {

    private channel: Channel;
    private params: string[];
    private callback: (err: Error, packet?: any) => void;

    private streaming: boolean = true;
    private pausing: boolean   = false;
    private stopping: boolean  = false;
    private open: boolean      = true;

    constructor(channel: Channel, params: string[], callback: (err: Error, packet?: any) => void) {
        super();
        this.channel  = channel;
        this.params   = params;
        this.callback = callback;

        this.channel.on('stream', this.onStream());
        this.channel.on('trap', this.onTrap());
        this.channel.on('done', this.onDone());
    }

    public resume(): Promise<void> {
        if (!this.open) return Promise.reject(new RosException('STREAMCLOSD'));

        if (!this.streaming) {
            this.pausing = false;
            this.channel.write(this.params);
        }

        return Promise.resolve();
    }

    public pause(): Promise<void> {
        if (!this.open) return Promise.reject(new RosException('STREAMCLOSD'));

        if (this.streaming) {
            this.pausing = true;
            return this.stop();
        }

        return Promise.resolve();
    }

    public stop(): Promise<void> {
        if (!this.open) return Promise.reject(new RosException('STREAMCLOSD'));
        let chann = new Channel(this.channel.Connector);
        chann.on('close', () => { chann = null; });
        return chann.write(['/cancel', '=tag=' + this.channel.Id]).then(() => {
            this.streaming = false;
            if (!this.pausing) this.open = false;
            return Promise.resolve();
        }).catch((err: Error) => {
            return Promise.reject(err);
        });
    }

    private onStream(): (packet: any) => void {
        return (packet: any) => {
            this.callback(null, packet);
        };
    }

    private onTrap(): (data: any) => void {
        return (data: any) => {
            if (data.message === 'interrupted') {
                this.streaming = false;
            } else {
                this.callback(new Error(data.message));
            }
        };
    }

    private onDone(): () => void {
        return () => {
            if (!this.pausing)  this.open = false;
        };
    }
}
