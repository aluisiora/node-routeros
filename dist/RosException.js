"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const messages_1 = require("./messages");
/**
 * RouterOS Exception Handler
 */
class RosException extends Error {
    constructor(errno, extras) {
        super();
        // Maintains proper stack trace for where our error was thrown
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        // Custom debugging information
        this.errno = errno;
        let message = messages_1.default[errno];
        if (message) {
            for (const key in extras) {
                if (extras.hasOwnProperty(key)) {
                    message = message.replace(`{{${key}}}`, extras[key]);
                }
            }
            this.message = message;
        }
    }
}
exports.RosException = RosException;
//# sourceMappingURL=RosException.js.map