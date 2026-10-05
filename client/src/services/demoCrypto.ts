import { p256Sign, p256Verify, webCrypto as subtle } from '../local/p256.js';

// In-browser cryptography for the GitHub Pages demo, using the Web Crypto
// API instead of node:crypto. It signs with the same algorithm the server
// uses for every signature its own UI produces (ECDSA, NIST P-256 curve,
// SHA-256 digest; see server/src/services/crypto.service.ts and
// docs/adr/002-asymmetric-key-cryptography-and-canonical-document-hashing.md),
// and reuses shared/canonical.ts so the demo hashes a document exactly the
// way the server does. Private keys never leave this module and are never
// written to storage: a signature is produced once, then the key is dropped.

function bufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Wraps base64-encoded DER bytes in PEM headers, matching node:crypto's PEM output. */
function toPem(base64: string, label: string): string {
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

/** Strips PEM headers and whitespace, returning the raw DER bytes underneath. */
function pemToDer(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return base64ToBuffer(base64);
}

export interface DemoKeyPair {
  publicKeyPem: string;
  privateKey: CryptoKey;
  fingerprint: string;
}

/**
 * SHA-256 fingerprint of the public key's DER bytes, hex-truncated to 32
 * characters, the same computation as the server's
 * CryptoService.computeKeyFingerprint, just over Web Crypto's exported key
 * bytes instead of a decoded PEM string.
 */
async function fingerprintOf(derBytes: ArrayBuffer): Promise<string> {
  const digest = await subtle().digest('SHA-256', derBytes);
  return bufferToHex(digest).substring(0, 32);
}

/** Generates a fresh ECDSA P-256 keypair for one signature, PEM-encoded like the server's. */
export async function generateKeyPair(): Promise<DemoKeyPair> {
  const { publicKey, privateKey } = await subtle().generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify']
  );
  const spki = await subtle().exportKey('spki', publicKey);
  const publicKeyPem = toPem(bufferToBase64(spki), 'PUBLIC KEY');
  const fingerprint = await fingerprintOf(spki);
  return { publicKeyPem, privateKey, fingerprint };
}

/** SHA-256 of the canonical title+content pair, exactly as shared/canonical.ts defines it. */
export async function hashDocument(canonicalInput: string): Promise<string> {
  const digest = await subtle().digest('SHA-256', new TextEncoder().encode(canonicalInput));
  return bufferToHex(digest);
}

/** Signs a hex content hash with an ECDSA private key. The key is used once and discarded by the caller. */
export async function signHash(contentHash: string, privateKey: CryptoKey): Promise<string> {
  const signature = await p256Sign(privateKey, new TextEncoder().encode(contentHash));
  return bufferToHex(signature);
}

/** Verifies an ECDSA signature against a hex content hash and a PEM-encoded SPKI public key. */
export async function verifySignature(
  contentHash: string,
  signatureHex: string,
  publicKeyPem: string
): Promise<boolean> {
  try {
    const publicKey = await subtle().importKey(
      'spki',
      pemToDer(publicKeyPem),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const signatureBytes = Uint8Array.from(signatureHex.match(/.{2}/g)?.map((b) => parseInt(b, 16)) ?? []);
    return await p256Verify(
      publicKey,
      signatureBytes,
      new TextEncoder().encode(contentHash)
    );
  } catch {
    return false;
  }
}

/** SHA-256 fingerprint of a PEM-encoded public key, for signers whose key was loaded from storage. */
export async function fingerprintOfPem(publicKeyPem: string): Promise<string> {
  return fingerprintOf(pemToDer(publicKeyPem));
}
