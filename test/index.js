const should = require('should');
const RouterOSAPI = require('../dist/index');

describe('RouterOSAPI', () => {

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

        it('should reject wrong password', () => {
            const conn = new RouterOSAPI({
                host: '192.168.88.1',
                user: 'admin',
                password: 'wrongpass'
            });

            conn.connect().then(() => {
                should(null).not.be.ok();
            }).catch((err) => {
                should.exist(err);
            });
        });

        it('should reject from unknown host 192.168.88.2', () => {
            const conn = new RouterOSAPI({
                host: '192.168.88.2',
                user: 'admin',
                password: 'senhas'
            });

            conn.connect().should.be.rejected;
        });

    });

});
