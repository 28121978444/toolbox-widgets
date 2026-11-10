/**
 * Endpoint guard for remote-server marketplace modules. Remote endpoints
 * receive tool arguments from this machine, so they must be public HTTPS
 * hosts — never loopback, link-local, private ranges or bare intranet names.
 */
const BLOCKED_HOST_SUFFIXES = ['.local', '.internal', '.localhost', '.lan', '.home', '.corp'];
function isPrivateIp(host) {
    // IPv4 literals
    const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (v4) {
        const [a, b] = [Number(v4[1]), Number(v4[2])];
        if (a === 0 || a === 10 || a === 127)
            return true;
        if (a === 169 && b === 254)
            return true;
        if (a === 172 && b >= 16 && b <= 31)
            return true;
        if (a === 192 && b === 168)
            return true;
        if (a === 100 && b >= 64 && b <= 127)
            return true; // CGNAT
        if (a >= 224)
            return true; // multicast + reserved
        return false;
    }
    // IPv6 literals (URL hostname strips brackets)
    if (host.includes(':')) {
        const lower = host.toLowerCase();
        if (lower === '::1' || lower === '::')
            return true;
        if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd'))
            return true;
        if (lower.startsWith('::ffff:'))
            return isPrivateIp(lower.slice(7));
        return false;
    }
    return false;
}
/** Throws unless the endpoint is a public HTTPS URL. Returns the normalized URL. */
export function validateRemoteEndpoint(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error('A remote-server module needs an endpoint URL.');
    }
    let url;
    try {
        url = new URL(value.trim());
    }
    catch {
        throw new Error(`The endpoint "${value}" is not a valid URL.`);
    }
    if (url.protocol !== 'https:') {
        throw new Error('Remote endpoints must use HTTPS.');
    }
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || !host.includes('.')) {
        throw new Error('Remote endpoints must be public hosts, not local names.');
    }
    if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
        throw new Error('Remote endpoints must be public hosts, not intranet names.');
    }
    if (isPrivateIp(host)) {
        throw new Error('Remote endpoints must not point at private or loopback addresses.');
    }
    if (url.username || url.password) {
        throw new Error('Remote endpoints must not embed credentials.');
    }
    return url.toString();
}
//# sourceMappingURL=remote.js.map