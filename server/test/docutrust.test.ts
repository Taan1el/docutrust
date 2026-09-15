import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { CryptoService } from '../src/services/crypto.service.js';

describe('CryptoService', () => {
  const cryptoService = new CryptoService();

  describe('key generation and fingerprinting', () => {
    it('generates a valid ECDSA P-256 keypair with a public key fingerprint', () => {
      const bundle = cryptoService.generateKeyPair('ECDSA_P256_SHA256');

      expect(bundle.publicKeyPem).toContain('BEGIN PUBLIC KEY');
      expect(bundle.privateKeyPem).toContain('BEGIN PRIVATE KEY');
      expect(bundle.fingerprint).toHaveLength(32);
      expect(bundle.algorithm).toBe('ECDSA_P256_SHA256');
    });

    it('generates a valid RSA 2048 keypair', () => {
      const bundle = cryptoService.generateKeyPair('RSA_PSS_SHA256');

      expect(bundle.publicKeyPem).toContain('BEGIN PUBLIC KEY');
      expect(bundle.privateKeyPem).toContain('BEGIN PRIVATE KEY');
      expect(bundle.algorithm).toBe('RSA_PSS_SHA256');
    });
  });

  describe('canonical hashing', () => {
    it('normalizes CRLF and LF line endings to an identical digest', () => {
      const titleCRLF = 'AGREEMENT TITLE';
      const textCRLF = 'AGREEMENT TITLE\r\n\r\nClause 1: Terms.\r\n';
      const textLF = 'AGREEMENT TITLE\n\nClause 1: Terms.';

      const hash1 = cryptoService.hashDocument(titleCRLF, textCRLF);
      const hash2 = cryptoService.hashDocument(titleCRLF, textLF);

      expect(hash1).toBe(hash2);
    });

    it('changes the digest on a single character mutation in the content', () => {
      const original = cryptoService.hashDocument('Loan Agreement', 'Contract payment amount: EUR 50,000.');
      const tampered = cryptoService.hashDocument('Loan Agreement', 'Contract payment amount: EUR 90,000.');

      expect(original).not.toBe(tampered);
    });

    it('changes the digest when only the title changes, so title tampering is also detected', () => {
      const original = cryptoService.hashDocument('Master Services Agreement', 'Same body text.');
      const retitled = cryptoService.hashDocument('Amended Services Agreement', 'Same body text.');

      expect(original).not.toBe(retitled);
    });
  });

  describe('signing and verification', () => {
    it('signs and verifies a document hash with an ECDSA keypair', () => {
      const bundle = cryptoService.generateKeyPair('ECDSA_P256_SHA256');
      const contentHash = cryptoService.hashDocument('NDA', 'Confidential terms');

      const signatureHex = cryptoService.signHash(contentHash, bundle.privateKeyPem);
      expect(signatureHex.length).toBeGreaterThan(60);
      expect(cryptoService.verifySignature(contentHash, signatureHex, bundle.publicKeyPem)).toBe(true);
    });

    it('signs and verifies a document hash with an RSA-PSS keypair', () => {
      const bundle = cryptoService.generateKeyPair('RSA_PSS_SHA256');
      const contentHash = cryptoService.hashDocument('MSA', 'Enterprise terms');

      const signatureHex = cryptoService.signHash(contentHash, bundle.privateKeyPem);
      expect(cryptoService.verifySignature(contentHash, signatureHex, bundle.publicKeyPem)).toBe(true);

      // A PSS signature salts each run differently, so signing the same hash
      // twice must not produce byte-identical signatures.
      const secondSignature = cryptoService.signHash(contentHash, bundle.privateKeyPem);
      expect(secondSignature).not.toBe(signatureHex);
      expect(cryptoService.verifySignature(contentHash, secondSignature, bundle.publicKeyPem)).toBe(true);
    });

    it('rejects a signature verified with the wrong public key or an altered hash', () => {
      const bundle1 = cryptoService.generateKeyPair('ECDSA_P256_SHA256');
      const bundle2 = cryptoService.generateKeyPair('ECDSA_P256_SHA256');

      const contentHash = cryptoService.hashDocument('Lease', 'Commercial Lease Agreement');
      const signatureHex = cryptoService.signHash(contentHash, bundle1.privateKeyPem);

      expect(cryptoService.verifySignature(contentHash, signatureHex, bundle2.publicKeyPem)).toBe(false);

      const alteredHash = cryptoService.hashDocument('Lease', 'Commercial Lease Agreement (Altered)');
      expect(cryptoService.verifySignature(alteredHash, signatureHex, bundle1.publicKeyPem)).toBe(false);
    });

    it('rejects an ECDSA signature presented against an RSA key and vice versa', () => {
      const ec = cryptoService.generateKeyPair('ECDSA_P256_SHA256');
      const rsa = cryptoService.generateKeyPair('RSA_PSS_SHA256');
      const contentHash = cryptoService.hashDocument('Cross-algorithm check', 'body');

      const ecSignature = cryptoService.signHash(contentHash, ec.privateKeyPem);
      expect(cryptoService.verifySignature(contentHash, ecSignature, rsa.publicKeyPem)).toBe(false);

      const rsaSignature = cryptoService.signHash(contentHash, rsa.privateKeyPem);
      expect(cryptoService.verifySignature(contentHash, rsaSignature, ec.publicKeyPem)).toBe(false);
    });
  });
});

describe('DocuTrust REST API', () => {
  let app: ReturnType<typeof createApp>['app'];

  beforeEach(() => {
    // In-memory isolated database without seeding.
    const ctx = createApp(':memory:', false);
    app = ctx.app;
  });

  it('reports service health on /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('docutrust-engine');
  });

  it('returns a JSON 404 for an unknown API route', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Not found' });
  });

  it('rejects a POST with a non-JSON content type', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'text/plain')
      .send('title=x');
    expect(res.status).toBe(415);
  });

  describe('multi-party signing workflow', () => {
    it('creates, signs and verifies a document end to end', async () => {
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

      const [signer1, signer2] = doc.signers;

      const signRes1 = await request(app).post(`/api/documents/${doc.id}/sign`).send({ signerId: signer1.id });
      expect(signRes1.status).toBe(200);
      expect(signRes1.body.data.status).toBe('PARTIALLY_SIGNED');
      expect(signRes1.body.data.signers[0].status).toBe('SIGNED');
      expect(signRes1.body.data.signers[0].signatureHex).toBeDefined();

      const signRes2 = await request(app).post(`/api/documents/${doc.id}/sign`).send({ signerId: signer2.id });
      expect(signRes2.status).toBe(200);
      expect(signRes2.body.data.status).toBe('COMPLETED');
      expect(signRes2.body.data.completedAt).toBeDefined();

      const verifyRes = await request(app).get(`/api/documents/${doc.id}/verify`);
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.isValid).toBe(true);
      expect(verifyRes.body.data.isTampered).toBe(false);
      expect(verifyRes.body.data.signerVerifications).toHaveLength(2);
      expect(verifyRes.body.data.signerVerifications[0].isSignatureValid).toBe(true);
      expect(verifyRes.body.data.signerVerifications[1].isSignatureValid).toBe(true);
    });

    it('rejects signing the same signer twice', async () => {
      const createRes = await request(app)
        .post('/api/documents')
        .send({
          title: 'Single Signer Agreement',
          content: 'One signature required.',
          signers: [{ name: 'Solo Signer', email: 'solo@example.com', role: 'Owner' }],
        });
      const { id: docId, signers } = createRes.body.data;

      const first = await request(app).post(`/api/documents/${docId}/sign`).send({ signerId: signers[0].id });
      expect(first.status).toBe(200);

      const second = await request(app).post(`/api/documents/${docId}/sign`).send({ signerId: signers[0].id });
      expect(second.status).toBe(409);
      expect(second.body.success).toBe(false);
    });

    it('returns 404 for signing, verifying or tampering a document that does not exist', async () => {
      const sign = await request(app).post('/api/documents/doc_missing/sign').send({ signerId: 'sig_x' });
      expect(sign.status).toBe(404);

      const verify = await request(app).get('/api/documents/doc_missing/verify');
      expect(verify.status).toBe(404);

      const tamper = await request(app).post('/api/documents/doc_missing/tamper').send({ tamperedContent: 'x' });
      expect(tamper.status).toBe(404);
    });
  });

  describe('tamper detection on every sealed field', () => {
    async function createAndSignSingleSignerDoc(content: string, title = 'Promissory Note') {
      const createRes = await request(app)
        .post('/api/documents')
        .send({
          title,
          content,
          signers: [{ name: 'Borrower Name', email: 'borrower@loan.ee', role: 'Borrower' }],
        });
      const docId = createRes.body.data.id;
      const signerId = createRes.body.data.signers[0].id;
      await request(app).post(`/api/documents/${docId}/sign`).send({ signerId });
      return docId;
    }

    it('detects tampering with the content after signing', async () => {
      const docId = await createAndSignSingleSignerDoc('Borrower shall repay EUR 10,000 on Dec 31, 2026.');

      const initialVerify = await request(app).get(`/api/documents/${docId}/verify`);
      expect(initialVerify.body.data.isValid).toBe(true);

      const tamperRes = await request(app)
        .post(`/api/documents/${docId}/tamper`)
        .send({ tamperedContent: 'Borrower shall repay EUR 1,000 on Dec 31, 2026.' });
      expect(tamperRes.status).toBe(200);

      const tamperedVerify = await request(app).get(`/api/documents/${docId}/verify`);
      expect(tamperedVerify.body.data.isValid).toBe(false);
      expect(tamperedVerify.body.data.isTampered).toBe(true);
      expect(tamperedVerify.body.data.signerVerifications[0].isSignatureValid).toBe(false);
      expect(tamperedVerify.body.data.signerVerifications[0].error).toContain('hash mismatch');
    });

    it('detects tampering with only the title after signing', async () => {
      const docId = await createAndSignSingleSignerDoc('Unchanged body text.', 'Original Title');

      const tamperRes = await request(app)
        .post(`/api/documents/${docId}/tamper`)
        .send({ tamperedTitle: 'Retitled Without Consent' });
      expect(tamperRes.status).toBe(200);
      expect(tamperRes.body.data.title).toBe('Retitled Without Consent');
      expect(tamperRes.body.data.content).toBe('Unchanged body text.');

      const verifyRes = await request(app).get(`/api/documents/${docId}/verify`);
      expect(verifyRes.body.data.isTampered).toBe(true);
      expect(verifyRes.body.data.isValid).toBe(false);
    });

    it('rejects a tamper request with neither field set', async () => {
      const docId = await createAndSignSingleSignerDoc('Body text.');
      const res = await request(app).post(`/api/documents/${docId}/tamper`).send({});
      expect(res.status).toBe(400);
    });
  });

  describe('input validation', () => {
    it('rejects a document with a missing title', async () => {
      const res = await request(app)
        .post('/api/documents')
        .send({ content: 'Body', signers: [{ name: 'A', email: 'a@example.com', role: 'CEO' }] });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/title/i);
    });

    it('rejects a document with no signers', async () => {
      const res = await request(app).post('/api/documents').send({ title: 'T', content: 'Body', signers: [] });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/signer/i);
    });

    it('rejects a signer with a malformed email address', async () => {
      const res = await request(app)
        .post('/api/documents')
        .send({
          title: 'T',
          content: 'Body',
          signers: [{ name: 'A', email: 'not-an-email', role: 'CEO' }],
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/email/i);
    });

    it('rejects signing without a signerId', async () => {
      const createRes = await request(app)
        .post('/api/documents')
        .send({ title: 'T', content: 'Body', signers: [{ name: 'A', email: 'a@example.com', role: 'CEO' }] });
      const res = await request(app).post(`/api/documents/${createRes.body.data.id}/sign`).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/signerId/i);
    });
  });

  it('never leaks internal error detail for an unexpected failure', async () => {
    // A malformed JSON body fails inside the body parser, before any
    // controller runs; the response must stay a generic, well-formed error.
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'application/json')
      .send('{not valid json');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error).not.toMatch(/at JSON\.parse|node_modules|\.ts:\d/);
  });

  it('generates an on-demand keypair on /api/crypto/keypair', async () => {
    const res = await request(app).get('/api/crypto/keypair?algo=ECDSA_P256_SHA256');
    expect(res.status).toBe(200);
    expect(res.body.data.publicKeyPem).toBeDefined();
    expect(res.body.data.fingerprint).toBeDefined();
  });

  it('falls back to ECDSA for an unrecognized algorithm query param', async () => {
    const res = await request(app).get('/api/crypto/keypair?algo=not-a-real-algorithm');
    expect(res.status).toBe(200);
    expect(res.body.data.algorithm).toBe('ECDSA_P256_SHA256');
  });
});
