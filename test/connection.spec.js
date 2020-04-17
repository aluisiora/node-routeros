const should = require('chai').should;
const RouterOSAPI = require('../dist/index').RouterOSAPI;
const config = require('./config');

should();

describe('RouterOSAPI', function () {
    describe('#connect()', () => {
        it('should connect normally on ' + config.host, (done) => {
            const conn = new RouterOSAPI({
                host: config.host,
                user: config.user,
                password: config.password,
            });

            conn.connect()
                .then(() => {
                    conn.close();
                    done();
                })
                .catch((err) => {
                    done(err);
                });
        });

        it('should reject wrong password', (done) => {
            const conn = new RouterOSAPI({
                host: config.host,
                user: config.user,
                password: 'wrongpass',
            });

            conn.connect()
                .then(() => {
                    should.fail();
                    done();
                })
                .catch((err) => {
                    err.errno.should.be.equal('CANTLOGIN');
                    done();
                });
        });

        it('should reject from unknown host 192.168.88.2', function (done) {
            this.timeout(10000);

            const conn = new RouterOSAPI({
                host: '192.168.88.2',
                user: config.user,
                password: config.password,
                timeout: 5,
            });

            conn.connect()
                .then(() => {
                    should.fail();
                    done();
                })
                .catch((err) => {
                    err.errno.should.be.oneOf(['EHOSTUNREACH', 'SOCKTMOUT']);
                    done();
                });
        });

        it('should connect with a password 16 characters or more', function (done) {
            const conn = new RouterOSAPI({
                host: config.host,
                user: config.user,
                password: config.password,
            });

            let conn2;
            const testUser = {
                name: 'testuser',
                group: 'read',
                password:
                    'averybigpassword' +
                    'withespecialcharacters@#$_!' +
                    'andnumbers12345' +
                    'andabighashnonsense' +
                    'b5fefe3bb04026ce6f7fa7e89c605c88' +
                    '729cc9ae543c722240fa310927945545' +
                    '1516e06d11ba2c3bff36baab21259882' +
                    'ff4fcd0cb49fc64558fbb195cf6eb45a',
            };

            conn.connect()
                .then(() => {
                    return conn.write('/user/add', [
                        '=name=' + testUser.name,
                        '=group=' + testUser.group,
                        '=password=' + testUser.password,
                    ]);
                })
                .then((data) => {
                    testUser.id = data[0].ret;

                    conn2 = new RouterOSAPI({
                        host: config.host,
                        user: testUser.name,
                        password: testUser.password,
                    });

                    return conn2.connect();
                })
                .then(() => {
                    return conn2.close();
                })
                .then(() => {
                    return conn.write('/user/remove', ['=.id=' + testUser.id]);
                })
                .then(() => {
                    conn.close();
                    done();
                })
                .catch((err) => {
                    done(err);
                });
        });

        it('should refuse connection from port 666', function (done) {
            const conn = new RouterOSAPI({
                host: config.host,
                user: config.user,
                password: config.password,
                port: 666,
            });

            conn.connect()
                .then(() => {
                    should.fail();
                    done();
                })
                .catch((err) => {
                    err.errno.should.be.equal('ECONNREFUSED');
                    done();
                });
        });

        it('should keep alive for 30 seconds and then close', function (done) {
            this.timeout(35000);

            const conn = new RouterOSAPI({
                host: config.host,
                user: config.user,
                password: config.password,
                keepalive: true,
                port: 8728,
            });

            conn.connect()
                .then(() => {
                    setTimeout(() => {
                        conn.close()
                            .then(() => {
                                done();
                            })
                            .catch((err) => {
                                done(err);
                            });
                    }, 30000);
                })
                .catch((err) => {
                    done(err);
                });
        });

        it('should give a timeout error after connecting', function (done) {
            this.timeout(6000);

            const conn = new RouterOSAPI({
                host: config.host,
                user: config.user,
                password: config.password,
                timeout: 4,
            });

            conn.connect()
                .then(() => {
                    // wait for timeout
                })
                .catch((err) => {
                    done(err);
                });

            conn.on('error', (e) => {
                e.should.have.property('message');
                done();
            });
        });

        it('should reconnect with the same object', function (done) {
            const conn = new RouterOSAPI({
                host: config.host,
                user: config.user,
                password: config.password,
                timeout: 4,
            });

            conn.connect()
                .then(() => {
                    return conn.close();
                })
                .then(() => {
                    return conn.connect();
                })
                .then(() => {
                    return conn.close();
                })
                .then(() => {
                    done();
                })
                .catch((err) => {
                    done(err);
                });
        });

        it('should connect via SSL normally on ' + config.host, (done) => {
            const conn = new RouterOSAPI({
                host: config.host,
                user: config.user,
                password: config.password,
                tls: {
                    rejectUnauthorized: false,
                    ciphers: 'ADH-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384',
                },
                port: config.sslPort,
            });

            conn.connect()
                .then(() => {
                    conn.close();
                    done();
                })
                .catch((err) => {
                    done(err);
                });
        });
    });
});
