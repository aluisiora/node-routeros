import { Socket } from 'net';
import * as iconv from 'iconv-lite';
import * as debug from 'debug';
import i18n from '../locale';

const info = debug('routeros-api:connector:receiver:info');
const error = debug('routeros-api:connector:receiver:error');

/**
 * Interface of the callback which is stored
 * the tag readers with their respective callbacks
 */
interface IReadCallback {
    name: string;
    callback: (data: string[]) => void;
}

/**
 * Class responsible for receiving and parsing the socket
 * data, sending to the readers and listeners
 */
export class Receiver {

    /**
     * The socket which connects to the routerboard
     */
    private socket: Socket;

    /**
     * The registered tags to answer data to
     */
    private tags: Map<string, IReadCallback> = new Map();

    /**
     * The length of the current data chain received from
     * the socket
     */
    private dataLength: number = 0;

    /**
     * The current line being processed from the data chain
     */
    private currentLine: string = '';

    /**
     * The current reply received for the tag
     */
    private currentReply: string = '';

    /**
     * The current tag which the routerboard responded
     */
    private currentTag: string = '';

    /**
     * The current data chain or packet
     */
    private currentPacket: string[] = [];

    /**
     * Constructor
     * 
     * @param socket
     */
    constructor(socket: Socket) {
        this.socket = socket;
    }

    /**
     * Register the tag as a reader so when
     * the routerboard respond to the command
     * related to the tag, we know where to send 
     * the data to
     * 
     * @param {string} tag 
     * @param {function} callback 
     */
    public read(tag: string, callback: (packet: string[]) => void): void {
        info('Reader of %s tag is being set', tag);
        this.tags.set(tag, {
            name   : tag,
            callback : callback
        });
    }

    /**
     * Stop reading from a tag, removing it
     * from the tag mapping. Usually it is closed
     * after the command has being !done, since each command
     * opens a new auto-generated tag
     * 
     * @param {string} tag 
     */
    public stop(tag: string): void {
        info('Not reading from %s tag anymore', tag);
        this.tags.delete(tag);
    }

    /**
     * Proccess the raw buffer data received from the routerboard,
     * decode using win1252 encoded string from the routerboard to
     * utf-8, so languages with accentuation works out of the box.
     * 
     * After reading each sentence from the raw packet, sends it
     * to be parsed
     * 
     * @param {Buffer} data 
     */
    public processRawData(data: Buffer): void {
        while (data.length > 0) {
            if (this.dataLength > 0) {
                if (data.length <= this.dataLength) {
                    this.dataLength -= data.length;
                    this.currentLine += iconv.decode(data, 'win1252');
                    if (this.dataLength === 0) {
                        this.processSentence(this.currentLine, (data.length !== this.dataLength));
                        this.currentLine = '';
                    }
                    break;
                } else {
                    const tmpBuffer = data.slice(0, this.dataLength);
                    const tmpStr = iconv.decode(tmpBuffer, 'win1252');
                    this.currentLine += tmpStr;
                    const line = this.currentLine;
                    this.currentLine = '';
                    data = data.slice(this.dataLength);
                    const x = this.decodeLength(data);
                    this.dataLength = x.lngth;
                    data = data.slice(x.indx); // get rid of excess buffer
                    if (this.dataLength === 1 && data.equals(Buffer.from(null, 'ascii'))) {
                        this.dataLength = 0;
                        data = data.slice(1); // get rid of excess buffer
                    }
                    this.processSentence(line, (data.length > 0));
                }
            } else {
                const y = this.decodeLength(data);
                this.dataLength = y.lngth;
                data = data.slice(y.indx);
                if (this.dataLength === 1 && data.equals(Buffer.from(null, 'ascii'))) {
                    this.dataLength = 0;
                    data = data.slice(1); // get rid of excess buffer
                }
            }
        }
    }

    /**
     * Process each sentence from the data packet received on
     * 'processRawData' function.
     * 
     * Detects the .tag of the packet, sending the data to the
     * related tag when another reply is detected or if
     * the packet has no more lines to be processed.
     * 
     * @param {string} line 
     * @param {boolean} hasMoreLines 
     */
    private processSentence(line: string, hasMoreLines: boolean): void {
        info('Got sentence %s', line);

        if (!hasMoreLines && this.currentReply === '!fatal') {
            this.socket.emit('fatal');
            return;
        }

        if (/\.tag=/.test(line)) {
            this.currentTag = line.substring(5);
        } else if (/^!/.test(line)) {
            if (this.currentTag) this.sendTagData();
            this.currentPacket.push(line);
            this.currentReply = line;
        } else {
            this.currentPacket.push(line);
        }

        if (!hasMoreLines) this.sendTagData();
    }

    /**
     * Send the data collected from the tag to the
     * tag reader
     */
    private sendTagData(): void {
        const tag = this.tags.get(this.currentTag);
        if (tag) {
            info('Sending to tag %s the packet %O', tag.name, this.currentPacket);
            tag.callback(this.currentPacket);
        } else {
            throw new Error(i18n.t('UNREGISTEREDTAG'));
        }
        this.cleanUp();
    }

    /**
     * Clean the current packet, tag and reply state
     * to start over
     */
    private cleanUp(): void {
        this.currentPacket = [];
        this.currentTag = null;
        this.currentReply = null;
    }

    /**
     * Decodes the length of the buffer received
     *
     * Credits for George Joseph: https://github.com/gtjoseph
     * and for Brandon Myers: https://github.com/Trakkasure
     * 
     * @param {Buffer} data 
     */
    private decodeLength(data: Buffer): {indx: number, lngth: number} {
        let len;
        let idx = 0;
        const b = data[idx++];

        if (b & 128) {
            if ((b & 192) === 128) {
                len = ((b & 63) << 8) + data[idx++];
            } else {
                if ((b & 224) === 192) {
                    len = ((b & 31) << 8) + data[idx++];
                    len = (len << 8) + data[idx++];
                } else {
                    if ((b & 240) === 224) {
                        len = ((b & 15) << 8) + data[idx++];
                        len = (len << 8) + data[idx++];
                        len = (len << 8) + data[idx++];
                    } else {
                        len = data[idx++];
                        len = (len << 8) + data[idx++];
                        len = (len << 8) + data[idx++];
                        len = (len << 8) + data[idx++];
                    }
                }
            }
        } else {
            len = b;
        }

        return {
            indx : idx,
            lngth: len,
        };
    }

}
