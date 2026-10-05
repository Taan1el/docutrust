import { useEffect, useState } from 'react';
import { loadMode, saveMode, type WorkspaceMode } from './workspace.js';

export function WorkspaceModeControl({ onChange }: { onChange: (mode: WorkspaceMode) => void }) {
  const [mode, setMode] = useState<WorkspaceMode>('sample');
  const [error, setError] = useState('');
  const [install, setInstall] = useState<(Event & { prompt(): Promise<void> }) | null>(null);
  useEffect(() => {
    let active = true;
    void loadMode().then((saved) => { if (active) { setMode(saved); onChange(saved); } })
      .catch(() => setError('Browser storage is unavailable. Keep exported signature bundles outside this browser.'));
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstall(event as Event & { prompt(): Promise<void> }); };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    return () => { active = false; window.removeEventListener('beforeinstallprompt', beforeInstall); };
  }, [onChange]);
  return <section className="local-mode" aria-label="Browser workspace mode">
    <div className="field"><label className="field-label" htmlFor="local-data-source">Data source</label>
      <select id="local-data-source" value={mode} onChange={(event) => {
        const next = event.target.value as WorkspaceMode;
        void saveMode(next).then(() => { setMode(next); onChange(next); setError(''); })
          .catch(() => setError('Data source could not be saved. Browser storage may be full.'));
      }}><option value="sample">Sample data</option><option value="workspace">Your workspace</option></select>
    </div>
    {mode === 'sample' && <p>Your data stays in this browser. No requests to other hosts.</p>}
    {install && <button className="btn btn-secondary" type="button" onClick={() => void install.prompt().then(() => setInstall(null))}>Install DocuTrust</button>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </section>;
}
