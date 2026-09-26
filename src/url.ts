import { promises as dns } from 'node:dns';
import net from 'node:net';

export class UrlError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
  }
}

/** Normalise user input to an absolute http(s) URL. Throws UrlError on junk. */
export function normaliseUrl(input: string): URL {
  let s = (input ?? '').trim();
  if (!s) throw new UrlError('Enter a web address to check.', 'empty');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new UrlError('That does not look like a web address.', 'invalid');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new UrlError('Only http and https addresses can be checked.', 'scheme');
  }
  if (u.username || u.password) throw new UrlError('Addresses with a username or password are not supported.', 'credentials');
  if (!u.hostname.includes('.') && u.hostname !== 'localhost') {
    throw new UrlError('That does not look like a public web address.', 'hostname');
  }
  u.hash = '';
  return u;
}

function isPrivateV4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateV6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === '::' || s === '::1') return true; // unspecified, loopback
  // IPv4-mapped (::ffff:a.b.c.d) is judged on the embedded v4 address. Any other
  // mapped spelling (::ffff:0808:0808) is not parsed here, so it fails closed.
  if (s.startsWith('::ffff:')) return isPrivateV4(s.slice(7));
  if (/^fe[89ab]/.test(s)) return true; // link-local fe80::/10
  if (/^fe[cdef]/.test(s)) return true; // site-local fec0::/10, deprecated but still routed on some networks
  if (/^f[cd]/.test(s)) return true; // unique local fc00::/7
  if (/^ff/.test(s)) return true; // multicast ff00::/8, including ff02::1 all-nodes
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateV4(ip);
  if (net.isIPv6(ip)) return isPrivateV6(ip);
  return true;
}

/** Resolve the host and refuse anything that points at private/internal ranges (SSRF guard). */
export async function assertPublicHost(u: URL, allowLocal = false): Promise<void> {
  if (allowLocal) return;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new UrlError('Local and internal addresses cannot be checked.', 'private');
  }
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new UrlError('Private network addresses cannot be checked.', 'private');
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new UrlError('That address could not be found. Check the spelling and try again.', 'dns');
  }
  if (addrs.length === 0) throw new UrlError('That address could not be found.', 'dns');
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    throw new UrlError('That address points at a private network and cannot be checked.', 'private');
  }
}
