import { TlsOptions } from 'tls';

/**
 * Crendential options needed for instantiating
 * a RouterOSAPI object
 */
export interface IRosOptions {
    host: string;
    user?: string;
    password?: string;
    port?: number;
    timeout?: number;
    tls?: TlsOptions;
    keepalive?: boolean;
}
