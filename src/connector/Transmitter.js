"use strict";
exports.__esModule = true;
var iconv = require("iconv-lite");
var debug = require("debug");
var info = debug('routeros-api:connector:transmitter:info');
var error = debug('routeros-api:connector:transmitter:error');
/**
 * Class responsible for transmitting data over the
 * socket to the routerboard
 */
var Transmitter = /** @class */ (function () {
    /**
     * Constructor
     *
     * @param socket
     */
    function Transmitter(socket) {
        /**
         * Pool of data to be sent after the socket connects
         */
        this.pool = [];
        this.socket = socket;
    }
    /**
     * Write data over the socket, if it not writable yet,
     * save over the pool to be ran after
     *
     * @param {string} data
     */
    Transmitter.prototype.write = function (data) {
        var encodedData = this.encodeString(data);
        if (!this.socket.writable || this.pool.length > 0) {
            info('Socket not writable, saving %o in the pool', data);
            this.pool.push(encodedData);
        }
        else {
            info('Writing command %s over the socket', data);
            this.socket.write(encodedData);
        }
    };
    /**
     * Writes all data stored in the pool
     */
    Transmitter.prototype.runPool = function () {
        info('Running stacked command pool');
        var data;
        while (this.pool.length > 0) {
            data = this.pool.shift();
            this.socket.write(data);
        }
    };
    /**
     * Encode the string data that will
     * be sent over to the routerboard.
     *
     * It's encoded in win1252 so any accentuation on foreign languages
     * are displayed correctly when opened with winbox.
     *
     * Credits for George Joseph: https://github.com/gtjoseph
     * and for Brandon Myers: https://github.com/Trakkasure
     *
     * @param {string} str
     */
    Transmitter.prototype.encodeString = function (str) {
        if (str === null)
            return String.fromCharCode(0);
        var encoded = iconv.encode(str, 'win1252');
        var data;
        var len = encoded.length;
        var offset = 0;
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
    };
    return Transmitter;
}());
exports.Transmitter = Transmitter;
