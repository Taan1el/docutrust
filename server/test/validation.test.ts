import { describe, it, expect } from 'vitest';
import { DocuTrustError } from '../../shared/errors.js';
import { buildDocumentDigestInput, canonicalizeText } from '../../shared/canonical.js';
import {
  MAX_SIGNERS,
  MAX_TITLE_LENGTH,
  parseCreateDocumentPayload,
  parseSignPayload,
  parseTamperPayload,
} from '../../shared/validation.js';

const signer = { name: 'Mari Kask', email: 'mari@example.ee', role: 'Director' };

function badRequestMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(DocuTrustError);
    expect((err as DocuTrustError).status).toBe(400);
    return (err as DocuTrustError).message;
  }
  throw new Error('expected a validation error');
}

describe('shared validation', () => {
  it('trims the title and accepts a minimal valid document', () => {
    const parsed = parseCreateDocumentPayload({ title: '  NDA  ', content: 'Terms', signers: [signer] });
    expect(parsed.title).toBe('NDA');
    expect(parsed.signers).toHaveLength(1);
  });

  it('rejects a body that is not a JSON object', () => {
    expect(badRequestMessage(() => parseCreateDocumentPayload(['x']))).toMatch(/JSON object/);
    expect(badRequestMessage(() => parseCreateDocumentPayload(null))).toMatch(/JSON object/);
  });

  it('rejects a title over the length limit', () => {
    const title = 'a'.repeat(MAX_TITLE_LENGTH + 1);
    expect(badRequestMessage(() => parseCreateDocumentPayload({ title, content: 'x', signers: [signer] }))).toMatch(
      /title/i
    );
  });

  it('rejects more signers than the limit', () => {
    const signers = Array.from({ length: MAX_SIGNERS + 1 }, (_, i) => ({ ...signer, email: `s${i}@example.ee` }));
    expect(badRequestMessage(() => parseCreateDocumentPayload({ title: 'T', content: 'C', signers }))).toMatch(
      /signer/i
    );
  });

  it('requires a signerId when signing and ignores non-string key material', () => {
    expect(badRequestMessage(() => parseSignPayload({}))).toMatch(/signerId/);
    expect(parseSignPayload({ signerId: 'sig_1' }).signerId).toBe('sig_1');
  });

  it('requires at least one tamper field and keeps only the ones that were sent', () => {
    expect(badRequestMessage(() => parseTamperPayload({}))).toMatch(/tamperedTitle/);
    expect(parseTamperPayload({ tamperedTitle: ' New ' })).toEqual({ tamperedTitle: 'New' });
  });
});

describe('canonical digest input', () => {
  it('normalizes line endings and surrounding whitespace', () => {
    expect(canonicalizeText('  a\r\nb\rc \n')).toBe('a\nb\nc');
  });

  it('keeps the title and content boundary unambiguous', () => {
    expect(buildDocumentDigestInput('AB', 'C')).not.toBe(buildDocumentDigestInput('A', 'BC'));
  });
});
