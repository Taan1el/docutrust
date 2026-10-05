import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent, type RefObject } from 'react';
import { Check, Download, FileCheck2, FileUp, KeyRound, PenLine, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { formatTimestamp } from '../utils/format.js';
import { downloadFile } from './files.js';
import { loadWorkspaceSnapshot, saveWorkspace, WorkspaceConflictError } from './workspace.js';
import { createIdentity, MAX_BUNDLE_BYTES, parseBundle, serializeBundle, signFile, validatePublicKeyJwk, verifyFile, type SignatureBundle, type SigningIdentity } from './signatures.js';
import './signing.css';

export interface LocalSigningWorkspace {
  version: 1;
  identity?: SigningIdentity;
  bundles: SignatureBundle[];
}

type FileVerification = Awaited<ReturnType<typeof verifyFile>>;
const emptyWorkspace: LocalSigningWorkspace = { version: 1, bundles: [] };
const backupSessionKey = 'docutrust-backup-reminder';

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'The operation could not finish. Try again.';
}

function backupSeen(): boolean {
  try { return sessionStorage.getItem(backupSessionKey) === 'seen'; }
  catch { return false; }
}

function markBackupSeen(): void {
  try { sessionStorage.setItem(backupSessionKey, 'seen'); }
  catch { /* The signing workspace can still work when session storage is unavailable. */ }
}

function restoreWorkspace(value: unknown): { workspace: LocalSigningWorkspace; warnings: string[] } {
  if (value === null) return { workspace: emptyWorkspace, warnings: [] };
  const warnings: string[] = [];
  const saved = value && typeof value === 'object' ? value as Partial<LocalSigningWorkspace> : {};
  if (saved.version !== 1) warnings.push('Saved signing data has an unsupported version.');
  let identity: SigningIdentity | undefined;
  if (saved.identity !== undefined) {
    try {
      const candidate = saved.identity;
      const key = candidate?.privateKey;
      if (typeof candidate?.name !== 'string' || !candidate.name.trim()
        || key?.type !== 'private' || key.extractable !== false || key.algorithm?.name !== 'ECDSA'
        || (key.algorithm as EcKeyAlgorithm).namedCurve !== 'P-256' || !key.usages?.includes('sign')
        || typeof candidate.createdAt !== 'string' || !Number.isFinite(Date.parse(candidate.createdAt))) {
        throw new Error('The saved signing key could not be read.');
      }
      identity = { ...candidate, publicKeyJwk: validatePublicKeyJwk(candidate.publicKeyJwk, 'Saved signing identity') };
    } catch (reason) { warnings.push(errorMessage(reason)); }
  }
  const bundles: SignatureBundle[] = [];
  if (!Array.isArray(saved.bundles)) warnings.push('Saved signature bundles could not be read.');
  else saved.bundles.forEach((bundle, index) => {
    try { bundles.push(parseBundle(JSON.stringify(bundle), `Saved bundle ${index + 1}`)); }
    catch (reason) { warnings.push(errorMessage(reason)); }
  });
  return { workspace: { version: 1, ...(identity ? { identity } : {}), bundles }, warnings };
}

function bundleKey(bundle: SignatureBundle): string {
  return `${bundle.file.sha256}:${bundle.file.size}:${bundle.file.name}`;
}

function signatureKey(record: SignatureBundle['signatures'][number]): string {
  return JSON.stringify([record.signer, record.signedAt, record.signature, Object.entries(record.publicKeyJwk).sort(([left], [right]) => left.localeCompare(right))]);
}

function mergeBundle(existing: SignatureBundle | undefined, incoming: SignatureBundle, filename: string): SignatureBundle {
  const signatures = existing ? [...existing.signatures] : [];
  const records = new Set(signatures.map(signatureKey));
  for (const record of incoming.signatures) {
    if (!records.has(signatureKey(record))) { signatures.push(record); records.add(signatureKey(record)); }
  }
  return parseBundle(JSON.stringify({ ...incoming, signatures }), filename);
}

function byteLabel(size: number): string {
  return `${size.toLocaleString('en-US')} ${size === 1 ? 'byte' : 'bytes'}`;
}

interface ImportDialogProps {
  onClose: () => void;
  onImport: (file: File) => Promise<void>;
  returnFocus: RefObject<HTMLButtonElement | null>;
}

function ImportDialog({ onClose, onImport, returnFocus }: ImportDialogProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.focus();
    const keepFocusInDialog = (event: FocusEvent) => {
      if (event.target instanceof Node && dialog && !dialog.contains(event.target)) dialog.focus();
    };
    document.addEventListener('focusin', keepFocusInDialog);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('focusin', keepFocusInDialog);
      document.body.style.overflow = previousOverflow;
      returnFocus.current?.focus();
    };
  }, [returnFocus]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
  }, [busy]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) { setError('Choose a signature bundle JSON file.'); return; }
    setBusy(true); setError('');
    try { await onImport(file); onClose(); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }

  return <div className="modal-backdrop local-import-backdrop" onClick={() => { if (!busy) onClose(); }}>
    <div ref={dialogRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} tabIndex={-1}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); }
        if (event.key !== 'Tab') return;
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus(); }
      }}>
      <form onSubmit={(event) => void submit(event)}>
        <header className="modal-header">
          <h2 id={`${id}-title`} className="modal-title">Import signature bundle</h2>
          <button type="button" className="icon-btn" aria-label="Close import dialog" disabled={busy} onClick={onClose}><X size={20} strokeWidth={1.75} aria-hidden="true" /></button>
        </header>
        <div className="modal-body" role="region" tabIndex={0} aria-label="Signature bundle import">
          <p id={`${id}-description`}>Choose a JSON signature bundle up to 2 MiB. It contains file details, public keys, and signatures. Existing signatures for the same file are kept. You will also need the original file to verify it.</p>
          <label className="field local-file-field"><span className="field-label">Signature bundle JSON file</span>
            <input type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(''); }} />
          </label>
          {file && <p className="mono local-wrap">{file.name}</p>}
          {error && <p role="alert" className="form-error">{error}</p>}
        </div>
        <footer className="modal-footer">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}><Upload size={16} strokeWidth={1.75} aria-hidden="true" />{busy ? 'Importing bundle' : 'Import bundle'}</button>
        </footer>
      </form>
    </div>
  </div>;
}

export function LocalSigning() {
  const id = useId();
  const [workspace, setWorkspace] = useState<LocalSigningWorkspace>(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [verification, setVerification] = useState<FileVerification | null>(null);
  const [tamperResult, setTamperResult] = useState<FileVerification | null>(null);
  const [identityName, setIdentityName] = useState('');
  const [newIdentity, setNewIdentity] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [storageReadBlocked, setStorageReadBlocked] = useState(false);
  const [unsavedChange, setUnsavedChange] = useState(false);
  const [status, setStatus] = useState('');
  const [storedChange, setStoredChange] = useState(false);
  const [nudged, setNudged] = useState(backupSeen);
  const [dragging, setDragging] = useState(false);
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRevisionRef = useRef(0);
  const selectedBundle = workspace.bundles.find((bundle) => bundleKey(bundle) === selectedKey) ?? null;
  const identity = workspace.identity;
  const disabled = loading || busy;

  useEffect(() => {
    let active = true;
    void loadWorkspaceSnapshot<LocalSigningWorkspace>().then((saved) => {
      if (!active) return;
      const restored = restoreWorkspace(saved.data);
      workspaceRevisionRef.current = saved.revision;
      setWorkspace(restored.workspace);
      setSelectedKey(restored.workspace.bundles[0] ? bundleKey(restored.workspace.bundles[0]) : null);
      if (restored.warnings.length) {
        setStorageReadBlocked(true);
        setStorageError(`Some saved data could not be read. Browser storage changes are blocked to protect the saved signing key. Readable keys and bundles were kept. Import and export work for this session. ${restored.warnings.join(' ')}`);
      }
    }).catch((reason) => {
      if (active) {
        setStorageReadBlocked(true);
        setStorageError(`Browser storage could not load your workspace. Storage changes and identity creation are blocked to protect any saved signing key. Import and export work for this session. ${errorMessage(reason)}`);
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function store(next: LocalSigningWorkspace): Promise<boolean> {
    setWorkspace(next);
    setUnsavedChange(true);
    if (storageReadBlocked) return false;
    try {
      const revision = await saveWorkspace(next, { expectedRevision: workspaceRevisionRef.current });
      workspaceRevisionRef.current = revision;
      setStorageError(''); setStoredChange(true); setUnsavedChange(false);
      return true;
    } catch (reason) {
      if (reason instanceof WorkspaceConflictError) {
        setStorageReadBlocked(true); setStoredChange(false);
        setStorageError('Another tab changed the saved signing workspace. Storage changes and identity creation are blocked to protect its signing key. Keep this page open and export any session bundles you need, then retry reading the saved workspace.');
        return false;
      }
      setStorageError(`Browser storage could not save this change. Keep this page open and export any signature bundle you need. ${errorMessage(reason)}`);
      return false;
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setStatus('');
    try { await action(); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }

  function chooseFile(next: File | null) {
    setFile(next); setVerification(null); setTamperResult(null); setError(''); setStatus('');
  }

  function chooseBundle(bundle: SignatureBundle | null) {
    setSelectedKey(bundle ? bundleKey(bundle) : null);
    chooseFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function importBundle(imported: File) {
    if (imported.size > MAX_BUNDLE_BYTES) throw new Error(`${imported.name}: signature bundle must be at most 2 MiB.`);
    const incoming = parseBundle(await imported.text(), imported.name);
    const key = bundleKey(incoming);
    const existing = workspace.bundles.find((item) => bundleKey(item) === key);
    const bundle = mergeBundle(existing, incoming, imported.name);
    const next: LocalSigningWorkspace = { ...workspace, bundles: [bundle, ...workspace.bundles.filter((item) => bundleKey(item) !== key)] };
    const saved = await store(next);
    setSelectedKey(key); chooseFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setStatus(saved ? 'Signature bundle imported and saved. Choose the original file to verify it.' : 'Signature bundle imported for this session. Choose the original file to verify it.');
  }

  function exportBundle() {
    if (!selectedBundle) return;
    try {
      downloadFile(`${selectedBundle.file.name}.signatures.json`, serializeBundle(selectedBundle), 'application/json');
      setNudged(true); markBackupSeen(); setStatus('Signature bundle exported. Keep it alongside the original file.');
    } catch (reason) { setError(errorMessage(reason)); }
  }

  async function createSigningIdentity(event: FormEvent) {
    event.preventDefault();
    if (storageReadBlocked) { setError('Read the saved workspace successfully before creating or replacing a signing identity.'); return; }
    if (!identityName.trim()) { setError('Enter a name for this signing key.'); return; }
    if (identity && !window.confirm('Replace the saved signing identity? Its private key will be permanently removed from this browser and cannot be recovered. Existing signatures remain verifiable.')) return;
    await run(async () => {
      const created = await createIdentity(identityName.trim());
      const saved = await store({ ...workspace, identity: created });
      setIdentityName(''); setNewIdentity(false);
      setStatus(saved ? 'Signing identity created and saved in this browser.' : 'Signing identity created for this session.');
    });
  }

  async function signSelectedFile() {
    if (!file || !identity) return;
    await run(async () => {
      const bundle = await signFile(file, identity, selectedBundle ?? undefined);
      const key = bundleKey(bundle);
      const checked = await verifyFile(file, bundle);
      const saved = await store({ ...workspace, bundles: [bundle, ...workspace.bundles.filter((item) => bundleKey(item) !== key)] });
      setSelectedKey(key); setVerification(checked); setTamperResult(null);
      setStatus(saved ? 'Signature added and saved.' : 'Signature added for this session. Export the bundle to keep it.');
    });
  }

  async function verifySelectedFile() {
    if (!file || !selectedBundle) return;
    await run(async () => { setVerification(await verifyFile(file, selectedBundle)); setTamperResult(null); });
  }

  async function testChangedBytes() {
    if (!file || !selectedBundle) return;
    await run(async () => {
      const changedFile = new File([file, new Uint8Array([0])], file.name, { type: file.type });
      setTamperResult(await verifyFile(changedFile, selectedBundle));
    });
  }

  function dropFile(event: DragEvent) {
    event.preventDefault(); setDragging(false);
    if (disabled) return;
    if (event.dataTransfer.files.length !== 1) { setError('Choose one file at a time.'); return; }
    chooseFile(event.dataTransfer.files[0]);
  }

  const verified = verification?.matchesFile && verification.signatures.length > 0 && verification.signatures.every((signature) => signature.valid);

  return <section className="local-signing" aria-labelledby={`${id}-workspace-title`}>
    <div className="local-workspace-bar">
      <div>
        <h2 id={`${id}-workspace-title`} className="panel-heading">Your signing workspace</h2>
        <p className="local-privacy">Your data stays in this browser.</p>
        <p className="form-note">No requests to other hosts.</p>
        <p className="form-note">Files stay in memory. This browser saves the signing key, file details, and signature bundles.</p>
      </div>
      <div className="form-actions">
        <button ref={importButtonRef} type="button" className="btn btn-secondary" disabled={disabled} onClick={() => { setError(''); setDialog(true); }}><Upload size={16} strokeWidth={1.75} aria-hidden="true" />Import bundle</button>
        <button ref={exportButtonRef} id={`${id}-export`} type="button" className="btn btn-secondary" disabled={disabled || !selectedBundle} onClick={exportBundle}><Download size={16} strokeWidth={1.75} aria-hidden="true" />Export bundle</button>
        {workspace.bundles.length > 0 && <button type="button" className="btn btn-secondary" disabled={disabled || storageReadBlocked} onClick={() => {
          if (!window.confirm('Clear all signature bundles from this browser? Export the bundles you need first. Your signing identity will be kept.')) return;
          void run(async () => {
            const saved = await store({ ...workspace, bundles: [] });
            chooseBundle(null);
            setStatus(saved ? 'Signature bundles cleared. Your signing identity was kept.' : 'Signature bundles cleared for this session. Your signing identity was kept.');
          });
        }}><Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />Clear workspace</button>}
      </div>
      {!nudged && <p className="local-backup-note">{storedChange && 'Changes saved. '}<a href={`#${id}-export`} onClick={(event) => { event.preventDefault(); exportButtonRef.current?.focus(); }}>Keep a backup outside this browser</a>. Export the bundle after signing and keep the original file.</p>}
    </div>

    {loading && <p role="status" className="form-note">Loading your saved workspace.</p>}
    {storageError && <p role="alert" className="form-error">{storageError}</p>}
    {storageReadBlocked && <button type="button" className="btn btn-secondary local-retry-storage" disabled={disabled} onClick={() => void run(async () => {
      const snapshot = await loadWorkspaceSnapshot<LocalSigningWorkspace>();
      const saved = restoreWorkspace(snapshot.data);
      if (saved.warnings.length) throw new Error(`Saved browser data still could not be read. ${saved.warnings.join(' ')}`);
      const bundles = [...saved.workspace.bundles];
      for (const sessionBundle of workspace.bundles) {
        const index = bundles.findIndex((bundle) => bundleKey(bundle) === bundleKey(sessionBundle));
        const merged = mergeBundle(index >= 0 ? bundles[index] : undefined, sessionBundle, 'Session signature bundle');
        if (index >= 0) bundles[index] = merged; else bundles.push(merged);
      }
      setWorkspace({ ...saved.workspace, bundles }); chooseBundle(bundles[0] ?? null);
      workspaceRevisionRef.current = snapshot.revision;
      setStorageReadBlocked(false); setStorageError('');
      setStatus('Saved browser workspace loaded. Storage changes are available again.');
    })}>Retry reading saved workspace</button>}
    {error && <p role="alert" className="form-error">{error}</p>}
    <p className="local-operation-status" role="status" aria-live="polite">{status}</p>

    <div className="local-workspace-layout" inert={dialog ? true : undefined}>
      <aside className="local-shelf" aria-labelledby={`${id}-bundles-title`}>
        <h3 id={`${id}-bundles-title`} className="panel-heading">Signature bundles</h3>
        <p className="tally">{workspace.bundles.length} {unsavedChange ? 'session' : 'saved'} {workspace.bundles.length === 1 ? 'bundle' : 'bundles'}</p>
        <button type="button" className="btn btn-secondary local-new-file" disabled={disabled} onClick={() => chooseBundle(null)}><FileUp size={16} strokeWidth={1.75} aria-hidden="true" />Start another file</button>
        {workspace.bundles.length === 0 ? <p className="form-note">Sign a file or import a bundle to begin.</p> :
          <div className="local-bundle-scroll" role="region" tabIndex={0} aria-label="Saved signature bundles">
            <ul className="doc-list">{workspace.bundles.map((bundle) => <li key={bundleKey(bundle)} className={`doc-item ${bundleKey(bundle) === selectedKey ? 'is-selected' : ''}`}>
              <button type="button" className="row-btn local-wrap" aria-pressed={bundleKey(bundle) === selectedKey} disabled={disabled} onClick={() => chooseBundle(bundle)}>{bundle.file.name}</button>
              <p className="cell-sub">{bundle.signatures.length} {bundle.signatures.length === 1 ? 'signature' : 'signatures'} · {byteLabel(bundle.file.size)}</p>
            </li>)}</ul>
          </div>}
      </aside>

      <div className="local-desk">
        <div className="local-sheet-column">
          <article className="sheet local-signing-sheet" aria-labelledby={`${id}-file-title`}>
            <header className="sheet-head">
              <p className="local-eyebrow">File signature record</p>
              <h3 id={`${id}-file-title`} className="sheet-title local-wrap">{selectedBundle?.file.name ?? file?.name ?? 'Choose your file'}</h3>
              <p className="form-note">Sign any file, then share its signature bundle with the original file. Another person can verify the bytes or add their signature.</p>
            </header>
            <div className={`local-dropzone ${dragging ? 'is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={dropFile}>
              <FileUp size={24} strokeWidth={1.5} aria-hidden="true" />
              <p className="local-file-prompt">{selectedBundle ? 'Choose the original file to verify or sign' : 'Drop one file here, or choose a file'}</p>
              <label className="field local-file-field"><span className="field-label">Choose file</span><input ref={fileInputRef} type="file" disabled={disabled} onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} /></label>
            </div>
            {file && <p className="local-selected-file"><Check size={16} aria-hidden="true" /><span><strong className="local-wrap">{file.name}</strong><br /><span className="mono cell-sub">{byteLabel(file.size)} selected in memory</span></span></p>}
            {selectedBundle && <dl className="kv kv-wide local-file-details"><dt>Expected file</dt><dd className="mono local-wrap">{selectedBundle.file.name} · {byteLabel(selectedBundle.file.size)}</dd><dt>SHA-256</dt><dd className="mono hash-full">{selectedBundle.file.sha256}</dd><dt>Signature method</dt><dd className="mono">ECDSA P-256 / SHA-256</dd></dl>}
            {!selectedBundle && <p className="form-note local-file-details">The signature bundle records the file name, size, and SHA-256 hash. Your file is not stored in browser storage.</p>}
          </article>

          <section className="tester local-tester" aria-labelledby={`${id}-tamper-title`}>
            <h3 id={`${id}-tamper-title`} className="panel-heading">Tamper tester</h3>
            <p className="form-note">Append one byte to a temporary copy and check it with the same verifier. Your selected file and saved bundle stay unchanged.</p>
            <button type="button" className="btn btn-secondary" disabled={disabled || !file || !selectedBundle} onClick={() => void testChangedBytes()}><FileCheck2 size={16} strokeWidth={1.75} aria-hidden="true" />Test changed bytes</button>
            {tamperResult && <div className="local-tamper-result" role="status">
              <p className={`local-result-line ${tamperResult.matchesFile ? 'local-warn' : 'local-bad'}`}>{tamperResult.matchesFile ? 'Changed bytes matched the bundle.' : 'Changed bytes do not match the bundle.'}</p>
              <p className="form-note">The extra byte changes the file hash. Each signature is also checked against the bundle.</p>
              <ul className="dense-list">{tamperResult.signatures.map((signature, index) => <li key={index} className="verify-row"><span className="dense-name">{signature.signer}</span><span className="cell-sub">{signature.valid ? 'Signature valid for the recorded hash' : 'Signature fails'}{signature.error ? `: ${signature.error}` : ''}</span></li>)}</ul>
            </div>}
          </section>
        </div>

        <aside className="margin local-signing-margin" aria-label="Signing identity and verification">
          <section aria-labelledby={`${id}-identity-title`}>
            <h3 id={`${id}-identity-title`} className="panel-heading">Signing identity</h3>
            {identity && <div className="local-identity-summary"><p className="sig-ink">{identity.name}</p><p className="cell-sub">Created {formatTimestamp(identity.createdAt)}</p>
              <button type="button" className="btn btn-secondary local-full-width" disabled={disabled} onClick={() => {
                try { downloadFile(`${identity.name}.public-key.json`, JSON.stringify(identity.publicKeyJwk, null, 2), 'application/json'); setStatus('Public key exported.'); }
                catch (reason) { setError(errorMessage(reason)); }
              }}><Download size={16} strokeWidth={1.75} aria-hidden="true" />Export public key</button>
              {!newIdentity && <button type="button" className="link-btn" disabled={disabled || storageReadBlocked} onClick={() => setNewIdentity(true)}>Create another identity</button>}
            </div>}
            {(!identity || newIdentity) && <form className="local-identity-form" onSubmit={(event) => void createSigningIdentity(event)}>
              <label className="field"><span className="field-label">Name for this signing key</span><input type="text" value={identityName} maxLength={120} autoComplete="name" disabled={disabled || storageReadBlocked} onChange={(event) => setIdentityName(event.target.value)} /></label>
              {identity && <p className="form-note">Creating another identity replaces the saved signing key. Existing signatures remain verifiable.</p>}
              <button type="submit" className="btn btn-secondary" disabled={disabled || storageReadBlocked}><KeyRound size={16} strokeWidth={1.75} aria-hidden="true" />Create identity</button>
              {identity && <button type="button" className="link-btn" disabled={disabled} onClick={() => setNewIdentity(false)}>Keep current identity</button>}
            </form>}
            <p className="form-note local-key-note">The private signing key stays in this browser and cannot be exported. Verification needs no signing identity.</p>
          </section>

          <div className="local-signing-actions">
            <button type="button" className="btn btn-primary local-full-width" disabled={disabled || !file || !identity} onClick={() => void signSelectedFile()}><PenLine size={16} strokeWidth={1.75} aria-hidden="true" />{busy ? 'Working' : selectedBundle ? 'Add signature' : 'Sign file'}</button>
            <button type="button" className="btn btn-secondary local-full-width" disabled={disabled || !file || !selectedBundle} onClick={() => void verifySelectedFile()}><ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" />Verify file</button>
          </div>

          <section aria-labelledby={`${id}-signatures-title`}>
            <h3 id={`${id}-signatures-title`} className="panel-heading">Signatures</h3>
            {!selectedBundle ? <p className="form-note">No signatures yet.</p> : <ul className="dense-list">{selectedBundle.signatures.map((signature, index) => <li key={`${signature.signature}:${index}`} className="sig-block"><p className="sig-ink">{signature.signer}</p><p className="cell-sub mono">{formatTimestamp(signature.signedAt)}</p></li>)}</ul>}
          </section>

          <section className="local-verification" aria-labelledby={`${id}-verify-title`}>
            <h3 id={`${id}-verify-title`} className="panel-heading">Verification result</h3>
            {!verification ? <p className="form-note">Choose a bundle and its original file, then verify the file.</p> : <div className="result" role="status">
              <p className={`local-result-line ${verified ? 'local-ok' : 'local-bad'}`}><span className={`status-dot ${verified ? 'ok' : 'bad'}`} aria-hidden="true" />{verified ? 'File and signatures verified' : 'Verification failed'}</p>
              <p className="form-note">{verification.matchesFile ? 'File name, size, and bytes match the bundle.' : 'File name, size, or bytes do not match the bundle.'}</p>
              <ul className="dense-list">{verification.signatures.map((signature, index) => <li key={index} className="verify-row"><p className="dense-name local-wrap">{signature.signer}</p><p className={signature.valid ? 'local-ok' : 'local-bad'}>{signature.valid ? 'Signature valid' : 'Signature fails'}</p>{signature.error && <p className="cell-sub">{signature.error}</p>}</li>)}</ul>
            </div>}
          </section>
          <p className="local-key-boundary">Signatures prove a file matches what a key signed. They do not prove who owns the key.</p>
        </aside>
      </div>
    </div>
    {dialog && <ImportDialog returnFocus={importButtonRef} onClose={() => setDialog(false)} onImport={importBundle} />}
  </section>;
}
