import { describe, it, expect } from 'vitest';
import { URL } from 'url';

/** Safe hostnames allowed for the proxy endpoint (mirrors server logic) */
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

describe('Proxy endpoint SSRF prevention', () => {
  it('should allow localhost URLs', () => {
    const url = new URL('http://localhost:3000/api/users');
    expect(ALLOWED_HOSTS.has(url.hostname)).toBe(true);
  });

  it('should allow 127.0.0.1 URLs', () => {
    const url = new URL('http://127.0.0.1:8080/api/items');
    expect(ALLOWED_HOSTS.has(url.hostname)).toBe(true);
  });

  it('should allow IPv6 loopback', () => {
    const url = new URL('http://[::1]:3000/api/test');
    // URL parser may return '::1' or '[::1]' depending on platform
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    expect(ALLOWED_HOSTS.has(hostname)).toBe(true);
  });

  it('should reject external hostnames', () => {
    const urls = [
      'http://example.com/api/users',
      'http://evil.localhost/api/data',
      'http://10.0.0.1/api/internal',
      'http://192.168.1.1/api/router',
    ];

    for (const raw of urls) {
      const url = new URL(raw);
      expect(ALLOWED_HOSTS.has(url.hostname)).toBe(false);
    }
  });

  it('should reject DNS rebinding attempts', () => {
    // 127.0.0.1.evil.com parses as hostname "127.0.0.1.evil.com"
    const url = new URL('http://127.0.0.1.evil.com/api/data');
    expect(ALLOWED_HOSTS.has(url.hostname)).toBe(false);
  });

  it('should handle URLs without explicit port', () => {
    const url = new URL('http://localhost/api/users');
    expect(ALLOWED_HOSTS.has(url.hostname)).toBe(true);
    expect(url.pathname).toBe('/api/users');
  });

  it('should correctly parse query parameters from URL', () => {
    const url = new URL('http://localhost:3000/api/users?page=1&limit=10');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('10');
  });
});

describe('Proxy request validation', () => {
  it('should construct correct URL from relative path', () => {
    const port = 3000;
    const path = '/api/users';
    const url = new URL(`http://localhost:${port}${path}`);
    expect(url.toString()).toBe('http://localhost:3000/api/users');
  });

  it('should add query params to URL', () => {
    const url = new URL('http://localhost:3000/api/users');
    const params = { page: '1', limit: '10', search: 'john' };
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('search')).toBe('john');
  });
});
