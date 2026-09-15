import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App.js';

const mockDoc = {
  id: 'doc_test123',
  title: 'Consulting Services Agreement',
  content: 'The Consultant agrees to provide security architecture advice.',
  contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  status: 'PENDING_SIGNATURES' as const,
  createdAt: '2026-09-10T12:00:00Z',
  updatedAt: '2026-09-10T12:00:00Z',
  signers: [
    {
      id: 'sig_1',
      documentId: 'doc_test123',
      name: 'Liis Tamm',
      email: 'liis@consult.ee',
      role: 'Principal Consultant',
      status: 'PENDING' as const,
    },
    {
      id: 'sig_2',
      documentId: 'doc_test123',
      name: 'Oliver Mets',
      email: 'oliver@client.ee',
      role: 'Chief Technology Officer',
      status: 'SIGNED' as const,
      publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----',
      signatureHex: '3045022100a98f71',
      signedAt: '2026-09-10T12:30:00Z',
    },
  ],
  auditTrail: [
    {
      id: 'aud_1',
      documentId: 'doc_test123',
      action: 'DOCUMENT_CREATED',
      actorName: 'Liis Tamm',
      details: {},
      timestamp: '2026-09-10T12:00:00Z',
    },
  ],
};

const mockVerification = {
  documentId: 'doc_test123',
  isValid: true,
  isTampered: false,
  currentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  expectedHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  signerVerifications: [
    {
      signerId: 'sig_2',
      name: 'Oliver Mets',
      email: 'oliver@client.ee',
      hasSigned: true,
      isSignatureValid: true,
    },
  ],
  verifiedAt: '2026-09-10T12:35:00Z',
};

describe('DocuTrust Client Dashboard Component', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/api/documents/doc_test123/verify')) {
          return Promise.resolve({
            json: () => Promise.resolve({ success: true, data: mockVerification }),
          });
        }
        if (url.includes('/api/documents/doc_test123')) {
          return Promise.resolve({
            json: () => Promise.resolve({ success: true, data: mockDoc }),
          });
        }
        if (url.includes('/api/documents')) {
          return Promise.resolve({
            json: () => Promise.resolve({ success: true, data: [mockDoc] }),
          });
        }
        if (url.includes('/api/health')) {
          return Promise.resolve({
            json: () => Promise.resolve({ status: 'healthy', service: 'docutrust-engine' }),
          });
        }
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, data: {} }),
        });
      })
    );
  });

  /** Waits for the create/list/verify fetch chain to settle so later tests do not see stray state updates. */
  async function renderAndSettle() {
    render(<App />);
    await screen.findByText('All Signatures Valid & Seal Intact');
  }

  it('renders the application brand heading and create button', async () => {
    await renderAndSettle();

    expect(screen.getByRole('heading', { name: 'DocuTrust' })).toBeInTheDocument();
    expect(screen.getByText('Asymmetric Digital Signatures & Tamper Detection')).toBeInTheDocument();
    expect(screen.getByText('New Agreement')).toBeInTheDocument();
  });

  it('displays the document list and agreement view', async () => {
    await renderAndSettle();

    expect(screen.getAllByText('Consulting Services Agreement').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/The Consultant agrees to provide security architecture advice/i)).toBeInTheDocument();
    expect(screen.getAllByText('Liis Tamm').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Oliver Mets').length).toBeGreaterThanOrEqual(1);
  });

  it('selects a document from the list with a real button, so it is reachable by keyboard', async () => {
    await renderAndSettle();

    const listEntry = screen.getByRole('option', { name: /Consulting Services Agreement/ });
    expect(listEntry.tagName).toBe('BUTTON');
    expect(listEntry).toHaveAttribute('aria-selected', 'true');
  });

  it('opens the Create Agreement modal with labeled fields, and closes it on Escape', async () => {
    await renderAndSettle();

    fireEvent.click(screen.getByText('New Agreement'));

    expect(screen.getByRole('dialog', { name: 'Draft New Agreement' })).toBeInTheDocument();
    expect(screen.getByLabelText('Document Title:')).toBeInTheDocument();
    expect(screen.getByLabelText('Agreement Content / Terms:')).toBeInTheDocument();
    expect(screen.getByLabelText('Signer 1 full name')).toBeInTheDocument();
    expect(screen.getByLabelText('Signer 1 email address')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Draft New Agreement' })).not.toBeInTheDocument();
    });
  });

  it('opens and closes the sign modal from a signer card', async () => {
    await renderAndSettle();

    fireEvent.click(screen.getByText('Execute Digital Signature'));

    expect(screen.getByRole('dialog', { name: 'Sign Agreement' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm & Sign' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Sign Agreement' })).not.toBeInTheDocument();
    });
  });

  it('opens the tamper simulator with the current title and content prefilled', async () => {
    await renderAndSettle();

    fireEvent.click(screen.getByText('Simulate Tampering'));

    const dialog = screen.getByRole('dialog', { name: 'Tamper Detection Simulator' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText('Title:')).toHaveValue('Consulting Services Agreement');
    expect(screen.getByText('+ Inject Malicious Clause')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Tamper Detection Simulator' })).not.toBeInTheDocument();
    });
  });
});
