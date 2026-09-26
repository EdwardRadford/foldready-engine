// Tests for the URL guard in src/url.ts.
//
// The engine renders whatever URL it is handed, so this module is the only thing
// standing between a public check endpoint and the machine's own network. These
// tests are table-driven and run offline: every case is either pure string work
// or an IP literal, so nothing here performs a DNS lookup.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { normaliseUrl, isPrivateAddress, assertPublicHost, UrlError } from '../src/url.ts';

// --------------------------------------------------------------------------
// normaliseUrl
// --------------------------------------------------------------------------

describe('normaliseUrl', () => {
  test('assumes https for input with no scheme', () => {
    const cases: [string, string][] = [
      ['example.com', 'https://example.com/'],
      ['  example.com  ', 'https://example.com/'],
      ['example.com/pricing', 'https://example.com/pricing'],
      ['example.com:8443/a?b=1', 'https://example.com:8443/a?b=1'],
      ['sub.example.co.uk', 'https://sub.example.co.uk/'],
    ];
    for (const [input, expected] of cases) {
      assert.equal(normaliseUrl(input).href, expected, input);
    }
  });

  test('keeps an explicit http or https scheme', () => {
    for (const input of ['http://example.com/', 'https://example.com/']) {
      assert.equal(normaliseUrl(input).href, input);
    }
  });

  test('rejects credentials embedded in the URL', () => {
    // A URL carrying credentials is either a copy-paste accident or an attempt
    // to make the renderer authenticate as somebody. Neither is a page to check.
    const cases = [
      'https://user:pass@example.com',
      'https://user@example.com',
      'https://:pass@example.com',
      'http://admin:hunter2@example.com/dashboard',
    ];
    for (const input of cases) {
      assert.throws(() => normaliseUrl(input), (e: unknown) => {
        assert.ok(e instanceof UrlError, input);
        assert.equal(e.code, 'credentials', input);
        return true;
      }, input);
    }
  });

  test('rejects every scheme but http and https', () => {
    const cases = ['ftp://example.com', 'file:///etc/passwd', 'ws://example.com', 'gopher://example.com'];
    for (const input of cases) {
      assert.throws(() => normaliseUrl(input), (e: unknown) => {
        assert.ok(e instanceof UrlError, input);
        assert.equal(e.code, 'scheme', input);
        return true;
      }, input);
    }
  });

  test('rejects junk, with a code naming the reason', () => {
    // javascript: and data: have no "://" so they are never treated as schemes;
    // they fail as unparseable instead, which is the same refusal by a shorter route.
    const cases: [string, string][] = [
      ['', 'empty'],
      ['   ', 'empty'],
      ['javascript:alert(1)', 'invalid'],
      ['data:text/html,<script>1</script>', 'invalid'],
      ['http://ex ample', 'invalid'],
      ['https://intranet', 'hostname'],
      ['https://wiki', 'hostname'],
    ];
    for (const [input, code] of cases) {
      assert.throws(() => normaliseUrl(input), (e: unknown) => {
        assert.ok(e instanceof UrlError, input);
        assert.equal(e.code, code, input);
        return true;
      }, JSON.stringify(input));
    }
  });

  test('drops the fragment and keeps path, query and port', () => {
    const u = normaliseUrl('example.com:8443/a/b?q=1&r=2#anchor');
    assert.equal(u.hash, '');
    assert.equal(u.pathname, '/a/b');
    assert.equal(u.search, '?q=1&r=2');
    assert.equal(u.port, '8443');
  });

  test('accepts localhost, leaving it for the host guard to refuse', () => {
    // Two layers on purpose: parsing says "this is a URL", assertPublicHost says
    // "you may not fetch it". --allow-local turns off only the second one.
    assert.equal(normaliseUrl('localhost').href, 'https://localhost/');
    assert.rejects(() => assertPublicHost(normaliseUrl('localhost')), UrlError);
  });
});

// --------------------------------------------------------------------------
// isPrivateAddress
// --------------------------------------------------------------------------

describe('isPrivateAddress', () => {
  test('blocks the reserved IPv4 ranges', () => {
    const cases: [string, string][] = [
      ['0.0.0.0', 'this host, 0.0.0.0/8'],
      ['10.0.0.1', 'private 10/8'],
      ['127.0.0.1', 'loopback 127/8'],
      ['100.64.0.1', 'carrier-grade NAT 100.64/10, low end'],
      ['100.127.255.255', 'carrier-grade NAT 100.64/10, high end'],
      ['169.254.169.254', 'link-local 169.254/16, the cloud metadata address'],
      ['172.16.0.1', 'private 172.16/12, low end'],
      ['172.31.255.255', 'private 172.16/12, high end'],
      ['192.0.0.1', 'IETF protocol assignments 192.0.0/24'],
      ['192.168.1.1', 'private 192.168/16'],
      ['198.18.0.1', 'benchmarking 198.18/15, low end'],
      ['198.19.255.255', 'benchmarking 198.18/15, high end'],
      ['224.0.0.1', 'multicast 224/4'],
      ['239.255.255.255', 'multicast 224/4, high end'],
      ['255.255.255.255', 'broadcast'],
    ];
    for (const [ip, why] of cases) {
      assert.equal(isPrivateAddress(ip), true, `${ip} (${why}) should be blocked`);
    }
  });

  test('allows public IPv4, including addresses just outside each reserved range', () => {
    const cases: [string, string][] = [
      ['8.8.8.8', 'public resolver'],
      ['93.184.216.34', 'ordinary public host'],
      ['100.63.255.255', 'just below carrier-grade NAT'],
      ['100.128.0.1', 'just above carrier-grade NAT'],
      ['169.253.255.255', 'just below link-local'],
      ['172.15.255.255', 'just below private 172.16/12'],
      ['172.32.0.1', 'just above private 172.16/12'],
      ['198.17.255.255', 'just below benchmarking'],
      ['198.20.0.1', 'just above benchmarking'],
      ['223.255.255.255', 'just below multicast'],
    ];
    for (const [ip, why] of cases) {
      assert.equal(isPrivateAddress(ip), false, `${ip} (${why}) should be allowed`);
    }
  });

  test('blocks the reserved IPv6 ranges', () => {
    const cases: [string, string][] = [
      ['::', 'unspecified'],
      ['::1', 'loopback'],
      ['fe80::1', 'link-local fe80::/10, low end'],
      ['febf:ffff::1', 'link-local fe80::/10, high end'],
      ['fec0::1', 'site-local fec0::/10, deprecated'],
      ['fc00::1', 'unique local fc00::/7, low end'],
      ['fdff:ffff::1', 'unique local fc00::/7, high end'],
      ['ff02::1', 'multicast, all nodes on the link'],
      ['ff05::1:3', 'multicast, site-local'],
      ['FE80::1', 'uppercase is the same address'],
    ];
    for (const [ip, why] of cases) {
      assert.equal(isPrivateAddress(ip), true, `${ip} (${why}) should be blocked`);
    }
  });

  test('allows public IPv6', () => {
    const cases: [string, string][] = [
      ['2001:4860:4860::8888', 'public resolver'],
      ['2606:4700:4700::1111', 'public resolver'],
      ['2a00:1450:4009:81f::200e', 'ordinary public host'],
    ];
    for (const [ip, why] of cases) {
      assert.equal(isPrivateAddress(ip), false, `${ip} (${why}) should be allowed`);
    }
  });

  test('judges IPv4-mapped IPv6 on the address it embeds', () => {
    // ::ffff:127.0.0.1 reaches loopback. Blocking 127.0.0.1 and not its mapped
    // form would be a guard with a hole in it.
    const cases: [string, boolean][] = [
      ['::ffff:127.0.0.1', true],
      ['::ffff:10.0.0.1', true],
      ['::ffff:169.254.169.254', true],
      ['::ffff:192.168.0.1', true],
      ['::ffff:8.8.8.8', false],
      ['::ffff:0808:0808', true], // same address in hex; not parsed, so it fails closed
    ];
    for (const [ip, expected] of cases) {
      assert.equal(isPrivateAddress(ip), expected, ip);
    }
  });

  test('fails closed on anything that is not an IP address', () => {
    for (const input of ['', 'not-an-ip', 'example.com', '10.0.0', '1.2.3.4.5', '999.1.1.1', '::gg']) {
      assert.equal(isPrivateAddress(input), true, JSON.stringify(input));
    }
  });
});

// --------------------------------------------------------------------------
// assertPublicHost
// --------------------------------------------------------------------------

describe('assertPublicHost', () => {
  test('refuses local and internal hostname suffixes without a lookup', async () => {
    const cases = [
      'http://localhost/',
      'http://localhost:3000/',
      'http://app.localhost/',
      'http://printer.local/',
      'http://metadata.internal/',
      'http://db.svc.internal/',
    ];
    for (const input of cases) {
      await assert.rejects(() => assertPublicHost(new URL(input)), (e: unknown) => {
        assert.ok(e instanceof UrlError, input);
        assert.equal(e.code, 'private', input);
        return true;
      }, input);
    }
  });

  test('refuses private IP literals, v4 and bracketed v6', async () => {
    const cases = [
      'http://127.0.0.1/',
      'http://127.0.0.1:8080/admin',
      'http://10.1.2.3/',
      'http://169.254.169.254/latest/meta-data/',
      'http://192.168.0.1/',
      'http://100.64.0.1/',
      'http://[::1]/',
      'http://[fd00::1]/',
      'http://[ff02::1]/',
    ];
    for (const input of cases) {
      await assert.rejects(() => assertPublicHost(new URL(input)), (e: unknown) => {
        assert.ok(e instanceof UrlError, input);
        assert.equal(e.code, 'private', input);
        return true;
      }, input);
    }
  });

  test('passes public IP literals straight through, still without a lookup', async () => {
    for (const input of ['http://8.8.8.8/', 'https://93.184.216.34/', 'http://[2001:4860:4860::8888]/']) {
      await assert.doesNotReject(() => assertPublicHost(new URL(input)), input);
    }
  });

  test('allowLocal turns the guard off entirely, which is what --allow-local is for', async () => {
    for (const input of ['http://localhost:3000/', 'http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/']) {
      await assert.doesNotReject(() => assertPublicHost(new URL(input), true), input);
    }
  });

  test('UrlError carries a machine-readable code alongside the message', () => {
    const e = new UrlError('nope', 'private');
    assert.ok(e instanceof Error);
    assert.equal(e.code, 'private');
    assert.equal(e.message, 'nope');
  });
});
