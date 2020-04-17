const RouterOSAPI = require('../dist').RouterOSAPI;
const chai = require('chai');
const config = require('./config');

const should = chai.should();
const expect = chai.expect;

let conn;

describe('RosApiOperations', () => {
    before('should stablish connection and save api object', (done) => {
        conn = new RouterOSAPI({
            host: config.host,
            user: config.user,
            password: config.password,
            keepalive: true,
        });
        conn.connect()
            .then(() => {
                done();
            })
            .catch((err) => {
                done(err);
            });
    });

    it('should get all interfaces from /interface', (done) => {
        conn.write(['/interface/print'])
            .then((interfaces) => {
                interfaces.length.should.be.above(0);
                done();
            })
            .catch((err) => {
                done(err);
            });
    });

    it('should get only id and name from /interface', (done) => {
        conn.write(['/interface/print', '=.proplist=.id,name'])
            .then((interfaces) => {
                expect(interfaces[0]).to.have.a.property('.id');
                expect(interfaces[0]).to.have.a.property('name');
                expect(interfaces[0]).to.not.have.a.property('type');
                done();
            })
            .catch((err) => {
                done(err);
            });
    });

    it('should get a single user using the writeStream command', (done) => {
        const chann = conn.writeStream(['/user/print', '?name=admin']);
        chann.on('data', (data) => {
            expect(data).to.have.a.property('name').and.be.equal('admin');
        });

        let gotDone = false;
        let gotTrapped = false;

        chann.once('done', () => {
            gotDone = true;
        });

        chann.once('trap', () => {
            gotTrapped = true;
        });

        chann.once('close', () => {
            expect(gotDone).to.be.equal(true);
            expect(gotTrapped).to.be.equal(false);
            done();
        });
    });

    it('should throw a trap using the writeStream command', (done) => {
        const chann = conn.writeStream('somethingthatdoesntexist');

        let gotData = 'gotnodata';

        chann.on('data', (data) => {
            gotData = data;
        });

        let gotDone = false;
        let gotTrapped = false;
        let gotError = false;
        let theTrap = {};

        chann.once('done', () => {
            gotDone = true;
        });

        chann.once('trap', (trap) => {
            theTrap = trap;
            gotTrapped = true;
        });

        chann.once('error', (trap) => {
            gotError = true;
        });

        chann.once('close', () => {
            expect(gotData).to.be.equal('gotnodata');
            expect(theTrap)
                .to.have.property('message')
                .and.be.equal('no such command prefix');
            expect(gotDone).to.be.equal(false);
            expect(gotTrapped).to.be.equal(true);
            expect(gotError).to.be.equal(true);
            done();
        });
    });

    it('should stop streaming with writeStream after 5 seconds', function (done) {
        this.timeout(7000);

        const chann = conn.writeStream('/ip/address/listen');

        let gotDone = false;
        let gotTrapped = false;

        let gotData = 'gotnodata';

        chann.on('data', (data) => {
            gotData = 'gotsomedata';
        });

        chann.once('done', () => {
            gotDone = true;
        });

        chann.once('trap', () => {
            gotTrapped = true;
        });

        chann.once('close', () => {
            expect(gotData).to.be.equal('gotnodata');
            expect(gotDone).to.be.equal(true);
            expect(gotTrapped).to.be.equal(false);
            done();
        });

        setTimeout(() => {
            chann.close();
        }, 5000);
    });

    after('should disconnect', (done) => {
        this.timeout = 5000;

        conn.close()
            .then(() => {
                done();
            })
            .catch((err) => {
                done(err);
            });
    });
});
