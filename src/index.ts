if (process.env.ENV === 'testing') {
    const sourceMapSupport = require('source-map-support');
    sourceMapSupport.install();
}

export * from './RouterOSAPI';
export * from './connector/Connector';
export * from './connector/Receiver';
export * from './connector/Transmitter';
export * from './Channel';
export * from './IRosOptions';
export * from './RosException';
export * from './RStream';
