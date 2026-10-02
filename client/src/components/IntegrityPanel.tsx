import React, { useState } from 'react';
import type { DocumentRecord, VerificationResult } from '../../../shared/types.js';
import { simulateTamper } from '../services/index.js';

// The parent keys this component on the document's id, title and text, so the
// form fields start from the stored values again after every edit or selection change.
interface IntegrityPanelProps {
  document: DocumentRecord;
  verification: VerificationResult | null;
  onTampered: () => void;
}

const SAMPLE_CLAUSE =
  '\n\nAdded after signing: payment amounts and intellectual property terms are changed without signer consent.';

export const IntegrityPanel: React.FC<IntegrityPanelProps> = ({ document, verification, onTampered }) => {
  const [title, setTitle] = useState(document.title);
  const [content, setContent] = useState(document.content);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTamper = async () => {
    const titleChanged = title.trim() && title !== document.title;
    const contentChanged = content.trim() && content !== document.content;
    if (!titleChanged && !contentChanged) {
      setError('Change the title or the content first.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await simulateTamper(document.id, {
        ...(titleChanged ? { tamperedTitle: title } : {}),
        ...(contentChanged ? { tamperedContent: content } : {}),
      });
      onTampered();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tamper simulation failed');
    } finally {
      setLoading(false);
    }
  };

  const tampered = verification?.isTampered === true;
  const intact = verification !== null && !tampered && verification.isValid;

  return (
    <div className="integrity">
      <h3 className="panel-heading integrity-heading">Integrity check</h3>
      <div className="integrity-grid">
        <form
          className="tamper-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleTamper();
          }}
        >
          <h4 className="sub-heading">Tamper tester</h4>
          <p className="form-note">
            Writes a new title or text straight into storage without re-signing, like an unauthorized edit would.
            Verification then shows which checks fail.
          </p>
          <div className="field">
            <label className="field-label" htmlFor="tamper-title-input">Title</label>
            <input id="tamper-title-input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="tamper-content-input">Text</label>
            <textarea
              id="tamper-content-input"
              rows={6}
              className="mono"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setContent(document.content + SAMPLE_CLAUSE)}>
              Append altered clause
            </button>
            <button type="submit" className="btn btn-danger" disabled={loading}>
              {loading ? 'Writing edit' : 'Write edit without re-signing'}
            </button>
          </div>
        </form>

        <div className="result" aria-live="polite">
          <h4 className="sub-heading">Verification result</h4>
          {!verification && <p className="empty-note">Verifying.</p>}
          {verification && (
            <>
              <p className="result-line">
                <span className={`status-dot ${intact ? 'ok' : tampered ? 'bad' : 'warn'}`} aria-hidden="true" />
                {tampered
                  ? 'Seal broken: the title or text no longer matches the hash that was signed.'
                  : intact
                    ? 'Seal intact: the text matches the signed hash and every collected signature verifies.'
                    : 'Text matches the signed hash, but there is no valid signature to check.'}
              </p>
              <dl className="kv kv-wide">
                <dt>Hash at signing</dt>
                <dd className="mono hash-full">{verification.expectedHash}</dd>
                <dt>Hash of current text</dt>
                <dd className="mono hash-full">{verification.currentHash}</dd>
                <dt>Checked at</dt>
                <dd className="mono">{verification.verifiedAt.slice(0, 19).replace('T', ' ')} UTC</dd>
              </dl>
              <ul className="dense-list">
                {verification.signerVerifications.map((sv) => {
                  const tone = !sv.hasSigned ? 'warn' : sv.isSignatureValid ? 'ok' : 'bad';
                  const label = !sv.hasSigned ? 'Not signed' : sv.isSignatureValid ? 'Signature valid' : 'Signature fails';
                  return (
                    <li key={sv.signerId} className="dense-row verify-row">
                      <span className="dense-name">{sv.name}</span>
                      <span className="status">
                        <span className={`status-dot ${tone}`} aria-hidden="true" />
                        {label}
                      </span>
                      {sv.error && <span className="cell-sub">{sv.error}</span>}
                    </li>
                  );
                })}
              </ul>
              <p className="form-note">
                A valid result means the stored text still matches what each key signed. It does not prove who held the
                key.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
