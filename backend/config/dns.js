/**
 * Optional DNS override, off unless DNS_SERVERS is set.
 *
 * On some Windows machines Node's resolver library cannot read the system DNS
 * configuration and silently falls back to 127.0.0.1, where nothing is
 * listening. Every lookup then fails with ECONNREFUSED - including the SRV
 * lookup that a mongodb+srv:// Atlas URI depends on, so MongoDB never connects
 * while every other tool on the machine resolves names perfectly.
 *
 * This lived inline in server.js, which meant the API could reach Atlas on such
 * a machine and none of the scripts in data/ could:
 *
 *     querySrv ECONNREFUSED _mongodb._tcp.cluster0.<...>.mongodb.net
 *
 * Anything that opens a mongodb+srv:// connection needs it, so it is a module
 * rather than a paragraph in one file.
 */

const dns = require('dns');

/** Apply DNS_SERVERS if it is set. Safe to call more than once. */
function applyDnsOverride() {
    const configured = process.env.DNS_SERVERS;
    if (!configured) return false;

    const servers = configured
        .split(',')
        .map((server) => server.trim())
        .filter(Boolean);

    if (servers.length === 0) return false;

    try {
        dns.setServers(servers);
        console.log(`DNS resolvers overridden: ${servers.join(', ')}`);
        return true;
    } catch (error) {
        // Not fatal: an unparseable value should not stop a service that might
        // resolve names perfectly well without any override.
        console.warn(`Ignoring invalid DNS_SERVERS (${error.message})`);
        return false;
    }
}

module.exports = { applyDnsOverride };
