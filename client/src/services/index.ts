// The one place that decides whether the app talks to the real Express API
// or the in-browser demo. Components import from here, never directly from
// ./api.js or ./demoApi.js, so the choice stays in a single spot.
import type {
  CreateDocumentPayload,
  DocumentRecord,
  VerificationResult,
} from '../../../shared/types.js';
import type { TamperPayload } from '../../../shared/validation.js';
import * as realApi from './api.js';
import { createDemoApi, type DemoApi } from './demoApi.js';

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

let demo: DemoApi | null = null;
function demoApi(): DemoApi {
  return (demo ??= createDemoApi());
}

export async function fetchDocuments(): Promise<DocumentRecord[]> {
  return isDemoMode ? demoApi().fetchDocuments() : realApi.fetchDocuments();
}

export async function fetchDocumentById(id: string): Promise<DocumentRecord> {
  return isDemoMode ? demoApi().fetchDocumentById(id) : realApi.fetchDocumentById(id);
}

export async function createDocument(payload: CreateDocumentPayload): Promise<DocumentRecord> {
  return isDemoMode ? demoApi().createDocument(payload) : realApi.createDocument(payload);
}

export async function signDocument(documentId: string, signerId: string): Promise<DocumentRecord> {
  return isDemoMode ? demoApi().signDocument(documentId, signerId) : realApi.signDocument(documentId, signerId);
}

export async function verifyDocument(documentId: string): Promise<VerificationResult> {
  return isDemoMode ? demoApi().verifyDocument(documentId) : realApi.verifyDocument(documentId);
}

export async function simulateTamper(documentId: string, tamper: TamperPayload): Promise<DocumentRecord> {
  return isDemoMode ? demoApi().simulateTamper(documentId, tamper) : realApi.simulateTamper(documentId, tamper);
}

/** Only meaningful in demo mode; the real API has no browser-triggerable equivalent. */
export async function resetDemoData(): Promise<void> {
  if (isDemoMode) await demoApi().reset();
}
