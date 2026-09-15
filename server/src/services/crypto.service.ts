import crypto from 'node:crypto';
import type { KeypairBundle, SignatureAlgorithm } from '../../../shared/types.js';
import { buildDocumentDigestInput } from '../../../shared/canonical.js';

/**
 * Reads the key type (`'ec'` or `'rsa'`) directly off the PEM instead of
 * trusting a caller-supplied algorithm label, so signing and verification
 * always use the padding the key actually requires.
 */
function asymmetricKeyType(pem: string): string | undefined {
  try {
    return crypto.createPrivateKey(pem).asymmetricKeyType;
  } catch {
    try {
      return crypto.createPublicKey(pem).asymmetricKeyType;
    } catch {
      return undefined;
    }
  }
}

export class CryptoService {
  generateKeyPair(algorithm: SignatureAlgorithm = 'ECDSA_P256_SHA256'): KeypairBundle {
    if (algorithm === 'ECDSA_P256_SHA256') {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1', // P-256 / secp256r1
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      return {
        publicKeyPem: publicKey,
        privateKeyPem: privateKey,
        fingerprint: this.computeKeyFingerprint(publicKey),
        algorithm,
      };
    }

    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    return {
      publicKeyPem: publicKey,
      privateKeyPem: privateKey,
      fingerprint: this.computeKeyFingerprint(publicKey),
      algorithm,
    };
  }

  /**
   * Hashes title and content together (see shared/canonical.ts) so that
   * altering either field after signing changes the digest, not just edits
   * to the body text.
   */
  hashDocument(title: string, content: string): string {
    const canonical = buildDocumentDigestInput(title, content);
    return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  }

  computeKeyFingerprint(publicKeyPem: string): string {
    // SHA-256 fingerprint formatted as hex
    const cleaned = publicKeyPem.replace(/-----[^\n]+-----/g, '').replace(/\s+/g, '');
    const der = Buffer.from(cleaned, 'base64');
    return crypto.createHash('sha256').update(der).digest('hex').substring(0, 32);
  }

  /**
   * Signs a document hash. EC keys sign directly; RSA keys use RSA-PSS
   * (rather than the createSign/createVerify default of PKCS#1 v1.5) so the
   * "RSA-PSS" the app documents is the padding actually used.
   */
  signHash(contentHash: string, privateKeyPem: string): string {
    const sign = crypto.createSign('SHA256');
    sign.update(contentHash, 'utf8');
    sign.end();

    if (asymmetricKeyType(privateKeyPem) === 'rsa') {
      return sign.sign(
        {
          key: privateKeyPem,
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
        },
        'hex'
      );
    }
    return sign.sign(privateKeyPem, 'hex');
  }

  verifySignature(contentHash: string, signatureHex: string, publicKeyPem: string): boolean {
    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(contentHash, 'utf8');
      verify.end();

      if (asymmetricKeyType(publicKeyPem) === 'rsa') {
        return verify.verify(
          {
            key: publicKeyPem,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
          },
          signatureHex,
          'hex'
        );
      }
      return verify.verify(publicKeyPem, signatureHex, 'hex');
    } catch {
      return false;
    }
  }
}
