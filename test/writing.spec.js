const chai = require('chai');
const RouterOSAPI = require('../dist').RouterOSAPI;
const config = require('./config');

const should = chai.should();

describe('RouterOSAPI', function () {
    describe('#write()', () => {
        const conn = new RouterOSAPI({
            host: config.host,
            user: config.user,
            password: config.password,
        });

        const address = '192.168.84.10/24';
        let address_id = null;

        it('should add address ' + address + ' to interface ether2', (done) => {
            conn.connect()
                .then(() => {
                    conn.write('/ip/address/add', [
                        '=address=' + address,
                        '=interface=ether2',
                    ])
                        .then((data) => {
                            should.exist(data[0].ret);
                            address_id = data[0].ret;
                            done();
                        })
                        .catch((err) => {
                            done(err);
                        });
                })
                .catch((err) => {
                    done(err);
                });
        });

        it(
            'should print address ' + address + ' from interface ether2',
            (done) => {
                conn.write('/ip/address/print', ['?address=' + address])
                    .then((data) => {
                        data[0].address.should.be.equal(address);
                        done();
                    })
                    .catch((err) => {
                        done(err);
                    });
            },
        );

        it(
            'should remove address ' + address + ' from interface ether2',
            (done) => {
                conn.write('/ip/address/remove', ['=.id=' + address_id])
                    .then((data) => {
                        data.length.should.be.equal(0);
                        done();
                    })
                    .catch((err) => {
                        done(err);
                    })
                    .then(() => {
                        conn.close();
                    });
            },
        );
    });
});
