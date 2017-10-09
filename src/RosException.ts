export class RosException extends Error {

    public errno: string;
    public params: any[];

    constructor(errno: string, ...params: any[]) {
        // Pass remaining arguments (including vendor specific ones) to parent constructor
        super(...params);

        // Maintains proper stack trace for where our error was thrown
        Error.captureStackTrace(this, RosException);

        // Custom debugging information
        this.errno = errno;
    }

}
