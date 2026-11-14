import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalSigning, type LocalSigningWorkspace } from '../local/LocalSigning.js';
import { createIdentity, keyFingerprint, parseBundle, serializeBundle, signFile, verifyFile, type SignatureBundle } from '../local/signatures.js';
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

afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'storage');
});

function stubStorageManager(persisted: boolean, persist: boolean) {
  const manager = { persist: vi.fn().mockResolvedValue(persist), persisted: vi.fn().mockResolvedValue(persisted) };
  Object.defineProperty(navigator, 'storage', { configurable: true, value: manager });
  return manager;
}

describe('local signing workspace', () => {
  it('starts empty, identifies the storage boundary, and needs no sample data', async () => {
    await openWorkspace();
    expect(screen.getByText('Your data stays in this browser.')).toBeInTheDocument();
    expect(screen.getByText('0 saved bundles')).toBeInTheDocument();
    expect(screen.getByText(/Signatures prove a file matches what a key signed\. They do not prove who owns the key\. Compare the key fingerprint with the signer through another channel/)).toBeInTheDocument();
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
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Create another identity' }));
    await user.type(screen.getByLabelText('Name for this signing key'), 'Second signer');
    await user.click(screen.getByRole('button', { name: 'Create identity' }));
    await screen.findByText('Signing identity created and saved in this browser.');
    const currentIdentity = await createIdentity('Current saved signer');
    storage.save.mockRejectedValueOnce(new storage.ConflictError());
    storage.load.mockResolvedValueOnce({ data: { ...firstSaved, identity: currentIdentity }, revision: 3 });
    await user.click(screen.getByRole('button', { name: 'Add signature' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Another tab changed the saved signing workspace.');
    expect(storage.save.mock.calls.at(-1)?.[1]).toEqual({ expectedRevision: 3 });
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

  it('verifies a renamed copy by its bytes and shows the name difference as a separate notice', async () => {
    const user = userEvent.setup();
    const { bundle } = await fixture();
    await openWorkspace({ version: 1, bundles: [bundle] });
    await user.upload(screen.getByLabelText('Choose file'), binaryFile('renamed-copy.bin'));
    await user.click(screen.getByRole('button', { name: 'Verify file' }));
    await screen.findByText('File and signatures verified');
    expect(screen.getByText('File size and bytes match the bundle.')).toBeInTheDocument();
    expect(screen.getByText('File name differs from the signed name: contract.bin')).toBeInTheDocument();
  });

  it('says whether the size or the content differs when verification fails', async () => {
    const user = userEvent.setup();
    const { bundle } = await fixture();
    await openWorkspace({ version: 1, bundles: [bundle] });
    await user.upload(screen.getByLabelText('Choose file'), binaryFile('contract.bin', new Uint8Array([1, 2, 3])));
    await user.click(screen.getByRole('button', { name: 'Verify file' }));
    await screen.findByText('Verification failed');
    expect(screen.getByText('File size differs: the selected file is 3 bytes and the bundle expects 4 bytes.')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Choose file'), binaryFile('contract.bin', new Uint8Array([9, 9, 9, 9])));
    await user.click(screen.getByRole('button', { name: 'Verify file' }));
    await screen.findByText('File content differs: the SHA-256 hash of the selected file does not match the bundle.');
    expect(screen.queryByText(/File name differs/)).not.toBeInTheDocument();
  });

  it('starts a new bundle when the chosen file does not match the auto-selected saved bundle', async () => {
    const user = userEvent.setup();
    const { bundle } = await fixture();
    const identity = await createIdentity('Bob');
    await openWorkspace({ version: 1, identity, bundles: [bundle] });
    expect(screen.getByRole('button', { name: 'Add signature' })).toBeDisabled();
    await user.upload(screen.getByLabelText('Choose file'), binaryFile('another.bin', new Uint8Array([7, 7, 7])));
    await user.click(screen.getByRole('button', { name: 'Add signature' }));
    await screen.findByText(/This file does not match the selected bundle, so a new bundle was started for it\./);
    const saved: LocalSigningWorkspace = storage.save.mock.calls[0][0];
    expect(saved.bundles).toHaveLength(2);
    expect(saved.bundles[0].file).toMatchObject({ name: 'another.bin', size: 3 });
    expect(saved.bundles[0].signatures).toHaveLength(1);
    expect(saved.bundles[1]).toEqual(bundle);
    expect(screen.getByRole('heading', { name: 'another.bin' })).toBeInTheDocument();
    expect(screen.getByText(/another\.bin/, { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('File and signatures verified')).toBeInTheDocument();
  });

  it('adds the signature to the saved bundle whose hash matches the chosen file', async () => {
    const user = userEvent.setup();
    const { bundle } = await fixture();
    const otherFile = binaryFile('other.bin', new Uint8Array([5, 5]));
    const other = await signFile(otherFile, await createIdentity('Alice'));
    const identity = await createIdentity('Bob');
    await openWorkspace({ version: 1, identity, bundles: [bundle, other] });
    await user.upload(screen.getByLabelText('Choose file'), binaryFile('other-renamed.bin', new Uint8Array([5, 5])));
    await user.click(screen.getByRole('button', { name: 'Add signature' }));
    await screen.findByText(/This file matches the saved bundle for other\.bin, so the signature was added there\./);
    const saved: LocalSigningWorkspace = storage.save.mock.calls[0][0];
    expect(saved.bundles).toHaveLength(2);
    expect(saved.bundles[0].file.name).toBe('other.bin');
    expect(saved.bundles[0].signatures).toHaveLength(2);
    expect(saved.bundles[1]).toEqual(bundle);
    expect(screen.getByText(/The file name differs from the signed name/)).toBeInTheDocument();
  });

  it('signs a file that already has a saved bundle without losing its signatures when no bundle is selected', async () => {
    const user = userEvent.setup();
    const { file, bundle } = await fixture();
    const identity = await createIdentity('Bob');
    await openWorkspace({ version: 1, identity, bundles: [bundle] });
    await user.click(screen.getByRole('button', { name: 'Start another file' }));
    await user.upload(screen.getByLabelText('Choose file'), file);
    await user.click(screen.getByRole('button', { name: 'Sign file' }));
    await screen.findByText(/This file matches the saved bundle for contract\.bin/);
    const saved: LocalSigningWorkspace = storage.save.mock.calls[0][0];
    expect(saved.bundles).toHaveLength(1);
    expect(saved.bundles[0].signatures).toHaveLength(2);
    expect(saved.bundles[0].signatures[0]).toEqual(bundle.signatures[0]);
  });

  it('shows the key fingerprint for the identity, every signature and the verification result', async () => {
    const user = userEvent.setup();
    const { file, bundle } = await fixture();
    const identity = await createIdentity('Bob');
    await openWorkspace({ version: 1, identity, bundles: [bundle] });
    const aliceKey = await keyFingerprint(bundle.signatures[0].publicKeyJwk);
    const bobKey = await keyFingerprint(identity.publicKeyJwk);
    const grouped = (value: string) => value.match(/.{1,4}/g)!.join(' ');
    expect(await screen.findAllByText(grouped(aliceKey))).toHaveLength(1);
    expect(await screen.findByText(grouped(bobKey))).toHaveClass('mono');
    await user.upload(screen.getByLabelText('Choose file'), file);
    await user.click(screen.getByRole('button', { name: 'Verify file' }));
    await screen.findByText('File and signatures verified');
    expect(await screen.findAllByText(grouped(aliceKey))).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Copy key fingerprint for Alice' }));
    expect(await navigator.clipboard.readText()).toBe(aliceKey);
    await screen.findByText('Key fingerprint copied.');
    await user.click(screen.getByRole('button', { name: 'Copy key fingerprint for Bob' }));
    expect(await navigator.clipboard.readText()).toBe(bobKey);
  });

  it('refuses a second signature by the same key with a clear message', async () => {
    const user = userEvent.setup();
    const { file, bundle } = await fixture();
    const alice = await createIdentity('Alice');
    const signed = await signFile(file, alice);
    await openWorkspace({ version: 1, identity: alice, bundles: [signed] });
    expect(bundle.signatures).toHaveLength(1);
    await user.upload(screen.getByLabelText('Choose file'), file);
    await user.click(screen.getByRole('button', { name: 'Add signature' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This signing key has already signed this file.');
    expect(storage.save).not.toHaveBeenCalled();
    expect(screen.getByText('1 signature · 4 bytes')).toBeInTheDocument();
  });

  it('rejects a file over the limit with a specific message and keeps no file selected', async () => {
    const user = userEvent.setup();
    const identity = await createIdentity('Alice');
    await openWorkspace({ version: 1, identity, bundles: [] });
    expect(screen.getByText(/Files up to 128 MiB\./)).toBeInTheDocument();
    const big = binaryFile('huge.iso');
    Object.defineProperty(big, 'size', { value: 128 * 1024 * 1024 + 1 });
    const read = vi.fn();
    Object.defineProperty(big, 'arrayBuffer', { value: read });
    await user.upload(screen.getByLabelText('Choose file'), big);
    expect(await screen.findByRole('alert')).toHaveTextContent('huge.iso is 128.1 MiB. Files can be at most 128 MiB');
    expect(screen.getByRole('button', { name: 'Sign file' })).toBeDisabled();
    expect(screen.queryByText(/selected in memory/)).not.toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
  });

  it('shows a busy state while hashing and reads the file once to sign it', async () => {
    const user = userEvent.setup();
    const identity = await createIdentity('Alice');
    await openWorkspace({ version: 1, identity, bundles: [] });
    const file = binaryFile();
    let release: (bytes: ArrayBuffer) => void = () => undefined;
    const read = vi.fn(() => new Promise<ArrayBuffer>((resolve) => { release = resolve; }));
    Object.defineProperty(file, 'arrayBuffer', { value: read });
    await user.upload(screen.getByLabelText('Choose file'), file);
    await user.click(screen.getByRole('button', { name: 'Sign file' }));
    expect(await screen.findByText('Reading and hashing the file in this browser.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Working' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Verify file' })).toBeDisabled();
    release(new Uint8Array([0, 255, 10, 128]).buffer);
    await screen.findByText('Signature added and saved.');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('asks the browser to keep storage when an identity is created and says what it answered', async () => {
    const user = userEvent.setup();
    const manager = stubStorageManager(false, false);
    await openWorkspace();
    await user.type(screen.getByLabelText('Name for this signing key'), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Create identity' }));
    await screen.findByText('Signing identity created and saved in this browser.');
    expect(manager.persist).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/This browser may clear the key under storage pressure\./)).toBeInTheDocument();
    expect(screen.queryByText(/Storage is marked persistent/)).not.toBeInTheDocument();
  });

  it('reports persistent storage when the browser grants it', async () => {
    const user = userEvent.setup();
    const manager = stubStorageManager(true, true);
    await openWorkspace();
    await user.type(screen.getByLabelText('Name for this signing key'), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Create identity' }));
    expect(await screen.findByText('Storage is marked persistent for this site.')).toBeInTheDocument();
    expect(manager.persist).toHaveBeenCalledTimes(1);
  });

  it('reads the persistence state for a saved identity without asking again', async () => {
    const manager = stubStorageManager(true, true);
    await openWorkspace({ version: 1, identity: await createIdentity('Alice'), bundles: [] });
    expect(await screen.findByText('Storage is marked persistent for this site.')).toBeInTheDocument();
    expect(manager.persist).not.toHaveBeenCalled();
  });

  it('works and says so when the browser cannot report persistence', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    await user.type(screen.getByLabelText('Name for this signing key'), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Create identity' }));
    expect(await screen.findByText(/does not report whether storage is persistent/)).toBeInTheDocument();
    expect(storage.save).toHaveBeenCalled();
  });

  it('deletes one saved bundle after confirmation and keeps the others and the identity', async () => {
    const user = userEvent.setup();
    const { bundle } = await fixture();
    const other = await signFile(binaryFile('other.bin', new Uint8Array([5, 5])), await createIdentity('Carol'));
    const identity = await createIdentity('Bob');
    await openWorkspace({ version: 1, identity, bundles: [bundle, other] });
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(screen.getByRole('button', { name: 'Delete bundle' }));
    expect(storage.save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete bundle' }));
    await screen.findByText('Bundle deleted. Your signing identity was kept.');
    expect(confirmation).toHaveBeenCalledWith(expect.stringContaining('contract.bin'));
    expect(storage.save.mock.calls[0][0]).toEqual({ version: 1, identity, bundles: [other] });
    expect(screen.getByText('1 saved bundle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete bundle' })).toBeDisabled();
  });

  it('shows an invalid imported signature as invalid, still signs, and lets the user remove it', async () => {
    const user = userEvent.setup();
    const { file, bundle } = await fixture();
    const forged = structuredClone(bundle);
    forged.signatures[0].signer = 'Forged signer';
    const identity = await createIdentity('Bob');
    await openWorkspace({ version: 1, identity, bundles: [forged] });
    expect(await screen.findByText('Invalid signature. It does not authenticate this file.')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Choose file'), file);
    await user.click(screen.getByRole('button', { name: 'Add signature' }));
    await screen.findByText('Signature added and saved.');
    expect(storage.save.mock.calls[0][0].bundles[0].signatures).toHaveLength(2);
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(await screen.findByRole('button', { name: 'Remove invalid signature by Forged signer' }));
    await screen.findByText('Invalid signature removed.');
    expect(confirmation).toHaveBeenCalledWith(expect.stringContaining('Forged signer'));
    const saved: LocalSigningWorkspace = storage.save.mock.calls.at(-1)?.[0];
    expect(saved.bundles[0].signatures).toHaveLength(1);
    expect(saved.bundles[0].signatures[0].signer).toBe('Bob');
    expect(screen.queryByRole('button', { name: /Remove invalid signature/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Verify file' }));
    await screen.findByText('File and signatures verified');
  });

  it('removes a bundle whose only signature is invalid', async () => {
    const user = userEvent.setup();
    const { bundle } = await fixture();
    const forged = structuredClone(bundle);
    forged.signatures[0].signer = 'Forged signer';
    await openWorkspace({ version: 1, bundles: [forged] });
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(await screen.findByRole('button', { name: 'Remove invalid signature by Forged signer' }));
    await screen.findByText('Invalid signature removed with its empty bundle.');
    expect(confirmation).toHaveBeenCalledWith(expect.stringContaining('would be empty'));
    expect(storage.save.mock.calls[0][0].bundles).toEqual([]);
    expect(screen.getByText('0 saved bundles')).toBeInTheDocument();
  });

  it('has no axe violations with fingerprints, an invalid signature, a name notice and a size message', async () => {
    const user = userEvent.setup();
    stubStorageManager(false, false);
    const { bundle } = await fixture();
    const forged = structuredClone(bundle);
    forged.signatures[0].signer = 'Forged signer';
    const identity = await createIdentity('Bob');
    const view = await openWorkspace({ version: 1, identity, bundles: [forged] });
    await screen.findByText('Invalid signature. It does not authenticate this file.');
    await screen.findAllByText(/This browser may clear the key/);
    await user.upload(screen.getByLabelText('Choose file'), binaryFile('renamed.bin'));
    await user.click(screen.getByRole('button', { name: 'Verify file' }));
    await screen.findByText(/File name differs from the signed name/);
    expect(await axe(view.container)).toHaveNoViolations();
    await user.upload(screen.getByLabelText('Choose file'), binaryFile('short.bin', new Uint8Array([1])));
    await user.click(screen.getByRole('button', { name: 'Verify file' }));
    await screen.findByText(/File size differs/);
    expect(await axe(view.container)).toHaveNoViolations();
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
