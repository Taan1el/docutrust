import { describe, expect, it } from 'vitest';
import { DocuTrustError } from '../../../shared/errors.js';
import { createDemoApi, memoryStorage, type StorageLike } from './demoApi.js';

function setup(storage: StorageLike = memoryStorage()) {
  return { api: createDemoApi(() => storage), storage };
}

async function expectDocuTrustError(promise: Promise<unknown>, status: number, message: RegExp) {
  const error = await promise.then(
    () => {
      throw new Error('expected the call to fail');
    },
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(DocuTrustError);
  expect((error as DocuTrustError).status).toBe(status);
  expect((error as DocuTrustError).message).toMatch(message);
}

// The demo adapter is the entire data layer on GitHub Pages (no API server
// exists there), so it gets the same kind of coverage the real API's
// integration tests get: seeded data, signing, verification, tamper
// detection, validation, and persistence across "page loads".
describe('demoApi (in-browser data layer)', () => {
  it('starts from three deterministic sample agreements', async () => {
    const { api } = setup();
    const docs = await api.fetchDocuments();

    const ids = docs.map((d) => d.id).sort();
    expect(ids).toEqual(['doc_demo_dpa', 'doc_demo_msa', 'doc_demo_safe']);

    const dpa = docs.find((d) => d.id === 'doc_demo_dpa')!;
    expect(dpa.status).toBe('COMPLETED');
    expect(dpa.signers.every((s) => s.status === 'SIGNED')).toBe(true);

    const msa = docs.find((d) => d.id === 'doc_demo_msa')!;
    expect(msa.status).toBe('PARTIALLY_SIGNED');

    const safe = docs.find((d) => d.id === 'doc_demo_safe')!;
    expect(safe.status).toBe('PENDING_SIGNATURES');
    expect(safe.signers.every((s) => s.status === 'PENDING')).toBe(true);
  });

  it('reseeds identical document content and ids after a reset', async () => {
    const { api } = setup();
    const before = (await api.fetchDocuments()).map((d) => ({ id: d.id, title: d.title, content: d.content }));

    await api.reset();
    const after = (await api.fetchDocuments()).map((d) => ({ id: d.id, title: d.title, content: d.content }));

    expect(after.sort((a, b) => a.id.localeCompare(b.id))).toEqual(before.sort((a, b) => a.id.localeCompare(b.id)));
  });

  it('creates, signs and verifies a new agreement end to end', async () => {
    const { api } = setup();

    const created = await api.createDocument({
      title: 'Stock Purchase Agreement',
      content: 'The Investor agrees to purchase 10,000 Common Shares.',
      signers: [
        { name: 'Alice Founder', email: 'alice@startup.example', role: 'CEO' },
        { name: 'Bob Investor', email: 'bob@venture.example', role: 'Partner' },
      ],
    });
    expect(created.status).toBe('PENDING_SIGNATURES');

    const [signer1, signer2] = created.signers;
    const afterFirst = await api.signDocument(created.id, signer1.id);
    expect(afterFirst.status).toBe('PARTIALLY_SIGNED');
    expect(afterFirst.signers[0].signatureHex).toBeDefined();

    const afterSecond = await api.signDocument(created.id, signer2.id);
    expect(afterSecond.status).toBe('COMPLETED');
    expect(afterSecond.completedAt).toBeDefined();

    const verification = await api.verifyDocument(created.id);
    expect(verification.isValid).toBe(true);
    expect(verification.isTampered).toBe(false);
    expect(verification.signerVerifications).toHaveLength(2);
    expect(verification.signerVerifications.every((s) => s.isSignatureValid)).toBe(true);
  });

  it('rejects signing the same signer twice', async () => {
    const { api } = setup();
    const created = await api.createDocument({
      title: 'Single Signer Agreement',
      content: 'One signature required.',
      signers: [{ name: 'Solo Signer', email: 'solo@example.com', role: 'Owner' }],
    });

    await api.signDocument(created.id, created.signers[0].id);
    await expectDocuTrustError(api.signDocument(created.id, created.signers[0].id), 409, /already signed/);
  });

  it('rejects a document with no signers before touching storage', async () => {
    const { api } = setup();
    await expectDocuTrustError(
      api.createDocument({ title: 'T', content: 'Body', signers: [] }),
      400,
      /signer/i
    );
  });

  it('detects tampering with the content after signing and fails verification', async () => {
    const { api } = setup();
    const created = await api.createDocument({
      title: 'Promissory Note',
      content: 'Borrower shall repay EUR 10,000 on Dec 31, 2026.',
      signers: [{ name: 'Borrower Name', email: 'borrower@example.com', role: 'Borrower' }],
    });
    await api.signDocument(created.id, created.signers[0].id);

    const beforeTamper = await api.verifyDocument(created.id);
    expect(beforeTamper.isValid).toBe(true);

    await api.simulateTamper(created.id, { tamperedContent: 'Borrower shall repay EUR 1,000 on Dec 31, 2026.' });

    const afterTamper = await api.verifyDocument(created.id);
    expect(afterTamper.isValid).toBe(false);
    expect(afterTamper.isTampered).toBe(true);
    expect(afterTamper.signerVerifications[0].isSignatureValid).toBe(false);
    expect(afterTamper.signerVerifications[0].error).toContain('hash mismatch');
  });

  it('detects tampering with only the title after signing', async () => {
    const { api } = setup();
    const created = await api.createDocument({
      title: 'Original Title',
      content: 'Unchanged body text.',
      signers: [{ name: 'Signer', email: 'signer@example.com', role: 'Owner' }],
    });
    await api.signDocument(created.id, created.signers[0].id);

    const tampered = await api.simulateTamper(created.id, { tamperedTitle: 'Retitled Without Consent' });
    expect(tampered.title).toBe('Retitled Without Consent');
    expect(tampered.content).toBe('Unchanged body text.');

    const verification = await api.verifyDocument(created.id);
    expect(verification.isTampered).toBe(true);
    expect(verification.isValid).toBe(false);
  });

  it('rejects a tamper request with neither field set', async () => {
    const { api } = setup();
    const created = await api.createDocument({
      title: 'T',
      content: 'Body text.',
      signers: [{ name: 'A', email: 'a@example.com', role: 'CEO' }],
    });
    await expectDocuTrustError(api.simulateTamper(created.id, {}), 400, /tampered/i);
  });

  it('returns 404 for signing, verifying or tampering a document that does not exist', async () => {
    const { api } = setup();
    await expectDocuTrustError(api.signDocument('doc_missing', 'sig_x'), 404, /not found/i);
    await expectDocuTrustError(api.verifyDocument('doc_missing'), 404, /not found/i);
    await expectDocuTrustError(api.simulateTamper('doc_missing', { tamperedContent: 'x' }), 404, /not found/i);
  });

  it('persists created and signed documents across a simulated page reload', async () => {
    const storage = memoryStorage();
    const first = createDemoApi(() => storage);
    const created = await first.createDocument({
      title: 'Persisted Agreement',
      content: 'Body.',
      signers: [{ name: 'Signer', email: 'signer@example.com', role: 'Owner' }],
    });
    await first.signDocument(created.id, created.signers[0].id);

    // A fresh adapter instance over the same storage stands in for reloading the page.
    const second = createDemoApi(() => storage);
    const reloaded = await second.fetchDocumentById(created.id);
    expect(reloaded.status).toBe('COMPLETED');
  });

  it('never persists a private key: only the public key and signature are stored', async () => {
    const { api, storage } = setup();
    const created = await api.createDocument({
      title: 'Key Handling Check',
      content: 'Body.',
      signers: [{ name: 'Signer', email: 'signer@example.com', role: 'Owner' }],
    });
    await api.signDocument(created.id, created.signers[0].id);

    const raw = storage.getItem('docutrust-demo:v1') ?? '';
    expect(raw).not.toMatch(/PRIVATE KEY/);
    expect(raw).toMatch(/PUBLIC KEY/);
  });
});
