import type {
  DocumentRecord,
  CreateDocumentPayload,
  VerificationResult,
  ApiResponse,
} from '../../../shared/types.js';
import type { TamperPayload } from '../../../shared/validation.js';

const API_BASE = '/api';

export async function fetchHealth(): Promise<{ status: string; service: string }> {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

export async function fetchDocuments(): Promise<DocumentRecord[]> {
  const res = await fetch(`${API_BASE}/documents`);
  const json: ApiResponse<DocumentRecord[]> = await res.json();
  if (!json.success || !json.data) throw new Error(json.error || 'Failed to fetch documents');
  return json.data;
}

export async function fetchDocumentById(id: string): Promise<DocumentRecord> {
  const res = await fetch(`${API_BASE}/documents/${id}`);
  const json: ApiResponse<DocumentRecord> = await res.json();
  if (!json.success || !json.data) throw new Error(json.error || 'Failed to fetch document');
  return json.data;
}

export async function createDocument(payload: CreateDocumentPayload): Promise<DocumentRecord> {
  const res = await fetch(`${API_BASE}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json: ApiResponse<DocumentRecord> = await res.json();
  if (!json.success || !json.data) throw new Error(json.error || 'Document creation failed');
  return json.data;
}

export async function signDocument(
  documentId: string,
  signerId: string,
  privateKeyPem?: string
): Promise<DocumentRecord> {
  const res = await fetch(`${API_BASE}/documents/${documentId}/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signerId, privateKeyPem }),
  });
  const json: ApiResponse<DocumentRecord> = await res.json();
  if (!json.success || !json.data) throw new Error(json.error || 'Signing failed');
  return json.data;
}

export async function verifyDocument(documentId: string): Promise<VerificationResult> {
  const res = await fetch(`${API_BASE}/documents/${documentId}/verify`);
  const json: ApiResponse<VerificationResult> = await res.json();
  if (!json.success || !json.data) throw new Error(json.error || 'Verification failed');
  return json.data;
}

export async function simulateTamper(documentId: string, tamper: TamperPayload): Promise<DocumentRecord> {
  const res = await fetch(`${API_BASE}/documents/${documentId}/tamper`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tamper),
  });
  const json: ApiResponse<DocumentRecord> = await res.json();
  if (!json.success || !json.data) throw new Error(json.error || 'Tamper simulation failed');
  return json.data;
}
