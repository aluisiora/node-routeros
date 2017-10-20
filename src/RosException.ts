import i18n from './locale';

/**
 * RouterOS Exception Handler
 */
export class RosException extends Error {

    public errno: string;

    constructor(errno: string, params?: any) {
        // Pass remaining arguments (including vendor specific ones) to parent constructor
        super(i18n.t(errno, params));

        // Maintains proper stack trace for where our error was thrown
        Error.captureStackTrace(this, RosException);

        // Custom debugging information
        this.errno = errno;
    }

}
