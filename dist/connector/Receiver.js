import * as iconv from 'iconv-lite';
export class Receiver {
    constructor(socket) {
        this.socket = socket;
        this.socket.on('data', this.onData);
    }
    read(tag, callback) {
        this.tags.set(tag, {
            name: tag,
            callback: callback
        });
    }
    stop(tag) {
        this.tags.delete(tag);
    }
    onData(data) {
        this.processRawData(data);
    }
    processRawData(data) {
        while (data.length > 0) {
            if (this.dataLength) {
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
        if (!hasMoreLines && this.currentReply === '!fatal') {
            this.socket.emit('fatal');
            return;
        }
        if (/\.tag=/.test(line)) {
            this.currentTag = line.substring(5);
        }
        else if (/^!/.test(line)) {
            if (this.currentTag) {
                this.sendTagData();
            }
            this.currentPacket.push(line);
            this.currentReply = line;
        }
        else {
            this.currentPacket.push(line);
        }
        if (!hasMoreLines) {
            this.sendTagData();
        }
    }
    sendTagData() {
        const tag = this.tags.get(this.currentTag);
        if (tag) {
            tag.callback(this.currentPacket);
        }
        else {
            throw new Error(lang('data on unregistered tag'));
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
