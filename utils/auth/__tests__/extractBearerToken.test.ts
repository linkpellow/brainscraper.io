/* @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { extractBearerToken } from '../extractBearerToken';

describe('extractBearerToken', () => {
  it('returns token for valid Bearer header', () => {
    const request = new Request('http://localhost', {
      headers: { Authorization: 'Bearer token-123' },
    });
    expect(extractBearerToken(request)).toBe('token-123');
  });

  it('returns undefined when header is missing', () => {
    const request = new Request('http://localhost');
    expect(extractBearerToken(request)).toBeUndefined();
  });

  it('returns undefined when scheme is not Bearer', () => {
    const request = new Request('http://localhost', {
      headers: { Authorization: 'Basic token-123' },
    });
    expect(extractBearerToken(request)).toBeUndefined();
  });

  it('trims extra spaces around token', () => {
    const request = new Request('http://localhost', {
      headers: { Authorization: 'Bearer    token-123   ' },
    });
    expect(extractBearerToken(request)).toBe('token-123');
  });
});
