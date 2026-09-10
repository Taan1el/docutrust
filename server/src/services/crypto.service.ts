import crypto from 'node:crypto';
import type { KeypairBundle, SignatureAlgorithm } from '../../../shared/types.js';

export class CryptoService {
  generateKeyPair(algorithm: SignatureAlgorithm = 'ECDSA_P256_SHA256'): KeypairBundle {
    if (algorithm === 'ECDSA_P256_SHA256') {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1', // P-256 / secp256r1
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const fingerprint = this.computeKeyFingerprint(publicKey);

      return {
        publicKeyPem: publicKey,
        privateKeyPem: privateKey,
        fingerprint,
        algorithm,
      };
    } else {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const fingerprint = this.computeKeyFingerprint(publicKey);

      return {
        publicKeyPem: publicKey,
        privateKeyPem: privateKey,
        fingerprint,
        algorithm,
      };
    }
  }

  canonicalizeContent(content: string): string {
    return content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
  }

  hashDocumentContent(content: string): string {
    const canonical = this.canonicalizeContent(content);
    return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  }

  computeKeyFingerprint(publicKeyPem: string): string {
    // SHA-256 fingerprint formatted as hex
    const cleaned = publicKeyPem.replace(/-----[^\n]+-----/g, '').replace(/\s+/g, '');
    const der = Buffer.from(cleaned, 'base64');
    return crypto.createHash('sha256').update(der).digest('hex').substring(0, 32);
  }

  signHash(contentHash: string, privateKeyPem: string): string {
    const sign = crypto.createSign('SHA256');
    sign.update(contentHash, 'utf8');
    sign.end();
    return sign.sign(privateKeyPem, 'hex');
  }

  verifySignature(contentHash: string, signatureHex: string, publicKeyPem: string): boolean {
    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(contentHash, 'utf8');
      verify.end();
      return verify.verify(publicKeyPem, signatureHex, 'hex');
    } catch {
      return false;
    }
  }
}
