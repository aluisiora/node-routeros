const { Receiver } = require('../dist/connector/Receiver');
const { Transmitter } = require('../dist/connector/Transmitter');
const { expect } = require('chai');

let rec, trans;

describe('Receiver', () => {
    beforeEach(() => {
        rec = new Receiver();
        trans = new Transmitter();
    });

    it('should handle a complete sentance and callback the tag', (done) => {
        let segments = [];
        segments.push(trans.encodeString('!re'));
        segments.push(trans.encodeString('.tag=foobar'));
        segments.push(trans.encodeString('datahere!'));
        segments.push(Buffer.from([0x00]));

        const buff = Buffer.concat(segments);

        rec.read('foobar', (data) => {
            expect(data.length).to.be.equal(2);
            expect(data[0]).to.be.equal('!re');
            expect(data[1]).to.be.equal('datahere!');

            done();
        });

        rec.processRawData(buff);
    });

    it('should handle data split by a tcp transmission', (done) => {
        let segments = [];
        segments.push(trans.encodeString('!re'));
        segments.push(trans.encodeString('.tag=foobar'));
        segments.push(trans.encodeString('datahere!'));
        segments.push(Buffer.from([0x00]));

        const buff = Buffer.concat(segments);
        const payload_a = buff.slice(0, 10);
        const payload_b = buff.slice(10);

        rec.read('foobar', (data) => {
            expect(data.length).to.be.equal(2);
            expect(data[0]).to.be.equal('!re');
            expect(data[1]).to.be.equal('datahere!');

            done();
        });

        rec.processRawData(payload_a);
        rec.processRawData(payload_b);
    });

    it('should handle a length descriptor split by a tcp transmission', (done) => {
        const large_data = 'lotsofdata!'.repeat(4092);

        let segments = [];
        segments.push(trans.encodeString('!re'));
        segments.push(trans.encodeString('.tag=foobar'));
        let buff = Buffer.concat(segments);

        const payload_a = buff.slice(0, 10);
        const remaining_len = buff.length - payload_a.length;

        segments = [];
        segments.push(trans.encodeString(large_data));
        segments.push(Buffer.from([0x00]));

        buff = Buffer.concat([buff.slice(10), ...segments]);
        const payload_b = buff.slice(0, remaining_len + 1);
        const payload_c = buff.slice(remaining_len + 1);

        rec.read('foobar', (data) => {
            expect(data.length).to.be.equal(2);
            expect(data[0]).to.be.equal('!re');
            expect(data[1]).to.be.equal(large_data);

            done();
        });

        rec.processRawData(payload_a);
        rec.processRawData(payload_b);
        rec.processRawData(payload_c);
    });
});
