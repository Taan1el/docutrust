export type SignatureAlgorithm = 'ECDSA_P256_SHA256' | 'RSA_PSS_SHA256';

export type DocumentStatus =
  | 'DRAFT'
  | 'PENDING_SIGNATURES'
  | 'PARTIALLY_SIGNED'
  | 'COMPLETED'
  | 'REJECTED';

export type SignerStatus = 'PENDING' | 'SIGNED' | 'REJECTED';

export interface KeypairBundle {
  publicKeyPem: string;
  privateKeyPem: string;
  fingerprint: string;
  algorithm: SignatureAlgorithm;
}

export interface DocumentSigner {
  id: string;
  documentId: string;
  name: string;
  email: string;
  role: string;
  status: SignerStatus;
  publicKeyPem?: string;
  signatureHex?: string;
  signedAt?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditEvent {
  id: string;
  documentId: string;
  action: string;
  actorName: string;
  actorEmail?: string;
  details: Record<string, string | number | boolean | null>;
  timestamp: string;
}

export interface DocumentRecord {
  id: string;
  title: string;
  content: string;
  contentHash: string; // SHA-256 of canonical content
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  signers: DocumentSigner[];
  auditTrail?: AuditEvent[];
}

export interface SignerVerification {
  signerId: string;
  name: string;
  email: string;
  hasSigned: boolean;
  isSignatureValid: boolean;
  keyFingerprint?: string;
  error?: string;
}

export interface VerificationResult {
  documentId: string;
  isValid: boolean;
  isTampered: boolean;
  currentHash: string;
  expectedHash: string;
  signerVerifications: SignerVerification[];
  verifiedAt: string;
}

export interface CreateDocumentPayload {
  title: string;
  content: string;
  signers: Array<{
    name: string;
    email: string;
    role: string;
  }>;
}

export interface SignDocumentPayload {
  signerId: string;
  privateKeyPem?: string; // Optional if using generated key on client or server
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
