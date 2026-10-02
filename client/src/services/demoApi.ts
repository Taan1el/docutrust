// In-browser implementation of the document-signing API for the static
// GitHub Pages build. It reuses the exact validation, canonicalization and
// error-shaping code the Express server uses (see shared/), and signs with
// Web Crypto instead of node:crypto (see ./demoCrypto.ts), so a tampered
// document is rejected here for the same reason it would be rejected by the
// real API. Documents persist in localStorage; private keys never do.
import type {
  AuditEvent,
  CreateDocumentPayload,
  DocumentRecord,
  DocumentSigner,
  SignerVerification,
  VerificationResult,
} from '../../../shared/types.js';
import { buildDocumentDigestInput } from '../../../shared/canonical.js';
import { conflict, notFound } from '../../../shared/errors.js';
import {
  parseCreateDocumentPayload,
  parseTamperPayload,
  type TamperPayload,
} from '../../../shared/validation.js';
import { fingerprintOfPem, generateKeyPair, hashDocument as webCryptoHash, signHash, verifySignature } from './demoCrypto.js';

export const DEMO_STORAGE_KEY = 'docutrust-demo:v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function memoryStorage(): StorageLike {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

function browserStorage(): StorageLike {
  try {
    const storage = globalThis.localStorage;
    const probe = `${DEMO_STORAGE_KEY}:probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    // Private mode or blocked storage: keep the demo working for this page view.
    return memoryStorage();
  }
}

interface PersistedStore {
  version: 1;
  documents: DocumentRecord[];
}

function isPersistedStore(value: unknown): value is PersistedStore {
  const v = value as PersistedStore;
  return !!v && v.version === 1 && Array.isArray(v.documents);
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(prefix: string, bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return `${prefix}_${[...buf].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

async function hashDocument(title: string, content: string): Promise<string> {
  return webCryptoHash(buildDocumentDigestInput(title, content));
}

/**
 * Fixed IDs and timestamps (not crypto.randomBytes) so the seeded agreements
 * are the same every time the demo resets, the way the task calls for
 * "deterministic sample documents". The signatures themselves cannot be
 * byte-identical across resets: ECDSA signing is randomized by design, and a
 * fresh keypair is generated per signature, matching how the real UI signs.
 */
async function buildSeedDocuments(): Promise<DocumentRecord[]> {
  const seedAt = '2026-01-05T09:00:00.000Z';

  async function seedDoc(
    id: string,
    title: string,
    content: string,
    signerSeeds: Array<{ name: string; email: string; role: string }>,
    signCount: number
  ): Promise<DocumentRecord> {
    const contentHash = await hashDocument(title, content);
    const signers: DocumentSigner[] = signerSeeds.map((s, idx) => ({
      id: `${id}_sig${idx + 1}`,
      documentId: id,
      name: s.name,
      email: s.email,
      role: s.role,
      status: 'PENDING',
    }));

    const auditTrail: AuditEvent[] = [
      {
        id: `${id}_aud0`,
        documentId: id,
        action: 'DOCUMENT_CREATED',
        actorName: 'Document Creator',
        details: { title, contentHash, signerCount: signers.length },
        timestamp: seedAt,
      },
    ];

    for (let i = 0; i < signCount; i++) {
      const signedAt = new Date(Date.parse(seedAt) + (i + 1) * 60_000).toISOString();
      const keyPair = await generateKeyPair();
      const signatureHex = await signHash(contentHash, keyPair.privateKey);
      signers[i] = {
        ...signers[i],
        status: 'SIGNED',
        publicKeyPem: keyPair.publicKeyPem,
        signatureHex,
        signedAt,
        ipAddress: 'browser',
        userAgent: 'DocuTrust-Demo/1.0',
      };
      auditTrail.push({
        id: `${id}_aud${i + 1}`,
        documentId: id,
        action: 'DOCUMENT_SIGNED',
        actorName: signers[i].name,
        actorEmail: signers[i].email,
        details: { signerId: signers[i].id, role: signers[i].role, keyFingerprint: keyPair.fingerprint },
        timestamp: signedAt,
      });
    }

    const allSigned = signCount === signers.length;
    const status = allSigned ? 'COMPLETED' : signCount > 0 ? 'PARTIALLY_SIGNED' : 'PENDING_SIGNATURES';
    if (allSigned) {
      auditTrail.push({
        id: `${id}_audseal`,
        documentId: id,
        action: 'DOCUMENT_SEALED',
        actorName: 'DocuTrust',
        details: { status: 'COMPLETED', totalSignatures: signers.length, contentHash },
        timestamp: auditTrail[auditTrail.length - 1].timestamp,
      });
    }

    return {
      id,
      title,
      content,
      contentHash,
      status,
      createdAt: seedAt,
      updatedAt: auditTrail[auditTrail.length - 1].timestamp,
      completedAt: allSigned ? auditTrail[auditTrail.length - 1].timestamp : undefined,
      signers,
      auditTrail,
    };
  }

  return Promise.all([
    seedDoc(
      'doc_demo_dpa',
      'Cloud Data Processing Addendum',
      'DATA PROCESSING ADDENDUM\n\n1. SCOPE\nThis Addendum governs the processing of customer personal data by the Processor on behalf of the Controller.\n\n2. SECURITY MEASURES\nThe Processor maintains encryption at rest and in transit and restricts access to authorized personnel.\n\n3. AUDIT\nThe Controller may request a summary of the Processor\'s security controls once per year.',
      [
        { name: 'Elena Rostova', email: 'elena.rostova@example.com', role: 'Chief Information Security Officer' },
        { name: 'Markus Berg', email: 'markus.berg@example.com', role: 'Data Protection Officer' },
      ],
      2
    ),
    seedDoc(
      'doc_demo_msa',
      'Master Services Agreement',
      'MASTER SERVICES AGREEMENT\n\nBETWEEN: Northwind Services OU ("Provider")\nAND: Example Enterprise AB ("Customer")\n\n1. SERVICES\nProvider grants Customer a non-exclusive subscription to the hosted platform described in Exhibit A.\n\n2. FEES\nInvoiced monthly, payable within 30 days.\n\n3. TERM\nThis Agreement runs for twelve months from the Effective Date.',
      [
        { name: 'Kasper Tamm', email: 'kasper.tamm@example.com', role: 'Founder & CEO' },
        { name: 'Sofia Lindstrom', email: 'sofia.lindstrom@example.com', role: 'VP Procurement' },
      ],
      1
    ),
    seedDoc(
      'doc_demo_safe',
      'Simple Agreement for Future Equity',
      'SIMPLE AGREEMENT FOR FUTURE EQUITY\n\nVALUATION CAP: EUR 1,500,000\nDISCOUNT RATE: 20%\n\nIn exchange for the Purchase Amount, the Company grants the Investor the right to certain shares upon a future Equity Financing.',
      [
        { name: 'Rasmus Kallas', email: 'rasmus.kallas@example.com', role: 'Managing Director' },
        { name: 'Helena Vainio', email: 'helena.vainio@example.com', role: 'General Partner' },
      ],
      0
    ),
  ]);
}

export interface DemoApi {
  fetchDocuments(): Promise<DocumentRecord[]>;
  fetchDocumentById(id: string): Promise<DocumentRecord>;
  createDocument(payload: CreateDocumentPayload): Promise<DocumentRecord>;
  signDocument(documentId: string, signerId: string): Promise<DocumentRecord>;
  verifyDocument(documentId: string): Promise<VerificationResult>;
  simulateTamper(documentId: string, tamper: TamperPayload): Promise<DocumentRecord>;
  reset(): Promise<void>;
}

export function createDemoApi(storageFactory: () => StorageLike = browserStorage): DemoApi {
  let storage: StorageLike | null = null;
  let store: PersistedStore | null = null;

  const getStorage = () => (storage ??= storageFactory());

  function save(): void {
    if (!store) return;
    try {
      getStorage().setItem(DEMO_STORAGE_KEY, JSON.stringify(store));
    } catch {
      storage = memoryStorage();
      storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(store));
    }
  }

  function readStored(): PersistedStore | null {
    try {
      const raw = getStorage().getItem(DEMO_STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isPersistedStore(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async function ensureLoaded(): Promise<PersistedStore> {
    if (store) return store;
    const existing = readStored();
    if (existing) {
      store = existing;
      return store;
    }
    store = { version: 1, documents: await buildSeedDocuments() };
    save();
    return store;
  }

  function findDoc(state: PersistedStore, id: string): DocumentRecord {
    const doc = state.documents.find((d) => d.id === id);
    if (!doc) throw notFound(`Document not found: ${id}`);
    return doc;
  }

  return {
    async fetchDocuments() {
      const state = await ensureLoaded();
      return [...state.documents].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },

    async fetchDocumentById(id) {
      const state = await ensureLoaded();
      return findDoc(state, id);
    },

    async createDocument(payload) {
      const input = parseCreateDocumentPayload(payload);
      const state = await ensureLoaded();

      const id = randomId('doc', 8);
      const contentHash = await hashDocument(input.title, input.content);
      const now = nowIso();

      const signers: DocumentSigner[] = input.signers.map((s, idx) => ({
        id: `sig_${randomId('s', 4)}_${idx + 1}`,
        documentId: id,
        name: s.name,
        email: s.email,
        role: s.role,
        status: 'PENDING',
      }));

      const doc: DocumentRecord = {
        id,
        title: input.title,
        content: input.content,
        contentHash,
        status: 'PENDING_SIGNATURES',
        createdAt: now,
        updatedAt: now,
        signers,
        auditTrail: [
          {
            id: randomId('aud', 4),
            documentId: id,
            action: 'DOCUMENT_CREATED',
            actorName: 'Web User',
            details: { title: input.title, contentHash, signerCount: signers.length },
            timestamp: now,
          },
        ],
      };

      state.documents.push(doc);
      save();
      return doc;
    },

    async signDocument(documentId, signerId) {
      const state = await ensureLoaded();
      const doc = findDoc(state, documentId);
      const signer = doc.signers.find((s) => s.id === signerId);
      if (!signer) throw notFound(`Signer not found: ${signerId}`);
      if (signer.status === 'SIGNED') {
        throw conflict(`Signer ${signer.name} has already signed this document`);
      }

      const keyPair = await generateKeyPair();
      const signatureHex = await signHash(doc.contentHash, keyPair.privateKey);
      const now = nowIso();

      signer.status = 'SIGNED';
      signer.publicKeyPem = keyPair.publicKeyPem;
      signer.signatureHex = signatureHex;
      signer.signedAt = now;
      signer.ipAddress = 'browser';
      signer.userAgent = 'DocuTrust-Demo/1.0';

      doc.auditTrail = doc.auditTrail ?? [];
      doc.auditTrail.push({
        id: randomId('aud', 4),
        documentId,
        action: 'DOCUMENT_SIGNED',
        actorName: signer.name,
        actorEmail: signer.email,
        details: { signerId, role: signer.role, keyFingerprint: keyPair.fingerprint },
        timestamp: now,
      });

      const allSigned = doc.signers.every((s) => s.status === 'SIGNED');
      doc.status = allSigned ? 'COMPLETED' : 'PARTIALLY_SIGNED';
      doc.updatedAt = now;
      if (allSigned) {
        doc.completedAt = now;
        doc.auditTrail.push({
          id: randomId('aud', 4),
          documentId,
          action: 'DOCUMENT_SEALED',
          actorName: 'DocuTrust',
          details: { status: 'COMPLETED', totalSignatures: doc.signers.length, contentHash: doc.contentHash },
          timestamp: now,
        });
      }

      save();
      return doc;
    },

    async verifyDocument(documentId) {
      const state = await ensureLoaded();
      const doc = findDoc(state, documentId);

      const currentHash = await hashDocument(doc.title, doc.content);
      const isTampered = currentHash !== doc.contentHash;

      const signerVerifications: SignerVerification[] = [];
      let allSignaturesValid = true;

      for (const signer of doc.signers) {
        if (signer.status !== 'SIGNED' || !signer.signatureHex || !signer.publicKeyPem) {
          signerVerifications.push({
            signerId: signer.id,
            name: signer.name,
            email: signer.email,
            hasSigned: false,
            isSignatureValid: false,
          });
          continue;
        }

        const isSignatureValid =
          !isTampered && (await verifySignature(currentHash, signer.signatureHex, signer.publicKeyPem));
        if (!isSignatureValid) allSignaturesValid = false;

        signerVerifications.push({
          signerId: signer.id,
          name: signer.name,
          email: signer.email,
          hasSigned: true,
          isSignatureValid,
          keyFingerprint: await fingerprintOfPem(signer.publicKeyPem),
          error: isTampered
            ? 'Document hash mismatch: title or content changed after signing'
            : isSignatureValid
              ? undefined
              : 'Public key verification failed',
        });
      }

      const hasAnySignature = doc.signers.some((s) => s.status === 'SIGNED');
      const isValid = !isTampered && allSignaturesValid && hasAnySignature;
      const now = nowIso();

      doc.auditTrail = doc.auditTrail ?? [];
      doc.auditTrail.push({
        id: randomId('aud', 4),
        documentId,
        action: isTampered ? 'TAMPER_DETECTED' : 'VERIFICATION_PERFORMED',
        actorName: 'Audit Inspector',
        details: { isValid, isTampered, currentHash, expectedHash: doc.contentHash },
        timestamp: now,
      });
      save();

      return {
        documentId,
        isValid,
        isTampered,
        currentHash,
        expectedHash: doc.contentHash,
        signerVerifications,
        verifiedAt: now,
      };
    },

    async simulateTamper(documentId, tamperInput) {
      const state = await ensureLoaded();
      const doc = findDoc(state, documentId);
      const tamper = parseTamperPayload(tamperInput);

      const newTitle = tamper.tamperedTitle ?? doc.title;
      const newContent = tamper.tamperedContent ?? doc.content;
      const now = nowIso();

      doc.auditTrail = doc.auditTrail ?? [];
      doc.auditTrail.push({
        id: randomId('aud', 4),
        documentId,
        action: 'MALICIOUS_TAMPER_SIMULATED',
        actorName: 'Adversary Simulator',
        details: {
          titleChanged: newTitle !== doc.title,
          contentChanged: newContent !== doc.content,
          note: 'Document title and/or content modified while retaining the original cryptographic seal hash',
        },
        timestamp: now,
      });

      doc.title = newTitle;
      doc.content = newContent;
      doc.updatedAt = now;
      // contentHash is intentionally left untouched: that is the seal a real
      // attacker with database access could not recompute without the
      // signers' private keys, so the next verification must fail.

      save();
      return doc;
    },

    async reset() {
      getStorage().removeItem(DEMO_STORAGE_KEY);
      store = null;
      await ensureLoaded();
    },
  };
}
