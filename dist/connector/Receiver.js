"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const iconv = require("iconv-lite");
const i18n = require("i18n");
const debug = require("debug");
const info = debug('routeros-api:connector:receiver:info');
const error = debug('routeros-api:connector:receiver:error');
class Receiver {
    constructor(socket) {
        this.tags = new Map();
        this.dataLength = 0;
        this.currentLine = '';
        this.currentReply = '';
        this.currentTag = '';
        this.currentPacket = [];
        this.socket = socket;
    }
    read(tag, callback) {
        info('Reader of %s tag is being set', tag);
        this.tags.set(tag, {
            name: tag,
            callback: callback
        });
    }
    stop(tag) {
        info('Not reading from %s tag anymore', tag);
        this.tags.delete(tag);
    }
    processRawData(data) {
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
                }
                else {
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
                        info('recebeu buffer vazio');
                    }
                    this.processSentence(line, (data.length > 0));
                }
            }
            else {
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
    processSentence(line, hasMoreLines) {
        info('Got sentence %s', line);
        if (!hasMoreLines && this.currentReply === '!fatal') {
            this.socket.emit('fatal');
            return;
        }
        if (/\.tag=/.test(line)) {
            this.currentTag = line.substring(5);
        }
        else if (/^!/.test(line)) {
            if (this.currentTag)
                this.sendTagData();
            this.currentPacket.push(line);
            this.currentReply = line;
        }
        else {
            this.currentPacket.push(line);
        }
        if (!hasMoreLines)
            this.sendTagData();
    }
    sendTagData() {
        const tag = this.tags.get(this.currentTag);
        if (tag) {
            info('Sending to tag %s the packet %O', tag.name, this.currentPacket);
            tag.callback(this.currentPacket);
        }
        else {
            throw new Error(i18n.__('data on unregistered tag'));
        }
        this.cleanUp();
    }
    cleanUp() {
        this.currentPacket = [];
        this.currentTag = null;
        this.currentReply = null;
    }
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
        return {
            indx: idx,
            lngth: len,
        };
    }
}
exports.Receiver = Receiver;
