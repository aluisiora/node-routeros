import * as iconv from 'iconv-lite';
/**
 * Class responsible for transmitting data over the
 * socket to the routerboard
 */
export class Transmitter {
    /**
     * Constructor
     *
     * @param socket
     */
    constructor(socket) {
        /**
         * Pool of data to be sent after the socket connects
         */
        this.pool = [];
        this.socket = socket;
        this.socket.once('connect', this.onConnected);
    }
    /**
     * Write data over the socket, if it not writable yet,
     * save over the pool to be ran after
     *
     * @param data
     */
    write(data) {
        const encodedData = this.encodeString(data);
        if (!this.socket.writable || this.pool.length > 0) {
            this.pool.push(encodedData);
        }
        else {
            this.socket.write(encodedData);
        }
    }
    /**
     * Callback upon socket connection
     */
    onConnected() {
        this.runPool();
    }
    /**
     * Writes all data stored in the pool
     */
    runPool() {
        let data;
        while (this.pool.length > 0) {
            data = this.pool.shift();
            this.socket.write(data);
        }
    }
    /**
     * Encode the string data that will
     * be sent over to the routerboard.
     *
     * It's encoded in win1252 so any accentuation on foreign languages
     * are displayed correctly when opened with winbox.
     *
     * Credits for George Joseph: https://github.com/gtjoseph
     *
     * @param str
     */
    encodeString(str) {
        const encoded = iconv.encode(str, 'win1252');
        let data;
        let len = encoded.length;
        let offset = 0;
        if (len < 0x80) {
            data = Buffer.alloc(len + 1);
            data[offset++] = len;
        }
        else if (len < 0x4000) {
            data = Buffer.alloc(len + 2);
            len |= 0x8000;
            data[offset++] = (len >> 8) & 0xff;
            data[offset++] = len & 0xff;
        }
        else if (len < 0x200000) {
            data = Buffer.alloc(len + 3);
            len |= 0xC00000;
            data[offset++] = (len >> 16) & 0xff;
            data[offset++] = (len >> 8) & 0xff;
            data[offset++] = len & 0xff;
        }
        else if (len < 0x10000000) {
            data = Buffer.alloc(len + 4);
            len |= 0xE0000000;
            data[offset++] = (len >> 24) & 0xff;
            data[offset++] = (len >> 16) & 0xff;
            data[offset++] = (len >> 8) & 0xff;
            data[offset++] = len & 0xff;
        }
        else {
            data = Buffer.alloc(len + 5);
            data[offset++] = 0xF0;
            data[offset++] = (len >> 24) & 0xff;
            data[offset++] = (len >> 16) & 0xff;
            data[offset++] = (len >> 8) & 0xff;
            data[offset++] = len & 0xff;
        }
        data.fill(encoded, offset);
        return data;
    }
}
