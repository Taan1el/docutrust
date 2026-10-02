import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.js';
import type { VerificationResult } from '../../../shared/types.js';

const mockDoc = {
  id: 'doc_test123',
  title: 'Consulting Services Agreement',
  content: 'The Consultant agrees to provide security architecture advice.',
  contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  status: 'PARTIALLY_SIGNED' as const,
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
      keyFingerprint: '0123456789abcdef0123456789abcdef',
    },
  ],
  verifiedAt: '2026-09-10T12:35:00Z',
};

describe('DocuTrust dashboard', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let verification: VerificationResult;

  beforeEach(() => {
    verification = mockVerification;
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const respond = (data: unknown) =>
        Promise.resolve({ json: () => Promise.resolve({ success: true, data }) });
      if (url.includes('/verify')) return respond(verification);
      if (url.includes('/sign') && init?.method === 'POST') return respond(mockDoc);
      if (url.includes('/tamper') && init?.method === 'POST') return respond(mockDoc);
      if (url.includes('/api/documents/doc_test123')) return respond(mockDoc);
      if (url.includes('/api/documents') && init?.method === 'POST') return respond(mockDoc);
      if (url.includes('/api/documents')) return respond([mockDoc]);
      return respond({});
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  /** Waits for the list, detail and verify fetch chain to settle so later steps see stable state. */
  async function renderAndSettle() {
    render(<App />);
    await screen.findByText(/Seal intact/);
  }

  const postsTo = (suffix: string) =>
    fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith(suffix) && init?.method === 'POST');

  it('renders the brand heading, the subtitle and the primary action', async () => {
    await renderAndSettle();

    expect(screen.getByRole('heading', { level: 1, name: 'DocuTrust' })).toBeInTheDocument();
    expect(screen.getByText(/ECDSA keys and checked for edits/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New agreement' })).toBeInTheDocument();
  });

  it('summarizes the loaded agreements in a one-line tally with a signature meter', async () => {
    await renderAndSettle();

    expect(screen.getByText('1 agreement, 0 fully signed, 1 waiting on signers')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Signatures collected' })).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByRole('meter', { name: 'Signatures collected' }).parentElement).toHaveTextContent('1 / 2');
  });

  it('lists agreements with real buttons and shows the selected agreement text', async () => {
    await renderAndSettle();

    const table = screen.getByRole('complementary', { name: 'Agreements' });
    const row = within(table).getByRole('button', { name: 'Consulting Services Agreement' });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(within(table).getByText('Partially signed')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Agreement text' })).getByText(/security architecture advice/)).toBeInTheDocument();
    expect(screen.getAllByText('Oliver Mets').length).toBeGreaterThanOrEqual(1);
  });

  it('opens the create dialog with labeled fields, rejects an empty submit and closes on Escape', async () => {
    await renderAndSettle();

    fireEvent.click(screen.getByRole('button', { name: 'New agreement' }));
    const dialog = screen.getByRole('dialog', { name: 'New agreement' });
    expect(within(dialog).getByLabelText('Title')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Agreement text')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Signer 1 full name')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Signer 1 email address')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create and hash agreement' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter a title and the agreement text.');
    expect(postsTo('/api/documents')).toHaveLength(0);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('creates an agreement through the API and closes the dialog', async () => {
    const user = userEvent.setup();
    await renderAndSettle();

    await user.click(screen.getByRole('button', { name: 'New agreement' }));
    const dialog = screen.getByRole('dialog', { name: 'New agreement' });
    await user.type(within(dialog).getByLabelText('Title'), 'NDA');
    await user.type(within(dialog).getByLabelText('Agreement text'), 'Keep it quiet.');
    await user.type(within(dialog).getByLabelText('Signer 1 full name'), 'Mari Kask');
    await user.type(within(dialog).getByLabelText('Signer 1 email address'), 'mari@example.ee');
    await user.click(within(dialog).getByRole('button', { name: 'Create and hash agreement' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [, init] = postsTo('/api/documents')[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      title: 'NDA',
      signers: [{ name: 'Mari Kask', email: 'mari@example.ee' }],
    });
  });

  it('signs as a pending signer after confirming in the dialog', async () => {
    await renderAndSettle();

    fireEvent.click(screen.getByRole('button', { name: 'Sign as Liis Tamm' }));
    const dialog = screen.getByRole('dialog', { name: 'Sign agreement' });
    expect(within(dialog).getByText(mockDoc.contentHash)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign with a new key' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [, init] = postsTo('/api/documents/doc_test123/sign')[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({ signerId: 'sig_1' });
  });

  it('cancels the sign dialog without calling the API', async () => {
    await renderAndSettle();

    fireEvent.click(screen.getByRole('button', { name: 'Sign as Liis Tamm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(postsTo('/api/documents/doc_test123/sign')).toHaveLength(0);
  });

  it('shows the tamper tester beside the result, prefilled with the current title', async () => {
    await renderAndSettle();

    expect(screen.getByRole('heading', { name: 'Tamper tester' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Verification result' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Consulting Services Agreement');
    expect(screen.getByText('Signature valid')).toBeInTheDocument();
  });

  it('refuses to write an unchanged document', async () => {
    await renderAndSettle();

    fireEvent.click(screen.getByRole('button', { name: 'Write edit without re-signing' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Change the title or the content first.');
    expect(postsTo('/api/documents/doc_test123/tamper')).toHaveLength(0);
  });

  it('writes a title edit, re-verifies, and reports a broken seal', async () => {
    const user = userEvent.setup();
    await renderAndSettle();

    verification = {
      ...mockVerification,
      isValid: false,
      isTampered: true,
      currentHash: 'aa'.repeat(32),
      signerVerifications: [
        { ...mockVerification.signerVerifications[0], isSignatureValid: false, error: 'Hash mismatch' },
      ],
    };

    const title = screen.getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Consulting Services Agreement v2');
    await user.click(screen.getByRole('button', { name: 'Write edit without re-signing' }));

    await screen.findByText(/Seal broken/);
    const [, init] = postsTo('/api/documents/doc_test123/tamper')[0];
    expect(JSON.parse(String(init?.body))).toEqual({ tamperedTitle: 'Consulting Services Agreement v2' });
    expect(screen.getByText('Signature fails')).toBeInTheDocument();
  });

  it('appends an altered clause to the tamper text with the helper button', async () => {
    await renderAndSettle();

    fireEvent.click(screen.getByRole('button', { name: 'Append altered clause' }));

    expect((screen.getByLabelText('Text') as HTMLTextAreaElement).value).toContain('Added after signing');
  });

  it('shows the audit trail and the full hashes in the result', async () => {
    await renderAndSettle();

    expect(screen.getByText('DOCUMENT_CREATED')).toBeInTheDocument();
    expect(screen.getAllByText(mockVerification.expectedHash).length).toBeGreaterThanOrEqual(2);
  });

  it('shows an alert when the agreements cannot be loaded', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ json: () => Promise.resolve({ success: false, error: 'Database unavailable' }) })
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
  });
});
