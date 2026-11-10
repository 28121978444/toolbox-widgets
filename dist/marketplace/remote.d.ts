/**
 * Endpoint guard for remote-server marketplace modules. Remote endpoints
 * receive tool arguments from this machine, so they must be public HTTPS
 * hosts — never loopback, link-local, private ranges or bare intranet names.
 */
/** Throws unless the endpoint is a public HTTPS URL. Returns the normalized URL. */
export declare function validateRemoteEndpoint(value: unknown): string;
