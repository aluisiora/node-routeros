import { encode as strEncode } from 'iconv-lite';

export class Utils {

    /**
     * Encodes a string
     * @param str string
     */
    public static encodeString(str: string) : Buffer {
        const encoded = strEncode(str, 'win1252');

        let data = null;
        let len = encoded.length;
        let offset = 0;

        if (len < 0x80) {
            data = Buffer.alloc(len + 1);
            data[offset++] = len;
        } else if (len < 0x4000) {
            data = Buffer.alloc(len + 2);
            len |= 0x8000;
            data[offset++] = (len >> 8) & 0xff;
            data[offset++] = len & 0xff;
        } else if (len < 0x200000) {
            data = Buffer.alloc(len + 3);
            len |= 0xC00000;
            data[offset++] = (len >> 16) & 0xff;
            data[offset++] = (len >> 8) & 0xff;
            data[offset++] = len & 0xff;
        } else if (len < 0x10000000) {
            data = Buffer.alloc(len + 4);
            len |= 0xE0000000;
            data[offset++] = (len >> 24) & 0xff;
            data[offset++] = (len >> 16) & 0xff;
            data[offset++] = (len >> 8) & 0xff;
            data[offset++] = len & 0xff;
        } else {
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

    /**
     * Decodes the length of the data array
     * @param data Array<number>
     */
    public static decodeLength(data: Array<number>): Array<number> {
        let idx = 0;
        let b = data[idx++];
        let len;
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
        return [idx, len];
    }


}
