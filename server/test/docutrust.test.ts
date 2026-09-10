import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { CryptoService } from '../src/services/crypto.service.js';

describe('DocuTrust Cryptographic Signing Engine', () => {
  const cryptoService = new CryptoService();

  describe('Asymmetric Key Generation & Fingerprinting', () => {
    it('generates valid ECDSA P-256 keypair with public key fingerprint', () => {
      const bundle = cryptoService.generateKeyPair('ECDSA_P256_SHA256');

      expect(bundle.publicKeyPem).toContain('BEGIN PUBLIC KEY');
      expect(bundle.privateKeyPem).toContain('BEGIN PRIVATE KEY');
      expect(bundle.fingerprint).toHaveLength(32);
      expect(bundle.algorithm).toBe('ECDSA_P256_SHA256');
    });

    it('generates valid RSA 2048 keypair', () => {
      const bundle = cryptoService.generateKeyPair('RSA_PSS_SHA256');

      expect(bundle.publicKeyPem).toContain('BEGIN PUBLIC KEY');
      expect(bundle.privateKeyPem).toContain('BEGIN PRIVATE KEY');
      expect(bundle.algorithm).toBe('RSA_PSS_SHA256');
    });
  });

  describe('Canonical Document Hashing & Avalanche Effect', () => {
    it('normalizes CRLF and LF line endings to identical SHA-256 digest', () => {
      const textCRLF = 'AGREEMENT TITLE\r\n\r\nClause 1: Terms.\r\n';
      const textLF = 'AGREEMENT TITLE\n\nClause 1: Terms.';

      const hash1 = cryptoService.hashDocumentContent(textCRLF);
      const hash2 = cryptoService.hashDocumentContent(textLF);

      expect(hash1).toBe(hash2);
    });

    it('exhibits cryptographic avalanche effect on single character mutation', () => {
      const original = 'Contract payment amount: EUR 50,000.';
      const tampered = 'Contract payment amount: EUR 90,000.';

      const hashOriginal = cryptoService.hashDocumentContent(original);
      const hashTampered = cryptoService.hashDocumentContent(tampered);

      expect(hashOriginal).not.toBe(hashTampered);
    });
  });

  describe('Digital Signature Creation & Mathematical Verification', () => {
    it('successfully signs and verifies a document hash with ECDSA keypair', () => {
      const bundle = cryptoService.generateKeyPair('ECDSA_P256_SHA256');
      const contentHash = cryptoService.hashDocumentContent('Non-Disclosure Agreement confidential terms');

      const signatureHex = cryptoService.signHash(contentHash, bundle.privateKeyPem);
      expect(signatureHex.length).toBeGreaterThan(60);

      const isValid = cryptoService.verifySignature(contentHash, signatureHex, bundle.publicKeyPem);
      expect(isValid).toBe(true);
    });

    it('rejects signature if verified with different public key or altered hash', () => {
      const bundle1 = cryptoService.generateKeyPair('ECDSA_P256_SHA256');
      const bundle2 = cryptoService.generateKeyPair('ECDSA_P256_SHA256');

      const contentHash = cryptoService.hashDocumentContent('Commercial Lease Agreement');
      const signatureHex = cryptoService.signHash(contentHash, bundle1.privateKeyPem);

      // Verify with wrong public key
      expect(cryptoService.verifySignature(contentHash, signatureHex, bundle2.publicKeyPem)).toBe(false);

      // Verify with altered hash
      const alteredHash = cryptoService.hashDocumentContent('Commercial Lease Agreement (Altered)');
      expect(cryptoService.verifySignature(alteredHash, signatureHex, bundle1.publicKeyPem)).toBe(false);
    });
  });

  describe('REST API & Multi-Party Workflow Integration', () => {
    let app: any;

    beforeEach(() => {
      // In-memory isolated database without seeding
      const ctx = createApp(':memory:', false);
      app = ctx.app;
    });

    it('checks service health on /api/health', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('docutrust-engine');
    });

    it('executes complete multi-party signing workflow and verifies signatures', async () => {
      // 1. Create document
      const createRes = await request(app)
        .post('/api/documents')
        .send({
          title: 'Stock Purchase Agreement',
          content: 'The Investor agrees to purchase 10,000 Common Shares.',
          signers: [
            { name: 'Alice Founder', email: 'alice@startup.ee', role: 'CEO' },
            { name: 'Bob Investor', email: 'bob@venture.fi', role: 'Partner' },
          ],
        });

      expect(createRes.status).toBe(201);
      const doc = createRes.body.data;
      expect(doc.status).toBe('PENDING_SIGNATURES');
      expect(doc.signers.length).toBe(2);

      const signer1 = doc.signers[0];
      const signer2 = doc.signers[1];

      // 2. Signer 1 signs
      const signRes1 = await request(app)
        .post(`/api/documents/${doc.id}/sign`)
        .send({ signerId: signer1.id });

      expect(signRes1.status).toBe(200);
      expect(signRes1.body.data.status).toBe('PARTIALLY_SIGNED');
      expect(signRes1.body.data.signers[0].status).toBe('SIGNED');
      expect(signRes1.body.data.signers[0].signatureHex).toBeDefined();

      // 3. Signer 2 signs -> Document completed
      const signRes2 = await request(app)
        .post(`/api/documents/${doc.id}/sign`)
        .send({ signerId: signer2.id });

      expect(signRes2.status).toBe(200);
      expect(signRes2.body.data.status).toBe('COMPLETED');
      expect(signRes2.body.data.completedAt).toBeDefined();

      // 4. Verify document integrity
      const verifyRes = await request(app).get(`/api/documents/${doc.id}/verify`);
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.isValid).toBe(true);
      expect(verifyRes.body.data.isTampered).toBe(false);
      expect(verifyRes.body.data.signerVerifications.length).toBe(2);
      expect(verifyRes.body.data.signerVerifications[0].isSignatureValid).toBe(true);
      expect(verifyRes.body.data.signerVerifications[1].isSignatureValid).toBe(true);
    });

    it('detects unauthorized document tampering and breaks cryptographic verification', async () => {
      // 1. Create and sign document
      const createRes = await request(app)
        .post('/api/documents')
        .send({
          title: 'Promissory Note',
          content: 'Borrower shall repay EUR 10,000 on Dec 31, 2026.',
          signers: [{ name: 'Borrower Name', email: 'borrower@loan.ee', role: 'Borrower' }],
        });

      const docId = createRes.body.data.id;
      const signerId = createRes.body.data.signers[0].id;

      await request(app)
        .post(`/api/documents/${docId}/sign`)
        .send({ signerId });

      // Verify it's initially valid
      const initialVerify = await request(app).get(`/api/documents/${docId}/verify`);
      expect(initialVerify.body.data.isValid).toBe(true);

      // 2. Tamper with the document content maliciously
      const tamperRes = await request(app)
        .post(`/api/documents/${docId}/tamper`)
        .send({ tamperedContent: 'Borrower shall repay EUR 1,000 on Dec 31, 2026.' }); // changed 10,000 to 1,000!

      expect(tamperRes.status).toBe(200);

      // 3. Re-verify document: must detect tampering
      const tamperedVerify = await request(app).get(`/api/documents/${docId}/verify`);
      expect(tamperedVerify.body.data.isValid).toBe(false);
      expect(tamperedVerify.body.data.isTampered).toBe(true);
      expect(tamperedVerify.body.data.signerVerifications[0].isSignatureValid).toBe(false);
      expect(tamperedVerify.body.data.signerVerifications[0].error).toContain('Document hash mismatch');
    });

    it('generates on-demand keypair on /api/crypto/keypair', async () => {
      const res = await request(app).get('/api/crypto/keypair?algo=ECDSA_P256_SHA256');
      expect(res.status).toBe(200);
      expect(res.body.data.publicKeyPem).toBeDefined();
      expect(res.body.data.fingerprint).toBeDefined();
    });
  });
});
