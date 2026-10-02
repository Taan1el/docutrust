import { describe, it, expect } from 'vitest';
import { formatTimestamp, truncateMiddle } from './format.js';

describe('formatTimestamp', () => {
  it('renders an ISO timestamp in UTC', () => {
    expect(formatTimestamp('2026-09-10T12:30:45Z')).toBe('2026-09-10 12:30 UTC');
  });

  it('returns an empty string for a missing value and echoes an unparseable one', () => {
    expect(formatTimestamp(undefined)).toBe('');
    expect(formatTimestamp('not a date')).toBe('not a date');
  });
});

describe('truncateMiddle', () => {
  it('keeps short values whole', () => {
    expect(truncateMiddle('abc123')).toBe('abc123');
  });

  it('keeps the head and tail of long values', () => {
    expect(truncateMiddle('0123456789abcdefghijklmnop')).toBe('0123456789…klmnop');
  });
});
