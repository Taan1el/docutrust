import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { CryptoService } from '../../../server/src/services/crypto.service.js';
import { buildDocumentDigestInput } from '../../../shared/canonical.js';
import {
  fingerprintOfPem,
  generateKeyPair,
  hashDocument,
  signHash,
  verifySignature,
} from './demoCrypto.js';

const cryptoService = new CryptoService();

// The demo has to hash and fingerprint exactly like the server (see
// docs/adr/002), even though it uses Web Crypto instead of node:crypto, or a
// document signed in the demo would not mean the same thing as one signed
// by the API.
describe('Web Crypto demo signing matches the server algorithm', () => {
  it('hashes a document exactly like the server: same canonicalization, same SHA-256 digest', async () => {
    const title = 'Master Services Agreement';
    const content = 'Body text.\r\nSecond line.\r\n';

    const serverHash = cryptoService.hashDocument(title, content);
    const demoHash = await hashDocument(buildDocumentDigestInput(title, content));

    expect(demoHash).toBe(serverHash);
  });

  it('fingerprints a server-generated public key the same way the server does', async () => {
    const { publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const serverFingerprint = cryptoService.computeKeyFingerprint(publicKey);
    const demoFingerprint = await fingerprintOfPem(publicKey);

    expect(demoFingerprint).toBe(serverFingerprint);
    expect(demoFingerprint).toHaveLength(32);
  });

  it('signs and verifies a document hash with an in-browser ECDSA P-256 keypair', async () => {
    const keyPair = await generateKeyPair();
    const contentHash = await hashDocument(buildDocumentDigestInput('NDA', 'Confidential terms'));

    const signatureHex = await signHash(contentHash, keyPair.privateKey);

    expect(await verifySignature(contentHash, signatureHex, keyPair.publicKeyPem)).toBe(true);
  });

  it('rejects a signature checked against a hash recomputed from tampered content', async () => {
    const keyPair = await generateKeyPair();
    const contentHash = await hashDocument(buildDocumentDigestInput('Lease', 'Original rent: EUR 900/month'));
    const signatureHex = await signHash(contentHash, keyPair.privateKey);

    const tamperedHash = await hashDocument(buildDocumentDigestInput('Lease', 'Original rent: EUR 90/month'));

    expect(await verifySignature(tamperedHash, signatureHex, keyPair.publicKeyPem)).toBe(false);
  });

  it('rejects a signature checked against the wrong public key', async () => {
    const keyPairA = await generateKeyPair();
    const keyPairB = await generateKeyPair();
    const contentHash = await hashDocument(buildDocumentDigestInput('Lease', 'Terms'));
    const signatureHex = await signHash(contentHash, keyPairA.privateKey);

    expect(await verifySignature(contentHash, signatureHex, keyPairB.publicKeyPem)).toBe(false);
  });

  it('rejects a malformed signature instead of throwing', async () => {
    const keyPair = await generateKeyPair();
    const contentHash = await hashDocument(buildDocumentDigestInput('Lease', 'Terms'));

    expect(await verifySignature(contentHash, 'not-hex-at-all', keyPair.publicKeyPem)).toBe(false);
  });
});
