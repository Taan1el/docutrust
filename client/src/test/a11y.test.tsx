import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.js';
import { axe } from './axe.js';
import type { VerificationResult } from '../../../shared/types.js';

const doc = {
  id: 'doc_a11y',
  title: 'Consulting Services Agreement',
  content: 'The Consultant agrees to provide security architecture advice.',
  contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  status: 'PARTIALLY_SIGNED' as const,
  createdAt: '2026-09-10T12:00:00Z',
  updatedAt: '2026-09-10T12:00:00Z',
  signers: [
    { id: 'sig_1', documentId: 'doc_a11y', name: 'Liis Tamm', email: 'liis@consult.ee', role: 'Principal Consultant', status: 'PENDING' as const },
    {
      id: 'sig_2', documentId: 'doc_a11y', name: 'Oliver Mets', email: 'oliver@client.ee', role: 'Chief Technology Officer',
      status: 'SIGNED' as const, publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFkw\n-----END PUBLIC KEY-----',
      signatureHex: '3045022100a98f71', signedAt: '2026-09-10T12:30:00Z',
    },
  ],
  auditTrail: [
    { id: 'aud_1', documentId: 'doc_a11y', action: 'DOCUMENT_CREATED', actorName: 'Liis Tamm', details: {}, timestamp: '2026-09-10T12:00:00Z' },
  ],
};

const baseVerification = {
  documentId: 'doc_a11y',
  isValid: true,
  isTampered: false,
  currentHash: doc.contentHash,
  expectedHash: doc.contentHash,
  signerVerifications: [
    { signerId: 'sig_2', name: 'Oliver Mets', email: 'oliver@client.ee', hasSigned: true, isSignatureValid: true, keyFingerprint: '0123456789abcdef0123456789abcdef' },
  ],
  verifiedAt: '2026-09-10T12:35:00Z',
};

let verification: VerificationResult = baseVerification;

describe('accessibility checks', () => {
  beforeEach(() => {
    verification = baseVerification;
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const respond = (data: unknown) => Promise.resolve({ json: () => Promise.resolve({ success: true, data }) });
      if (url.includes('/verify')) return respond(verification);
      if (url.includes('/api/documents/doc_a11y')) return respond(doc);
      if (url.includes('/api/documents') && init?.method === 'POST') return respond(doc);
      if (url.includes('/api/documents')) return respond([doc]);
      return respond({});
    }));
  });

  async function openApp() {
    const view = render(<App />);
    await screen.findByText(/Seal intact/);
    return view;
  }

  it('has no violations on the agreement sheet view', async () => {
    const { container } = await openApp();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations with the new agreement dialog open', async () => {
    const { container } = await openApp();
    await userEvent.click(screen.getByRole('button', { name: 'New agreement' }));
    expect(screen.getByRole('dialog', { name: 'New agreement' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations in the tamper tester after an edit breaks the seal', async () => {
    const { container } = await openApp();
    verification = {
      ...verification,
      isValid: false,
      isTampered: true,
      currentHash: 'aa'.repeat(32),
      signerVerifications: [{ ...verification.signerVerifications[0], isSignatureValid: false, error: 'Hash mismatch' }],
    };
    await userEvent.type(screen.getByLabelText('Title'), ' v2');
    await userEvent.click(screen.getByRole('button', { name: 'Write edit without re-signing' }));
    await screen.findByText(/Seal broken/);
    expect(await axe(container)).toHaveNoViolations();
  });
});
