const should = require('should');
const RouterOSAPI = require('../dist/index');
const config = {
    address: '10.62.0.92',
    username: 'admin',
    password: 'admin',
    port: 8728
};

describe('RouterOSAPI', function() {
    
    describe('#connect()', () => {

        it('should connect normally 192.168.88.1', () => {
            const conn = new RouterOSAPI({
                host: config.address,
                user: config.username,
                password: config.password
            });

            conn.connect().then(() => {
                conn.close().should.be.fulfilled;
            }).catch((err) => {
                should.not.exist(err);
            });
        });

        it('should reject wrong password', (done) => {
            const conn = new RouterOSAPI({
                host: config.address,
                user: config.username,
                password: 'wrongpass'
            });

            conn.connect().then(() => {
                should.fail();
                done();
            }).catch((err) => {
                should(err.errno).equal('CANTLOGIN');
                done();
            });
        });

        it('should reject from unknown host 192.168.88.2', function(done) {
            this.timeout(5000);

            const conn = new RouterOSAPI({
                host: '192.168.88.2',
                user: config.username,
                password: config.password
            });

            conn.connect().then(() => {
                should.fail();
                done();
            }).catch((err) => {
                should(err.errno).be.oneOf('EHOSTUNREACH', 'ECONNREFUSED');
                done();
            });
        });

        it('should refuse connection from port 666', function(done){
            const conn = new RouterOSAPI({
                host: config.address,
                user: config.username,
                password: config.password,
                port: 666
            });

            conn.connect().then(() => {
                should.fail();
                done();
            }).catch((err) => {
                should(err.errno).be.oneOf('EHOSTUNREACH', 'ECONNREFUSED');
                done();
            });
        });

    });

});
