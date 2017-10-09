const should = require('should');
const assert = require('assert');
const RouterOSAPI = require('../dist/index');

describe('RouterOSAPI', function() {
    
    
    describe('#connect()', () => {

        it('should connect normally 192.168.88.1', () => {
            const conn = new RouterOSAPI({
                host: '192.168.88.1',
                user: 'admin',
                password: 'senhas'
            });

            conn.connect().then(() => {
                conn.close().should.be.fulfilled;
            }).catch((err) => {
                should.not.exist(err);
            });
        });

        it('should reject wrong password', (done) => {
            const conn = new RouterOSAPI({
                host: '192.168.88.1',
                user: 'admin',
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
                user: 'admin',
                password: 'senhas'
            });

            conn.connect().then(() => {
                should.fail();
                done();
            }).catch((err) => {
                should(err.errno).equal('EHOSTUNREACH');
                done();
            });
        });

        it('should refuse connection from port 666', function(done){
            const conn = new RouterOSAPI({
                host: '192.168.88.1',
                user: 'admin',
                password: 'senhas',
                port: 666
            });

            conn.connect().then(() => {
                should.fail();
                done();
            }).catch((err) => {
                should(err.errno).equal('ECONNREFUSED');
                done();
            });
        });

    });

});
