import crypto from 'node:crypto';
import type {
  DocumentRecord,
  DocumentSigner,
  AuditEvent,
  CreateDocumentPayload,
  VerificationResult,
  SignerVerification,
} from '../../../shared/types.js';
import { DocumentRepository } from '../repositories/document.repository.js';
import { CryptoService } from './crypto.service.js';

export class SigningService {
  constructor(
    private docRepo: DocumentRepository,
    private cryptoService: CryptoService
  ) {}

  createDocument(payload: CreateDocumentPayload, actorName = 'Document Creator'): DocumentRecord {
    if (!payload.title || !payload.content) {
      throw new Error('Title and content are required');
    }
    if (!payload.signers || payload.signers.length === 0) {
      throw new Error('At least one signer is required');
    }

    const docId = `doc_${crypto.randomBytes(8).toString('hex')}`;
    const contentHash = this.cryptoService.hashDocumentContent(payload.content);
    const now = new Date().toISOString();

    const signers: DocumentSigner[] = payload.signers.map((s, idx) => ({
      id: `sig_${crypto.randomBytes(6).toString('hex')}_${idx + 1}`,
      documentId: docId,
      name: s.name,
      email: s.email,
      role: s.role,
      status: 'PENDING',
    }));

    const initialAudit: AuditEvent = {
      id: `aud_${crypto.randomBytes(6).toString('hex')}`,
      documentId: docId,
      action: 'DOCUMENT_CREATED',
      actorName,
      details: {
        title: payload.title,
        contentHash,
        signerCount: signers.length,
      },
      timestamp: now,
    };

    this.docRepo.createDocument(
      {
        id: docId,
        title: payload.title,
        content: payload.content,
        contentHash,
        status: 'PENDING_SIGNATURES',
        createdAt: now,
        updatedAt: now,
      },
      signers,
      initialAudit
    );

    const created = this.docRepo.getDocumentById(docId);
    if (!created) throw new Error('Failed to retrieve created document');
    return created;
  }

  signDocument(
    documentId: string,
    signerId: string,
    providedPrivateKeyPem?: string,
    ipAddress = '127.0.0.1',
    userAgent = 'DocuTrust-Signer/1.0'
  ): DocumentRecord {
    const doc = this.docRepo.getDocumentById(documentId);
    if (!doc) throw new Error(`Document not found: ${documentId}`);

    const signer = doc.signers.find((s) => s.id === signerId);
    if (!signer) throw new Error(`Signer not found: ${signerId}`);

    if (signer.status === 'SIGNED') {
      throw new Error(`Signer ${signer.name} has already signed this document`);
    }

    let privateKey = providedPrivateKeyPem;
    let publicKey = signer.publicKeyPem;

    // If no keypair provided, generate an ECDSA P-256 keypair (simulating e-ID smart card hardware token)
    if (!privateKey || !publicKey) {
      const keyBundle = this.cryptoService.generateKeyPair('ECDSA_P256_SHA256');
      privateKey = keyBundle.privateKeyPem;
      publicKey = keyBundle.publicKeyPem;
    }

    // Cryptographically sign the document hash
    const signatureHex = this.cryptoService.signHash(doc.contentHash, privateKey);
    const now = new Date().toISOString();

    // Persist signature
    this.docRepo.updateSignerSignature(
      signerId,
      signatureHex,
      publicKey,
      now,
      ipAddress,
      userAgent
    );

    // Record audit event
    this.docRepo.addAuditEvent({
      id: `aud_${crypto.randomBytes(6).toString('hex')}`,
      documentId,
      action: 'DOCUMENT_SIGNED',
      actorName: signer.name,
      actorEmail: signer.email,
      details: {
        signerId,
        role: signer.role,
        keyFingerprint: this.cryptoService.computeKeyFingerprint(publicKey),
        ipAddress,
      },
      timestamp: now,
    });

    // Check overall document status
    const updatedDoc = this.docRepo.getDocumentById(documentId);
    if (!updatedDoc) throw new Error('Document retrieval failed after signing');

    const allSigned = updatedDoc.signers.every((s) => s.status === 'SIGNED');
    const newStatus = allSigned ? 'COMPLETED' : 'PARTIALLY_SIGNED';
    const completedAt = allSigned ? now : undefined;

    this.docRepo.updateDocumentStatus(documentId, newStatus, completedAt);

    if (allSigned) {
      this.docRepo.addAuditEvent({
        id: `aud_${crypto.randomBytes(6).toString('hex')}`,
        documentId,
        action: 'DOCUMENT_SEALED',
        actorName: 'DocuTrust PKI Authority',
        details: {
          status: 'COMPLETED',
          totalSignatures: updatedDoc.signers.length,
          contentHash: updatedDoc.contentHash,
        },
        timestamp: now,
      });
    }

    return this.docRepo.getDocumentById(documentId)!;
  }

  verifyDocument(documentId: string): VerificationResult {
    const doc = this.docRepo.getDocumentById(documentId);
    if (!doc) throw new Error(`Document not found: ${documentId}`);

    const currentHash = this.cryptoService.hashDocumentContent(doc.content);
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

      // Verify mathematical signature against the CURRENT document hash
      // If the document was tampered, the signature must FAIL verification!
      const isSignatureValid =
        !isTampered &&
        this.cryptoService.verifySignature(
          currentHash,
          signer.signatureHex,
          signer.publicKeyPem
        );

      if (!isSignatureValid) {
        allSignaturesValid = false;
      }

      const keyFingerprint = this.cryptoService.computeKeyFingerprint(signer.publicKeyPem);

      signerVerifications.push({
        signerId: signer.id,
        name: signer.name,
        email: signer.email,
        hasSigned: true,
        isSignatureValid,
        keyFingerprint,
        error: isTampered
          ? 'Document hash mismatch: Cryptographic seal broken by unauthorized modification'
          : isSignatureValid
            ? undefined
            : 'Public key mathematical verification failed',
      });
    }

    const hasAnySignature = doc.signers.some((s) => s.status === 'SIGNED');
    const isValid = !isTampered && allSignaturesValid && hasAnySignature;

    const now = new Date().toISOString();

    this.docRepo.addAuditEvent({
      id: `aud_${crypto.randomBytes(6).toString('hex')}`,
      documentId,
      action: isTampered ? 'TAMPER_DETECTED' : 'VERIFICATION_PERFORMED',
      actorName: 'Audit Inspector',
      details: {
        isValid,
        isTampered,
        currentHash,
        expectedHash: doc.contentHash,
      },
      timestamp: now,
    });

    return {
      documentId,
      isValid,
      isTampered,
      currentHash,
      expectedHash: doc.contentHash,
      signerVerifications,
      verifiedAt: now,
    };
  }

  simulateTamper(documentId: string, tamperedContent: string): DocumentRecord {
    const doc = this.docRepo.getDocumentById(documentId);
    if (!doc) throw new Error(`Document not found: ${documentId}`);

    // Maliciously update the document content in the DB WITHOUT updating the sealed content_hash!
    // This replicates unauthorized database alteration or man-in-the-middle tampering.
    this.docRepo.updateDocumentContent(documentId, tamperedContent, doc.contentHash);

    this.docRepo.addAuditEvent({
      id: `aud_${crypto.randomBytes(6).toString('hex')}`,
      documentId,
      action: 'MALICIOUS_TAMPER_SIMULATED',
      actorName: 'Adversary Simulator',
      details: {
        originalLength: doc.content.length,
        tamperedLength: tamperedContent.length,
        note: 'Document text modified while retaining original cryptographic seal hash',
      },
      timestamp: new Date().toISOString(),
    });

    return this.docRepo.getDocumentById(documentId)!;
  }

  getDocumentById(id: string): DocumentRecord | null {
    return this.docRepo.getDocumentById(id);
  }

  getAllDocuments(): DocumentRecord[] {
    return this.docRepo.getAllDocuments();
  }
}
