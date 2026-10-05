import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalSigning, type LocalSigningWorkspace } from '../local/LocalSigning.js';
import { createIdentity, parseBundle, serializeBundle, signFile, verifyFile, type SignatureBundle } from '../local/signatures.js';
import { axe } from './axe.js';

const storage = vi.hoisted(() => {
  class WorkspaceConflictError extends Error { name = 'WorkspaceConflictError'; }
  return { load: vi.fn(), save: vi.fn(), download: vi.fn(), ConflictError: WorkspaceConflictError };
});
vi.mock('../local/workspace.js', () => ({ loadWorkspaceSnapshot: storage.load, saveWorkspace: storage.save, WorkspaceConflictError: storage.ConflictError }));
vi.mock('../local/files.js', () => ({ downloadFile: storage.download }));

function binaryFile(name = 'contract.bin', bytes = new Uint8Array([0, 255, 10, 128])): File {
  return new File([bytes], name, { type: 'application/octet-stream' });
}

function jsonFile(text: string, name = 'contract.signatures.json'): File {
  const file = new File([text], name, { type: 'application/json' });
  Object.defineProperty(file, 'text', { configurable: true, value: async () => text });
  return file;
}

async function fixture(): Promise<{ file: File; bundle: SignatureBundle }> {
  const file = binaryFile();
  return { file, bundle: await signFile(file, await createIdentity('Alice')) };
}

async function openWorkspace(data: LocalSigningWorkspace | null = null, revision = 0) {
  storage.load.mockResolvedValue({ data, revision });
  const view = render(<main><LocalSigning /></main>);
  await waitFor(() => expect(screen.queryByText('Loading your saved workspace.')).not.toBeInTheDocument());
  return view;
}

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  storage.load.mockReset(); storage.save.mockReset(); storage.download.mockReset();
  storage.save.mockImplementation((_data: unknown, options: { expectedRevision: number }) => Promise.resolve(options.expectedRevision + 1));
  sessionStorage.clear();
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('local signing workspace', () => {
  it('starts empty, identifies the storage boundary, and needs no sample data', async () => {
    await openWorkspace();
    expect(screen.getByText('Your data stays in this browser.')).toBeInTheDocument();
    expect(screen.getByText('0 saved bundles')).toBeInTheDocument();
    expect(screen.getByText('Signatures prove a file matches what a key signed. They do not prove who owns the key.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign file' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Verify file' })).toBeDisabled();
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('creates a non-extractable identity, signs binary bytes, and exports a public bundle', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    await user.type(screen.getByLabelText('Name for this signing key'), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Create identity' }));
    await screen.findByText('Signing identity created and saved in this browser.');
    expect(storage.save.mock.calls[0][0].identity.privateKey.extractable).toBe(false);
    expect(storage.save.mock.calls[0][1]).toEqual({ expectedRevision: 0 });
    expect(screen.getByText(/Changes saved/)).toBeInTheDocument();
    const file = binaryFile();
    await user.upload(screen.getByLabelText('Choose file'), file);
    await user.click(screen.getByRole('button', { name: 'Sign file' }));
    await screen.findByText('File and signatures verified');
    expect(screen.getByText('Signature valid')).toBeInTheDocument();
    const saved: LocalSigningWorkspace = storage.save.mock.calls.at(-1)?.[0];
    expect(storage.save.mock.calls.at(-1)?.[1]).toEqual({ expectedRevision: 1 });
    expect(saved.bundles).toHaveLength(1);
    expect(saved.bundles[0].file).toMatchObject({ name: file.name, size: file.size });
    expect(saved).not.toHaveProperty('file');
    expect(JSON.stringify(saved.bundles)).not.toContain('privateKey');
    await user.click(screen.getByRole('button', { name: 'Export bundle' }));
    const [filename, content, type] = storage.download.mock.calls[0];
    expect(filename).toBe('contract.bin.signatures.json');
    expect(type).toBe('application/json');
    expect((await verifyFile(file, parseBundle(content, filename))).matchesFile).toBe(true);
    expect(screen.queryByText('Keep a backup outside this browser')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Export public key' }));
    expect(JSON.parse(storage.download.mock.calls[1][1])).not.toHaveProperty('d');
    expect(screen.queryByRole('button', { name: /Export private/ })).not.toBeInTheDocument();
  });

  it('imports a bundle and verifies an original file without a signing identity', async () => {
    const user = userEvent.setup();
    const { file, bundle } = await fixture();
    await openWorkspace();
    await user.click(screen.getByRole('button', { name: 'Import bundle' }));
    const dialog = screen.getByRole('dialog', { name: 'Import signature bundle' });
    await user.upload(within(dialog).getByLabelText('Signature bundle JSON file'), jsonFile(serializeBundle(bundle)));
    await user.click(within(dialog).getByRole('button', { name: 'Import bundle' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Add signature' })).toBeDisabled();
    await user.upload(screen.getByLabelText('Choose file'), file);
    await user.click(screen.getByRole('button', { name: 'Verify file' }));
    await screen.findByText('File and signatures verified');
    expect(screen.getByText('Signature valid')).toBeInTheDocument();
    expect(storage.save.mock.calls[0][0]).not.toHaveProperty('identity');
  });

  it('keeps prior bundles when an import is malformed and reports its filename and field', async () => {
    const user = userEvent.setup();
    const { bundle } = await fixture();
    await openWorkspace({ version: 1, bundles: [bundle] });
    await user.click(screen.getByRole('button', { name: 'Import bundle' }));
    const dialog = screen.getByRole('dialog');
    await user.upload(within(dialog).getByLabelText('Signature bundle JSON file'), jsonFile('{"version":2}', 'broken.json'));
    await user.click(within(dialog).getByRole('button', { name: 'Import bundle' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('broken.json: version');
    expect(storage.save).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: bundle.file.name })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('1 saved bundle')).toBeInTheDocument();
  });

  it('traps import-dialog focus, closes with Escape, and restores the opener', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    const opener = screen.getByRole('button', { name: 'Import bundle' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Import bundle' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Close import dialog' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Import bundle' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('keeps the next Tab inside the import dialog after an invalid submission loses button focus', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    const opener = screen.getByRole('button', { name: 'Import bundle' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Import bundle' });
    const invalidFile = jsonFile('invalid json', 'invalid.json');
    let rejectRead: (reason: Error) => void = () => {};
    Object.defineProperty(invalidFile, 'text', { configurable: true, value: () => new Promise<string>((_resolve, reject) => { rejectRead = reject; }) });
    await user.upload(within(dialog).getByLabelText('Signature bundle JSON file'), invalidFile);
    await user.click(submit);
    expect(within(dialog).getByRole('button', { name: 'Importing bundle' })).toBeDisabled();
    // Model native focus loss when the clicked submit button becomes disabled.
    submit.blur();
    rejectRead(new Error('invalid.json: JSON is invalid.'));
    await within(dialog).findByRole('alert');
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    opener.focus();
    expect(dialog).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(opener).toHaveFocus();
  });

  it('accepts a dropped binary file and detects changed bytes through the verifier', async () => {
    const user = userEvent.setup();
    const { file, bundle } = await fixture();
    const identity = await createIdentity('Bob');
    const { container } = await openWorkspace({ version: 1, identity, bundles: [bundle] });
    fireEvent.drop(container.querySelector('.local-dropzone')!, { dataTransfer: { files: [file] } });
    await user.click(screen.getByRole('button', { name: 'Verify file' }));
    await screen.findByText('File and signatures verified');
    await user.click(screen.getByRole('button', { name: 'Test changed bytes' }));
    await screen.findByText('Changed bytes do not match the bundle.');
    expect(screen.getByText('Signature valid for the recorded hash')).toBeInTheDocument();
    expect(storage.save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Verify file' }));
    await waitFor(() => expect(screen.queryByText('Changed bytes do not match the bundle.')).not.toBeInTheDocument());
    expect(screen.getByText('File and signatures verified')).toBeInTheDocument();
  });

  it('appends another party signature while retaining the original signed record', async () => {
    const user = userEvent.setup();
    const { file, bundle } = await fixture();
    const identity = await createIdentity('Bob');
    await openWorkspace({ version: 1, identity, bundles: [bundle] });
    await user.upload(screen.getByLabelText('Choose file'), file);
    await user.click(screen.getByRole('button', { name: 'Add signature' }));
    await screen.findByText('Signature added and saved.');
    expect(screen.getAllByText('Signature valid')).toHaveLength(2);
    const saved: LocalSigningWorkspace = storage.save.mock.calls[0][0];
    expect(saved.bundles[0].signatures).toHaveLength(2);
    expect(saved.bundles[0].signatures[0]).toEqual(bundle.signatures[0]);
    expect(saved.bundles[0].signatures[1].signer).toBe('Bob');
  });

  it('requires selecting the original file again after returning to a stored bundle', async () => {
    const user = userEvent.setup();
    const { file, bundle } = await fixture();
    await openWorkspace({ version: 1, bundles: [bundle] });
    await user.upload(screen.getByLabelText('Choose file'), file);
    await user.click(screen.getByRole('button', { name: 'Verify file' }));
    await screen.findByText('File and signatures verified');
    await user.click(screen.getByRole('button', { name: bundle.file.name }));
    expect(screen.getByRole('button', { name: 'Verify file' })).toBeDisabled();
    expect(screen.getByLabelText('Choose file')).toHaveValue('');
    expect(screen.queryByText('File and signatures verified')).not.toBeInTheDocument();
  });

  it('keeps a signed session bundle exportable if browser storage rejects the write', async () => {
    const user = userEvent.setup();
    const identity = await createIdentity('Alice');
    await openWorkspace({ version: 1, identity, bundles: [] });
    storage.save.mockRejectedValue(new Error('Storage quota exceeded.'));
    await user.upload(screen.getByLabelText('Choose file'), binaryFile());
    await user.click(screen.getByRole('button', { name: 'Sign file' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Browser storage could not save this change.');
    expect(screen.getByText('1 session bundle')).toBeInTheDocument();
    expect(screen.getByText('Signature added for this session. Export the bundle to keep it.')).toBeInTheDocument();
    expect(screen.queryByText(/Changes saved/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Export bundle' }));
    expect(storage.download).toHaveBeenCalledOnce();
  });

  it('blocks writes to unknown saved data while allowing session import and export', async () => {
    const user = userEvent.setup();
    const { bundle } = await fixture();
    storage.load.mockRejectedValue(new Error('Storage permission denied.'));
    render(<main><LocalSigning /></main>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Browser storage could not load your workspace.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create identity' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Import bundle' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Import bundle' }));
    const dialog = screen.getByRole('dialog');
    await user.upload(within(dialog).getByLabelText('Signature bundle JSON file'), jsonFile(serializeBundle(bundle)));
    await user.click(within(dialog).getByRole('button', { name: 'Import bundle' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(storage.save).not.toHaveBeenCalled();
    expect(screen.getByText('1 session bundle')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Export bundle' }));
    expect(storage.download).toHaveBeenCalledOnce();
  });

  it('recovers a readable private key and valid bundles without overwriting a damaged record', async () => {
    const user = userEvent.setup();
    const { file, bundle } = await fixture();
    const identity = await createIdentity('Bob');
    const broken = structuredClone(bundle);
    broken.file.sha256 = 'invalid';
    await openWorkspace({ version: 1, identity, bundles: [bundle, broken] });
    expect(screen.getByRole('alert')).toHaveTextContent('Browser storage changes are blocked to protect the saved signing key.');
    expect(screen.getByRole('button', { name: 'Create another identity' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export public key' })).toBeEnabled();
    await user.upload(screen.getByLabelText('Choose file'), file);
    await user.click(screen.getByRole('button', { name: 'Add signature' }));
    await screen.findByText('Signature added for this session. Export the bundle to keep it.');
    expect(screen.getAllByText('Signature valid')).toHaveLength(2);
    expect(storage.save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Export bundle' }));
    const exported = parseBundle(storage.download.mock.calls[0][1]);
    expect(exported.signatures[1].publicKeyJwk).toEqual(identity.publicKeyJwk);
    expect(identity.privateKey.extractable).toBe(false);
  });

  it('retries a failed read without losing an imported session bundle or creating a key', async () => {
    const user = userEvent.setup();
    const { bundle } = await fixture();
    const identity = await createIdentity('Saved signer');
    storage.load.mockRejectedValueOnce(new Error('Storage temporarily unavailable.')).mockResolvedValueOnce({ data: { version: 1, identity, bundles: [] }, revision: 4 });
    render(<main><LocalSigning /></main>);
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Import bundle' }));
    const dialog = screen.getByRole('dialog');
    await user.upload(within(dialog).getByLabelText('Signature bundle JSON file'), jsonFile(serializeBundle(bundle)));
    await user.click(within(dialog).getByRole('button', { name: 'Import bundle' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Retry reading saved workspace' }));
    await screen.findByText('Saved browser workspace loaded. Storage changes are available again.');
    expect(screen.getByText('Saved signer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create another identity' })).toBeEnabled();
    expect(screen.getByRole('button', { name: bundle.file.name })).toBeInTheDocument();
    expect(screen.getByText('1 session bundle')).toBeInTheDocument();
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('blocks stale writes after a cross-tab conflict, exports the session, and retries with the current saved key', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    await user.type(screen.getByLabelText('Name for this signing key'), 'Original signer');
    await user.click(screen.getByRole('button', { name: 'Create identity' }));
    await screen.findByText('Signing identity created and saved in this browser.');
    const file = binaryFile();
    await user.upload(screen.getByLabelText('Choose file'), file);
    await user.click(screen.getByRole('button', { name: 'Sign file' }));
    await screen.findByText('Signature added and saved.');
    const firstSaved: LocalSigningWorkspace = storage.save.mock.calls.at(-1)?.[0];
    const currentIdentity = await createIdentity('Current saved signer');
    storage.save.mockRejectedValueOnce(new storage.ConflictError());
    storage.load.mockResolvedValueOnce({ data: { ...firstSaved, identity: currentIdentity }, revision: 3 });
    await user.click(screen.getByRole('button', { name: 'Add signature' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Another tab changed the saved signing workspace.');
    expect(storage.save.mock.calls.at(-1)?.[1]).toEqual({ expectedRevision: 2 });
    expect(screen.getByRole('button', { name: 'Create another identity' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear workspace' })).toBeDisabled();
    expect(screen.queryByText(/Changes saved/)).not.toBeInTheDocument();
    expect(screen.getByText('1 session bundle')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Export bundle' }));
    const sessionBundle = parseBundle(storage.download.mock.calls[0][1]);
    expect(sessionBundle.signatures).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Retry reading saved workspace' }));
    await screen.findByText('Saved browser workspace loaded. Storage changes are available again.');
    expect(screen.getByText('Current saved signer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create another identity' })).toBeEnabled();
    expect(screen.getByText('2 signatures · 4 bytes')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Choose file'), file);
    await user.click(screen.getByRole('button', { name: 'Add signature' }));
    await screen.findByText('Signature added and saved.');
    const finalSaved: LocalSigningWorkspace = storage.save.mock.calls.at(-1)?.[0];
    expect(storage.save.mock.calls.at(-1)?.[1]).toEqual({ expectedRevision: 3 });
    expect(finalSaved.identity?.privateKey).toBe(currentIdentity.privateKey);
    expect(finalSaved.bundles[0].signatures).toHaveLength(3);
    expect(finalSaved.bundles[0].signatures[2].signer).toBe('Current saved signer');
    expect(screen.getAllByText('Signature valid')).toHaveLength(3);
  });

  it('preserves every saved signature when an older bundle for the same file is imported', async () => {
    const user = userEvent.setup();
    const { file, bundle } = await fixture();
    const both = await signFile(file, await createIdentity('Bob'), bundle);
    await openWorkspace({ version: 1, bundles: [both] });
    await user.click(screen.getByRole('button', { name: 'Import bundle' }));
    const dialog = screen.getByRole('dialog');
    await user.upload(within(dialog).getByLabelText('Signature bundle JSON file'), jsonFile(serializeBundle(bundle)));
    await user.click(within(dialog).getByRole('button', { name: 'Import bundle' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(storage.save.mock.calls[0][0].bundles[0].signatures).toEqual(both.signatures);
    expect(screen.getByText('2 signatures · 4 bytes')).toBeInTheDocument();
  });

  it('keeps the valid saved record when an imported signature has tampered signer metadata', async () => {
    const user = userEvent.setup();
    const { file, bundle } = await fixture();
    const forged = structuredClone(bundle);
    forged.signatures[0].signer = 'Forged signer';
    await openWorkspace({ version: 1, bundles: [bundle] });
    await user.click(screen.getByRole('button', { name: 'Import bundle' }));
    const dialog = screen.getByRole('dialog');
    await user.upload(within(dialog).getByLabelText('Signature bundle JSON file'), jsonFile(serializeBundle(forged)));
    await user.click(within(dialog).getByRole('button', { name: 'Import bundle' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const saved: LocalSigningWorkspace = storage.save.mock.calls[0][0];
    expect(saved.bundles[0].signatures[0]).toEqual(bundle.signatures[0]);
    expect(saved.bundles[0].signatures).toHaveLength(2);
    await user.upload(screen.getByLabelText('Choose file'), file);
    await user.click(screen.getByRole('button', { name: 'Verify file' }));
    await screen.findByText('Verification failed');
    expect(screen.getByText('Signature valid')).toBeInTheDocument();
    expect(screen.getByText('Signature fails')).toBeInTheDocument();
  });

  it('rejects an oversized signature bundle before reading its contents', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    await user.click(screen.getByRole('button', { name: 'Import bundle' }));
    const dialog = screen.getByRole('dialog');
    const oversized = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'oversized.json', { type: 'application/json' });
    const read = vi.fn();
    Object.defineProperty(oversized, 'text', { value: read });
    await user.upload(within(dialog).getByLabelText('Signature bundle JSON file'), oversized);
    await user.click(within(dialog).getByRole('button', { name: 'Import bundle' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('oversized.json: signature bundle must be at most 2 MiB.');
    expect(read).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('confirms clearing bundles and preserves the non-extractable signing key', async () => {
    const user = userEvent.setup();
    const { bundle } = await fixture();
    const identity = await createIdentity('Bob');
    await openWorkspace({ version: 1, identity, bundles: [bundle] });
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(screen.getByRole('button', { name: 'Clear workspace' }));
    expect(storage.save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Clear workspace' }));
    await screen.findByText('Signature bundles cleared. Your signing identity was kept.');
    expect(confirmation).toHaveBeenCalledWith(expect.stringContaining('Export the bundles you need first.'));
    expect(storage.save.mock.calls[0][0]).toEqual({ version: 1, identity, bundles: [] });
    expect(screen.getByText('0 saved bundles')).toBeInTheDocument();
  });

  it('does not replace a private signing key when the replacement is cancelled', async () => {
    const user = userEvent.setup();
    const identity = await createIdentity('Alice');
    await openWorkspace({ version: 1, identity, bundles: [] });
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: 'Create another identity' }));
    await user.type(screen.getByLabelText('Name for this signing key'), 'Bob');
    await user.click(screen.getByRole('button', { name: 'Create identity' }));
    expect(confirmation).toHaveBeenCalledWith(expect.stringContaining('cannot be recovered'));
    expect(storage.save).not.toHaveBeenCalled();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('has no axe violations in the empty workspace, signed result, and import dialog', async () => {
    const user = userEvent.setup();
    const { file, bundle } = await fixture();
    const { container, unmount } = await openWorkspace();
    expect(await axe(container)).toHaveNoViolations();
    unmount();
    const signed = await openWorkspace({ version: 1, bundles: [bundle] });
    await user.upload(screen.getByLabelText('Choose file'), file);
    await user.click(screen.getByRole('button', { name: 'Verify file' }));
    await screen.findByText('File and signatures verified');
    expect(await axe(signed.container)).toHaveNoViolations();
    await user.click(screen.getByRole('button', { name: 'Import bundle' }));
    expect(await axe(signed.container)).toHaveNoViolations();
    for (const region of signed.container.querySelectorAll('.local-bundle-scroll, .modal-body')) {
      expect(region).toHaveAttribute('role', 'region');
      expect(region).toHaveAttribute('tabindex', '0');
      expect(region.getAttribute('aria-label')).toBeTruthy();
    }
  });
});
