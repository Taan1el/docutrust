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

  it('renders application brand title and create button', async () => {
    render(<App />);

    expect(screen.getByText('DocuTrust')).toBeInTheDocument();
    expect(screen.getByText('PKI Digital Signatures & Tamper Verification')).toBeInTheDocument();
    expect(screen.getByText('New Agreement')).toBeInTheDocument();
  });

  it('displays document list and agreement parchment view', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Consulting Services Agreement').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/The Consultant agrees to provide security architecture advice/i)).toBeInTheDocument();
      expect(screen.getAllByText('Liis Tamm').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Oliver Mets').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('opens and closes the Create Agreement modal', async () => {
    render(<App />);

    const newBtn = screen.getByText('New Agreement');
    fireEvent.click(newBtn);

    expect(screen.getByText('Draft New Cryptographic Agreement')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e.g. Master Services Agreement/i)).toBeInTheDocument();

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByText('Draft New Cryptographic Agreement')).not.toBeInTheDocument();
    });
  });

  it('opens and closes the Digital Signing ceremony modal', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Execute Digital Signature')).toBeInTheDocument();
    });

    const signBtn = screen.getByText('Execute Digital Signature');
    fireEvent.click(signBtn);

    expect(screen.getByText('Digital Signing Ceremony (Smart-ID / e-ID)')).toBeInTheDocument();
    expect(screen.getByText('Sign Agreement')).toBeInTheDocument();

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByText('Digital Signing Ceremony (Smart-ID / e-ID)')).not.toBeInTheDocument();
    });
  });

  it('opens and closes the Tamper Simulator modal', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Simulate Tampering')).toBeInTheDocument();
    });

    const tamperBtn = screen.getByText('Simulate Tampering');
    fireEvent.click(tamperBtn);

    expect(screen.getByText('Tamper Detection Simulator')).toBeInTheDocument();
    expect(screen.getByText('+ Inject Malicious Clause')).toBeInTheDocument();

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByText('Tamper Detection Simulator')).not.toBeInTheDocument();
    });
  });
});
