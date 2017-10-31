import { TlsOptions } from 'tls';

export declare interface IRosOptions {
    host: string;
    user?: string;
    password?: string;
    port?: number;
    timeout?: number;
    tls?: TlsOptions;
    keepalive?: boolean;
    locale?: string;
}
