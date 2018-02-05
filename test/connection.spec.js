const should = require('chai').should;
const RouterOSAPI = require('../dist/index').RouterOSAPI;
const config = require("./config.json");

should();

describe('RouterOSAPI', function() {
    
    describe('#connect()', () => {

        it('should connect normally on ' + config.address, (done) => {
            const conn = new RouterOSAPI({
                host: config.host,
                user: config.user,
                password: config.password
            });

            conn.connect().then(() => {
                conn.close();
                done();
            }).catch((err) => {
                done(err);
            });
        });

        it('should reject wrong password', (done) => {
            const conn = new RouterOSAPI({
                host: config.host,
                user: config.user,
                password: 'wrongpass'
            });

            conn.connect().then(() => {
                should.fail();
                done();
            }).catch((err) => {
                err.errno.should.be.equal('CANTLOGIN');
                done();
            });
        });

        it('should reject from unknown host 192.168.88.2', function(done) {
            this.timeout(5000);

            const conn = new RouterOSAPI({
                host: '192.168.88.2',
                user: config.user,
                password: config.password
            });

            conn.connect().then(() => {
                should.fail();
                done();
            }).catch((err) => {
                err.errno.should.be.equal('EHOSTUNREACH');
                done();
            });
        });

        it('should refuse connection from port 666', function(done) {
            const conn = new RouterOSAPI({
                host: config.host,
                user: config.user,
                password: config.password,
                port: 666
            });

            conn.connect().then(() => {
                should.fail();
                done();
            }).catch((err) => {
                err.errno.should.be.equal('ECONNREFUSED');
                done();
            });
        });

        it('should keep alive for 30 seconds and then close', function(done) {
            this.timeout(35000);

            const conn = new RouterOSAPI({
                host: config.host,
                user: config.user,
                password: config.password,
                keepalive: true,
                port: 8728
            });

            conn.connect().then(() => {
                setTimeout(() => {
                    conn.close().then(() => {
                        done();
                    }).catch((err) => {
                        done(err);
                    });
                }, 30000);
            }).catch((err) => {
                done(err);
            });
        });

        it('should give a timeout error after connecting', function(done) {
            this.timeout(6000);

            const conn = new RouterOSAPI({
                host: config.host,
                user: config.user,
                password: config.password,
                timeout: 4
            });

            conn.connect().then(() => {
                // wait for timeout
            }).catch((err) => {
                done(err);
            });

            conn.on('error', (e) => {
                e.should.have.property("message");
                done();
            });
        });

        it('should reconnect with the same object', function (done) {
            const conn = new RouterOSAPI({
                host: config.host,
                user: config.user,
                password: config.password,
                timeout: 4
            });

            conn.connect().then(() => {
                return conn.close();
            }).then(() => {
                return conn.connect();
            }).then(() => {
                return conn.close();
            }).then(() => {
                done();
            }).catch((err) => {
                done(err);
            });

        });

    });

});
