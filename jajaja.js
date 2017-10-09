const RouterOSAPI = require('./dist/index');

const conn = new RouterOSAPI({
    host: '192.168.88.1',
    user: 'admin',
    password: 'senhas',
    port: 2222
});

conn.connect().then(() => {
    console.log('uai');
}).catch((err) => {
    console.log(err);
});