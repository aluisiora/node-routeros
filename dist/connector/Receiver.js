"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const iconv = require("iconv-lite");
const debug = require("debug");
const RosException_1 = require("../RosException");
const info = debug('routeros-api:connector:receiver:info');
const error = debug('routeros-api:connector:receiver:error');
/**
 * Class responsible for receiving and parsing the socket
 * data, sending to the readers and listeners
 */
class Receiver {
    /**
     * Receives the socket so we are able to read
     * the data sent to it, separating each tag
     * to the according listener.
     *
     * @param socket
     */
    constructor(socket) {
        /**
         * The registered tags to answer data to
         */
        this.tags = new Map();
        /**
         * The length of the current data chain received from
         * the socket
         */
        this.dataLength = 0;
        /**
         * A pipe of all responses received from the routerboard
         */
        this.sentencePipe = [];
        /**
         * Flag if the sentencePipe is being processed to
         * prevent concurrent sentences breaking the pipe
         */
        this.processingSentencePipe = false;
        /**
         * The current line being processed from the data chain
         */
        this.currentLine = '';
        /**
         * The current reply received for the tag
         */
        this.currentReply = '';
        /**
         * The current tag which the routerboard responded
         */
        this.currentTag = '';
        /**
         * The current data chain or packet
         */
        this.currentPacket = [];
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
    read(tag, callback) {
        info('Reader of %s tag is being set', tag);
        this.tags.set(tag, {
            name: tag,
            callback: callback
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
    stop(tag) {
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
    processRawData(data) {
        while (data.length > 0) {
            if (this.dataLength > 0) {
                if (data.length <= this.dataLength) {
                    this.dataLength -= data.length;
                    this.currentLine += iconv.decode(data, 'win1252');
                    if (this.dataLength === 0) {
                        this.sentencePipe.push({
                            sentence: this.currentLine,
                            hadMore: (data.length !== this.dataLength)
                        });
                        this.processSentence();
                        this.currentLine = '';
                    }
                    break;
                }
                else {
                    const tmpBuffer = data.slice(0, this.dataLength);
                    const tmpStr = iconv.decode(tmpBuffer, 'win1252');
                    this.currentLine += tmpStr;
                    const line = this.currentLine;
                    this.currentLine = '';
                    data = data.slice(this.dataLength);
                    const [index, length] = this.decodeLength(data);
                    this.dataLength = length;
                    data = data.slice(index); // get rid of excess buffer
                    if (this.dataLength === 1 && data.equals(Buffer.from(null, 'ascii'))) {
                        this.dataLength = 0;
                        data = data.slice(1); // get rid of excess buffer
                    }
                    this.sentencePipe.push({
                        sentence: line,
                        hadMore: (data.length > 0)
                    });
                    this.processSentence();
                }
            }
            else {
                const [index, length] = this.decodeLength(data);
                this.dataLength = length;
                data = data.slice(index);
                if (this.dataLength === 1 && data.equals(Buffer.from(null, 'ascii'))) {
                    this.dataLength = 0;
                    data = data.slice(1); // get rid of excess buffer
                }
            }
        }
    }
    /**
     * Process each sentence from the data packet received.
     *
     * Detects the .tag of the packet, sending the data to the
     * related tag when another reply is detected or if
     * the packet had no more lines to be processed.
     *
     */
    processSentence() {
        if (!this.processingSentencePipe) {
            info('Got asked to process sentence pipe');
            this.processingSentencePipe = true;
            const process = () => {
                if (this.sentencePipe.length > 0) {
                    const line = this.sentencePipe.shift();
                    if (!line.hadMore && this.currentReply === '!fatal') {
                        this.socket.emit('fatal');
                        return;
                    }
                    info('Processing line %s', line.sentence);
                    if (/^\.tag=/.test(line.sentence)) {
                        this.currentTag = line.sentence.substring(5);
                    }
                    else if (/^!/.test(line.sentence)) {
                        if (this.currentTag) {
                            info('Received another response, sending current data to tag %s', this.currentTag);
                            this.sendTagData(this.currentTag);
                        }
                        this.currentPacket.push(line.sentence);
                        this.currentReply = line.sentence;
                    }
                    else {
                        this.currentPacket.push(line.sentence);
                    }
                    if (this.sentencePipe.length === 0 && this.dataLength === 0) {
                        if (!line.hadMore && this.currentTag) {
                            info('No more sentences to process, will send data to tag %s', this.currentTag);
                            this.sendTagData(this.currentTag);
                        }
                        else {
                            info('No more sentences and no data to send');
                        }
                        this.processingSentencePipe = false;
                    }
                    else {
                        process();
                    }
                }
                else {
                    this.processingSentencePipe = false;
                }
            };
            process();
        }
    }
    /**
     * Send the data collected from the tag to the
     * tag reader
     */
    sendTagData(currentTag) {
        const tag = this.tags.get(currentTag);
        if (tag) {
            info('Sending to tag %s the packet %O', tag.name, this.currentPacket);
            tag.callback(this.currentPacket);
        }
        else {
            throw new RosException_1.RosException('UNREGISTEREDTAG');
        }
        this.cleanUp();
    }
    /**
     * Clean the current packet, tag and reply state
     * to start over
     */
    cleanUp() {
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
    decodeLength(data) {
        let len;
        let idx = 0;
        const b = data[idx++];
        if (b & 128) {
            if ((b & 192) === 128) {
                len = ((b & 63) << 8) + data[idx++];
            }
            else {
                if ((b & 224) === 192) {
                    len = ((b & 31) << 8) + data[idx++];
                    len = (len << 8) + data[idx++];
                }
                else {
                    if ((b & 240) === 224) {
                        len = ((b & 15) << 8) + data[idx++];
                        len = (len << 8) + data[idx++];
                        len = (len << 8) + data[idx++];
                    }
                    else {
                        len = data[idx++];
                        len = (len << 8) + data[idx++];
                        len = (len << 8) + data[idx++];
                        len = (len << 8) + data[idx++];
                    }
                }
            }
        }
        else {
            len = b;
        }
        return [idx, len];
    }
}
exports.Receiver = Receiver;
//# sourceMappingURL=Receiver.js.map