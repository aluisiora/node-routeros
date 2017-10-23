const should = require('should');
const RouterOSAPI = require('../dist/index');
const config = {
    address: '10.62.0.92',
    username: 'admin',
    password: 'admin',
    port: 8728
};

describe('RouterOSAPI', function () {

    describe('#write()', () => {

        const conn = new RouterOSAPI({
            host: config.address,
            user: config.username,
            password: config.password
        });

        const address = '192.168.84.10/24';
        let address_id = null;

        it('should add address ' + address + ' to interface ether2', (done) => {
            conn.connect().then(() => {

                conn.write('/ip/address/add', ['=address=' + address, '=interface=ether2']).then((data) => {
                    should.exist(data[0].ret);
                    address_id = data[0].ret;
                    done();
                }).catch((err) => {
                    should.fail();
                    done(err);
                });

            }).catch((err) => {
                should.fail();
                done(err);
            });
        });

        it('should print address ' + address + ' from interface ether2', (done) => {

            conn.write('/ip/address/print', ['?address=' + address]).then((data) => {
                should(data[0].address).be.exactly(address);
                done();
            }).catch((err) => {
                should.fail();
                done(err);
            });

        });

        it('should remove address ' + address + ' from interface ether2', (done) => {
            
            conn.write('/ip/address/remove', ['=.id=' + address_id]).then((data) => {
                should(data.length).be.exactly(0);
                done();
            }).catch((err) => {
                should.fail();
                done(err);
            }).then(() => {
                conn.close();
            });

        });

    });

});