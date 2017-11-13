const RouterOSAPI = require("../dist").RouterOSAPI;
const chai = require("chai");

const should = chai.should();
const expect = chai.expect;

const address = "10.62.0.25";
let conn;

describe("RosApiOperations", () => {

    before("should stablish connection and save api object", (done) => {
        conn = new RouterOSAPI({
            host: address,
            user: "admin",
            password: "admin",
            keepalive: true
        });
        conn.connect().then(() => {
            done();
        }).catch((err) => {
            should.not.exist(err);
            done(err);
        });
    });

    it("should get all interfaces from /interface", (done) => {

        conn.write(["/interface/print"]).then((interfaces) => {
            interfaces.length.should.be.above(0);
            done();
        }).catch((err) => {
            should.not.exist(err);
            done(err.message);
        });

    });

    it("should get only id and name from /interface", (done) => {

        conn.write([
            "/interface/print",
            "=.proplist=.id,name"
        ]).then((interfaces) => {
            expect(interfaces[0]).to.have.a.property(".id")
            expect(interfaces[0]).to.have.a.property("name")
            expect(interfaces[0]).to.not.have.a.property("type");
            done();
        }).catch((err) => {
            should.not.exist(err);
            done(err.message);
        });

    });

    after("should disconnect", (done) => {
        this.timeout = 5000;

        conn.close().then(() => {
            done();
        }).catch((err) => {
            should.not.exist(err);
            done(err);
        });
    });

});