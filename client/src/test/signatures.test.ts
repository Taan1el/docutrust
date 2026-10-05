import { Blob as NativeBlob, File as NativeFile } from 'node:buffer';
import { createHash, createPublicKey, verify, webcrypto, type JsonWebKey as NativeJsonWebKey } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createIdentity,
  hashFile,
  MAX_BUNDLE_BYTES,
  parseBundle,
  serializeBundle,
  signFile,
  validatePublicKeyJwk,
  verifyFile,
  type SignatureBundle,
  type SigningIdentity,
} from '../local/signatures.js';
import { generateKeyPair, signHash, verifySignature } from '../services/demoCrypto.js';

// Fixed public-only verification vector. Signing tests generate temporary keys.
const publicKeyJwk: JsonWebKey = {
  kty: 'EC', crv: 'P-256',
  x: 'axfR8uEsQkf4vOblY6RA8ncDfYEt6zOg9KE5RdiYwpY',
  y: 'T-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU',
  ext: true, key_ops: ['verify'],
};
const fixedBytes = new Uint8Array([0, 255, 1, 128, 10]);
const fixedBundle: SignatureBundle = {
  version: 1,
  algorithm: 'ECDSA-P256-SHA256',
  file: { name: 'fixed-vector.bin', size: 5, sha256: '6d1dc71fb8c1d9f7786ddddd833d3f60835dd60e3b86b652e4458f780c6532f6' },
  signatures: [{
    signer: 'Vector Signer', signedAt: '2026-10-04T12:34:56.000Z', publicKeyJwk,
    signature: '1ScYhf5zwaulVvugwcVZz1i2jvZXzWv2kEzy6092+C9AmAm7haOm5OJS1FtGdkofcD2Zke71lPgr+4vYRqLo3Q==',
  }],
};
const fixedPayloadDigest = 'e1300fc6eb95263340a883a35c07cd34d07c9add13f581088a18cdb918c01b7c';

function file(contents: string | Uint8Array = fixedBytes, name = fixedBundle.file.name): File {
  return new NativeFile([contents], name) as unknown as File;
}

function clone(): SignatureBundle {
  return structuredClone(fixedBundle);
}

function generatedIdentity(): Promise<SigningIdentity> {
  return createIdentity('Vector Signer');
}

beforeAll(() => { vi.stubGlobal('crypto', webcrypto); });
afterAll(() => { vi.unstubAllGlobals(); });

describe('file hashing and identity keys', () => {
  it('hashes the exact binary bytes without text conversion', async () => {
    expect(await hashFile(file())).toBe(fixedBundle.file.sha256);
    expect(await hashFile(new NativeBlob([fixedBytes]) as unknown as Blob)).toBe(fixedBundle.file.sha256);
  });

  it('hashes a zero-byte file and signs it', async () => {
    const empty = file('', 'empty.bin');
    expect(await hashFile(empty)).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    const bundle = await signFile(empty, await generatedIdentity());
    expect(bundle.file.size).toBe(0);
    expect(await verifyFile(empty, bundle)).toMatchObject({ matchesFile: true, signatures: [{ valid: true }] });
  });

  it('reads files through FileReader when arrayBuffer is unavailable', async () => {
    const browserFile = new File([fixedBytes], fixedBundle.file.name);
    expect(await hashFile(browserFile)).toBe(fixedBundle.file.sha256);
  });

  it('creates a P-256 identity with a non-extractable private key and public-only JWK', async () => {
    const identity = await createIdentity('  Alice  ');
    expect(identity.name).toBe('Alice');
    expect(identity.privateKey.type).toBe('private');
    expect(identity.privateKey.extractable).toBe(false);
    expect(identity.privateKey.algorithm).toEqual({ name: 'ECDSA', namedCurve: 'P-256' });
    expect(identity.privateKey.usages).toEqual(['sign']);
    expect(identity.publicKeyJwk).not.toHaveProperty('d');
    expect(identity.publicKeyJwk.key_ops).toEqual(['verify']);
    expect(new Date(identity.createdAt).toISOString()).toBe(identity.createdAt);
    await expect(crypto.subtle.exportKey('jwk', identity.privateKey)).rejects.toThrow();
    await expect(crypto.subtle.exportKey('pkcs8', identity.privateKey)).rejects.toThrow();
  });

  it.each(['', '   ', 'A\nB', 'A'.repeat(201)])('rejects an invalid identity name %j', async (name) => {
    await expect(createIdentity(name)).rejects.toThrow('Signing identity: name');
  });

  it('reports unavailable Web Crypto clearly', async () => {
    vi.stubGlobal('crypto', {});
    try {
      await expect(hashFile(file())).rejects.toThrow('Web Crypto is unavailable');
      await expect(createIdentity('Alice')).rejects.toThrow('Web Crypto is unavailable');
    } finally {
      vi.stubGlobal('crypto', webcrypto);
    }
  });
});

describe('fixed interoperability vectors', () => {
  it('verifies a stored P1363 vector using only the public key and selected file', async () => {
    const bundle = parseBundle(JSON.stringify(fixedBundle), 'vector.json');
    expect(await verifyFile(file(), bundle)).toEqual({
      matchesFile: true,
      signatures: [{ signer: 'Vector Signer', signedAt: '2026-10-04T12:34:56.000Z', valid: true }],
    });
    expect(verify('sha256', Buffer.from(fixedPayloadDigest, 'hex'), {
      key: createPublicKey({ key: publicKeyJwk as NativeJsonWebKey, format: 'jwk' }), dsaEncoding: 'ieee-p1363',
    }, Buffer.from(bundle.signatures[0].signature, 'base64'))).toBe(true);
  });

  it('signs digest bytes matching an independent native canonical payload oracle', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T12:34:56.000Z'));
    try {
      const identity = await generatedIdentity();
      const bundle = await signFile(file(), identity);
      const signatureBytes = Buffer.from(bundle.signatures[0].signature, 'base64');
      const key = createPublicKey({ key: identity.publicKeyJwk as NativeJsonWebKey, format: 'jwk' });
      // Explicit protocol key order is independent of the production canonicalizer.
      const jwk = identity.publicKeyJwk;
      const payload = JSON.stringify({
        algorithm: 'ECDSA-P256-SHA256',
        file: { name: 'fixed-vector.bin', sha256: fixedBundle.file.sha256, size: 5 },
        publicKeyJwk: { crv: jwk.crv, ext: jwk.ext, key_ops: jwk.key_ops, kty: jwk.kty, x: jwk.x, y: jwk.y },
        signedAt: '2026-10-04T12:34:56.000Z', signer: 'Vector Signer', version: 1,
      });
      const digest = createHash('sha256').update(payload, 'utf8').digest();
      expect(verify('sha256', digest, { key, dsaEncoding: 'ieee-p1363' }, signatureBytes)).toBe(true);
      // Signing the file hash directly would leave the signer metadata unbound.
      expect(verify('sha256', Buffer.from(bundle.file.sha256, 'hex'), { key, dsaEncoding: 'ieee-p1363' }, signatureBytes)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not depend on JSON object insertion order', async () => {
    const bundle = clone();
    bundle.file = { sha256: bundle.file.sha256, size: bundle.file.size, name: bundle.file.name };
    bundle.signatures[0].publicKeyJwk = { key_ops: ['verify'], y: publicKeyJwk.y, x: publicKeyJwk.x, ext: true, crv: 'P-256', kty: 'EC' };
    expect((await verifyFile(file(), bundle)).signatures[0].valid).toBe(true);
  });

  it('exports and parses a public bundle without any private key', async () => {
    const text = serializeBundle(fixedBundle);
    expect(parseBundle(text, 'download.json')).toEqual(fixedBundle);
    expect(JSON.parse(text).signatures[0].publicKeyJwk).not.toHaveProperty('d');
    expect(text.endsWith('\n')).toBe(true);
  });
});

describe('sample agreements share the P-256 primitive', () => {
  it('keeps legacy UTF-8 hex payload compatibility with a non-extractable temporary key', async () => {
    const identity = await generateKeyPair();
    expect(identity.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('jwk', identity.privateKey)).rejects.toThrow();
    const signature = await signHash(fixedBundle.file.sha256, identity.privateKey);
    expect(await verifySignature(fixedBundle.file.sha256, signature, identity.publicKeyPem)).toBe(true);
    expect(verify('sha256', Buffer.from(fixedBundle.file.sha256, 'utf8'), {
      key: createPublicKey(identity.publicKeyPem), dsaEncoding: 'ieee-p1363',
    }, Buffer.from(signature, 'hex'))).toBe(true);
    expect(await verifySignature('0'.repeat(64), signature, identity.publicKeyPem)).toBe(false);
  });
});

describe('file matching and bound metadata', () => {
  it('rejects different bytes even when the filename and size are unchanged', async () => {
    const changed = new Uint8Array(fixedBytes);
    changed[1] = 254;
    const result = await verifyFile(file(changed), fixedBundle);
    expect(result.matchesFile).toBe(false);
    expect(result.signatures[0].valid).toBe(true);
  });

  it('rejects a selected file with a different size', async () => {
    expect((await verifyFile(file(new Uint8Array([0])), fixedBundle)).matchesFile).toBe(false);
  });

  it('requires the signed filename for Files while Blobs match bytes and size', async () => {
    expect((await verifyFile(file(fixedBytes, 'renamed.bin'), fixedBundle)).matchesFile).toBe(false);
    expect((await verifyFile(new NativeBlob([fixedBytes]) as unknown as Blob, fixedBundle)).matchesFile).toBe(true);
  });

  const mutations: [string, (bundle: SignatureBundle) => void][] = [
    ['file name', (bundle) => { bundle.file.name = 'renamed.bin'; }],
    ['file size', (bundle) => { bundle.file.size = 6; }],
    ['file hash', (bundle) => { bundle.file.sha256 = '0'.repeat(64); }],
    ['signer label', (bundle) => { bundle.signatures[0].signer = 'Forged Signer'; }],
    ['timestamp', (bundle) => { bundle.signatures[0].signedAt = '2026-10-04T12:34:57.000Z'; }],
    ['public key metadata', (bundle) => { bundle.signatures[0].publicKeyJwk.ext = false; }],
    ['optional public key algorithm', (bundle) => { bundle.signatures[0].publicKeyJwk.alg = 'ES256'; }],
    ['optional public key usage', (bundle) => { bundle.signatures[0].publicKeyJwk.use = 'sig'; }],
    ['optional public key identifier', (bundle) => { Object.assign(bundle.signatures[0].publicKeyJwk, { kid: 'changed' }); }],
    ['public key operation metadata', (bundle) => { delete bundle.signatures[0].publicKeyJwk.key_ops; }],
    ['signature bytes', (bundle) => { const bytes = Buffer.from(bundle.signatures[0].signature, 'base64'); bytes[0] ^= 1; bundle.signatures[0].signature = bytes.toString('base64'); }],
  ];
  it.each(mutations)('detects forged %s', async (_name, mutate) => {
    const bundle = clone();
    mutate(bundle);
    const result = await verifyFile(file(), bundle);
    expect(result.signatures[0].valid).toBe(false);
    expect(result.signatures[0].error).toMatch(/does not authenticate/);
  });

  it('detects bundle metadata rewritten to match substituted file bytes', async () => {
    const substitute = file('replacement');
    const bundle = clone();
    bundle.file = { name: substitute.name, size: substitute.size, sha256: await hashFile(substitute) };
    const result = await verifyFile(substitute, bundle);
    expect(result.matchesFile).toBe(true);
    expect(result.signatures[0].valid).toBe(false);
  });

  it('reports invalid public curve points per signer without losing other results', async () => {
    const bundle = clone();
    const badRecord = structuredClone(bundle.signatures[0]);
    badRecord.signer = 'Invalid point';
    badRecord.publicKeyJwk.x = 'A'.repeat(43);
    badRecord.publicKeyJwk.y = 'A'.repeat(43);
    bundle.signatures.push(badRecord);
    const result = await verifyFile(file(), parseBundle(JSON.stringify(bundle), 'points.json'));
    expect(result.signatures[0].valid).toBe(true);
    expect(result.signatures[1]).toMatchObject({ valid: false, error: 'The public key is not a valid P-256 point.' });
  });

  it('reports directly supplied malformed records per signer', async () => {
    const bundle = clone();
    bundle.signatures[0].signature = 'invalid';
    const result = await verifyFile(file(), bundle);
    expect(result.matchesFile).toBe(true);
    expect(result.signatures[0]).toMatchObject({ valid: false, error: expect.stringContaining('signatures[0].signature') });
  });

  it('does not use a replacement public key to accept an old signature', async () => {
    const identity = await createIdentity('Bob');
    const bundle = clone();
    bundle.signatures[0].publicKeyJwk = identity.publicKeyJwk;
    expect((await verifyFile(file(), bundle)).signatures[0].valid).toBe(false);
  });
});

describe('multiple parties', () => {
  it('appends a second signature while retaining and verifying the first record', async () => {
    const initial = clone();
    const second = await signFile(file(), await createIdentity('Bob'), initial);
    expect(initial).toEqual(fixedBundle);
    expect(second.signatures).toHaveLength(2);
    expect(second.signatures[0]).toEqual(fixedBundle.signatures[0]);
    expect(second.signatures[1].signer).toBe('Bob');
    expect(await verifyFile(file(), parseBundle(serializeBundle(second), 'two-signers.json'))).toMatchObject({
      matchesFile: true, signatures: [{ valid: true }, { valid: true }],
    });
  });

  it('keeps a dense maximum-signature bundle within the import and export limits after appending', async () => {
    const identity = await createIdentity('界'.repeat(200));
    Object.assign(identity.publicKeyJwk, { kid: '界'.repeat(200) });
    const selected = file(fixedBytes, '界'.repeat(1024));
    const initial = await signFile(selected, identity);
    const dense: SignatureBundle = { ...initial, signatures: Array.from({ length: 999 }, () => structuredClone(initial.signatures[0])) };
    const completed = await signFile(selected, identity, dense);
    const text = serializeBundle(completed);
    const byteLength = new TextEncoder().encode(text).byteLength;
    expect(byteLength).toBeGreaterThan(MAX_BUNDLE_BYTES * 0.7);
    expect(byteLength).toBeLessThanOrEqual(MAX_BUNDLE_BYTES);
    expect(parseBundle(text, 'dense.signatures.json').signatures).toHaveLength(1000);
    expect(completed.signatures[0]).toEqual(initial.signatures[0]);
    expect(completed.signatures[999].signer).toBe(identity.name);
  });

  it('rejects an append for the wrong file or filename', async () => {
    const identity = await generatedIdentity();
    await expect(signFile(file('wrong'), identity, fixedBundle)).rejects.toThrow('does not match the existing bundle');
    await expect(signFile(file(fixedBytes, 'renamed.bin'), identity, fixedBundle)).rejects.toThrow('does not match the existing bundle');
  });

  it('rejects an append when an existing signature is invalid', async () => {
    const bundle = clone();
    bundle.signatures[0].signer = 'Forged Signer';
    await expect(signFile(file(), await generatedIdentity(), bundle)).rejects.toThrow('existing bundle contains an invalid signature');
  });

  it('rejects a mismatched private and public identity key', async () => {
    const identity = await generatedIdentity();
    identity.publicKeyJwk = (await createIdentity('Bob')).publicKeyJwk;
    await expect(signFile(file(), identity)).rejects.toThrow('private key does not match the public key');
  });

  it('rejects extractable private identity keys', async () => {
    const identity = await generatedIdentity();
    identity.privateKey = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])).privateKey;
    await expect(signFile(file(), identity)).rejects.toThrow('must be a non-extractable ECDSA P-256 signing key');
  });

  it('rejects identity keys from another curve', async () => {
    const identity = await generatedIdentity();
    identity.privateKey = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-384' }, false, ['sign', 'verify'])).privateKey;
    await expect(signFile(file(), identity)).rejects.toThrow('must be a non-extractable ECDSA P-256 signing key');
  });
});

describe('strict bundle parsing', () => {
  it('rejects oversized bundle text before parsing with its source filename', () => {
    expect(() => parseBundle(' '.repeat(MAX_BUNDLE_BYTES + 1), 'large.json')).toThrow('large.json: JSON must be no larger than 2 MiB.');
  });

  it('applies the bundle limit to UTF-8 bytes rather than character count', () => {
    const text = 'é'.repeat(MAX_BUNDLE_BYTES / 2 + 1);
    expect(text.length).toBeLessThan(MAX_BUNDLE_BYTES);
    expect(() => parseBundle(text, 'large-unicode.json')).toThrow('large-unicode.json: JSON must be no larger than 2 MiB.');
  });

  it('allows a valid bundle at the byte limit', () => {
    const text = JSON.stringify(fixedBundle);
    expect(parseBundle(text.padEnd(MAX_BUNDLE_BYTES, ' '), 'limit.json')).toEqual(fixedBundle);
  });

  const malformed: [string, string, (value: Record<string, any>) => void][] = [
    ['unknown version', 'version', (value) => { value.version = 2; }],
    ['wrong algorithm', 'algorithm', (value) => { value.algorithm = 'ECDSA-P384-SHA384'; }],
    ['extra bundle field', 'bundle.extra', (value) => { value.extra = true; }],
    ['missing file', 'file', (value) => { delete value.file; }],
    ['extra file field', 'file.extra', (value) => { value.file.extra = true; }],
    ['blank file name', 'file.name', (value) => { value.file.name = ' '; }],
    ['control character in file name', 'file.name', (value) => { value.file.name = 'a\0b'; }],
    ['too long file name', 'file.name', (value) => { value.file.name = 'a'.repeat(1025); }],
    ['negative file size', 'file.size', (value) => { value.file.size = -1; }],
    ['fractional file size', 'file.size', (value) => { value.file.size = 1.5; }],
    ['unsafe file size', 'file.size', (value) => { value.file.size = Number.MAX_SAFE_INTEGER + 1; }],
    ['string file size', 'file.size', (value) => { value.file.size = '5'; }],
    ['uppercase hash', 'file.sha256', (value) => { value.file.sha256 = 'A'.repeat(64); }],
    ['invalid hash length', 'file.sha256', (value) => { value.file.sha256 = 'a'.repeat(63); }],
    ['no signatures', 'signatures', (value) => { value.signatures = []; }],
    ['non-array signatures', 'signatures', (value) => { value.signatures = {}; }],
    ['too many signatures', 'signatures', (value) => { value.signatures = Array(1001).fill(value.signatures[0]); }],
    ['non-object signature', 'signatures[0]', (value) => { value.signatures[0] = null; }],
    ['extra signature field', 'signatures[0].extra', (value) => { value.signatures[0].extra = true; }],
    ['missing signer', 'signatures[0].signer', (value) => { delete value.signatures[0].signer; }],
    ['blank signer', 'signatures[0].signer', (value) => { value.signatures[0].signer = ' '; }],
    ['control character in signer', 'signatures[0].signer', (value) => { value.signatures[0].signer = 'a\nb'; }],
    ['non-UTC timestamp', 'signatures[0].signedAt', (value) => { value.signatures[0].signedAt = '2026-10-04T12:34:56+03:00'; }],
    ['invalid calendar date', 'signatures[0].signedAt', (value) => { value.signatures[0].signedAt = '2026-02-30T12:34:56.000Z'; }],
    ['early timestamp', 'signatures[0].signedAt', (value) => { value.signatures[0].signedAt = '1969-12-31T12:34:56.000Z'; }],
    ['missing public key', 'signatures[0].publicKeyJwk', (value) => { delete value.signatures[0].publicKeyJwk; }],
    ['private JWK field', 'signatures[0].publicKeyJwk.d', (value) => { value.signatures[0].publicKeyJwk.d = true; }],
    ['wrong JWK type', 'signatures[0].publicKeyJwk.kty', (value) => { value.signatures[0].publicKeyJwk.kty = 'RSA'; }],
    ['wrong curve', 'signatures[0].publicKeyJwk.crv', (value) => { value.signatures[0].publicKeyJwk.crv = 'P-384'; }],
    ['invalid X coordinate', 'signatures[0].publicKeyJwk.x', (value) => { value.signatures[0].publicKeyJwk.x = '!'.repeat(43); }],
    ['short Y coordinate', 'signatures[0].publicKeyJwk.y', (value) => { value.signatures[0].publicKeyJwk.y = 'A'; }],
    ['noncanonical coordinate padding bits', 'signatures[0].publicKeyJwk.x', (value) => { value.signatures[0].publicKeyJwk.x = 'A'.repeat(42) + 'B'; }],
    ['wrong JWK operation', 'signatures[0].publicKeyJwk.key_ops', (value) => { value.signatures[0].publicKeyJwk.key_ops = ['sign']; }],
    ['duplicate JWK operations', 'signatures[0].publicKeyJwk.key_ops', (value) => { value.signatures[0].publicKeyJwk.key_ops = ['verify', 'verify']; }],
    ['wrong JWK ext type', 'signatures[0].publicKeyJwk.ext', (value) => { value.signatures[0].publicKeyJwk.ext = 'true'; }],
    ['wrong JWK algorithm', 'signatures[0].publicKeyJwk.alg', (value) => { value.signatures[0].publicKeyJwk.alg = 'ES384'; }],
    ['wrong JWK use', 'signatures[0].publicKeyJwk.use', (value) => { value.signatures[0].publicKeyJwk.use = 'enc'; }],
    ['invalid JWK identifier', 'signatures[0].publicKeyJwk.kid', (value) => { value.signatures[0].publicKeyJwk.kid = ''; }],
    ['extra JWK field', 'signatures[0].publicKeyJwk.extra', (value) => { value.signatures[0].publicKeyJwk.extra = true; }],
    ['invalid signature base64', 'signatures[0].signature', (value) => { value.signatures[0].signature = 'bad*'; }],
    ['signature whitespace', 'signatures[0].signature', (value) => { value.signatures[0].signature += '\n'; }],
    ['wrong signature length', 'signatures[0].signature', (value) => { value.signatures[0].signature = btoa('short'); }],
    ['noncanonical signature padding bits', 'signatures[0].signature', (value) => { value.signatures[0].signature = 'A'.repeat(85) + 'B=='; }],
  ];
  it.each(malformed)('reports filename and field for %s', (_name, field, mutate) => {
    const value = clone();
    mutate(value);
    expect(() => parseBundle(JSON.stringify(value), 'broken.signature.json')).toThrow(`broken.signature.json: ${field}`);
  });

  it.each(['not json', '', '{', 'null', '[]', '42'])('rejects invalid JSON or root %j with the source filename', (text) => {
    expect(() => parseBundle(text, 'broken.json')).toThrow('broken.json:');
  });

  it('clones the validated public JWK and accepts a minimal compatible public key', () => {
    const key = { kty: 'EC', crv: 'P-256', x: publicKeyJwk.x, y: publicKeyJwk.y };
    expect(validatePublicKeyJwk(key)).toEqual(key);
    expect(validatePublicKeyJwk(key)).not.toBe(key);
  });

  it('matches the binary fixture SHA-256 with the independent native hash', () => {
    expect(createHash('sha256').update(fixedBytes).digest('hex')).toBe(fixedBundle.file.sha256);
  });
});
