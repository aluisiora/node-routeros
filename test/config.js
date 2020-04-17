require('dotenv').config();

function env(key) {
    return process.env[key] || null;
}

module.exports = {
    host: env('HOST'),
    user: env('USERNAME'),
    password: env('PASSWORD'),
    sslPort: env('SSL_PORT'),
};
