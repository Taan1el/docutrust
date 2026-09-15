import React, { useState, useEffect } from 'react';
import { simulateTamper } from '../services/api.js';
import { Modal } from './Modal.js';

interface TamperSimulatorModalProps {
  isOpen: boolean;
  documentId: string;
  currentTitle: string;
  currentContent: string;
  onClose: () => void;
  onTampered: () => void;
}

export const TamperSimulatorModal: React.FC<TamperSimulatorModalProps> = ({
  isOpen,
  documentId,
  currentTitle,
  currentContent,
  onClose,
  onTampered,
}) => {
  const [tamperedTitle, setTamperedTitle] = useState(currentTitle);
  const [tamperedText, setTamperedText] = useState(currentContent);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTamperedTitle(currentTitle);
    setTamperedText(currentContent);
  }, [currentTitle, currentContent]);

  const handleTamper = async () => {
    const titleChanged = tamperedTitle.trim() && tamperedTitle !== currentTitle;
    const contentChanged = tamperedText.trim() && tamperedText !== currentContent;
    if (!titleChanged && !contentChanged) {
      setError('Change the title or the content before committing a tamper');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await simulateTamper(documentId, {
        ...(titleChanged ? { tamperedTitle } : {}),
        ...(contentChanged ? { tamperedContent: tamperedText } : {}),
      });
      onTampered();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Tamper simulation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleInsertSampleTamper = () => {
    setTamperedText(
      currentContent +
        '\n\n[TAMPERED CLAUSE INJECTED]: All intellectual property rights and payment amounts are hereby modified without signatory consent.'
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} titleId="tamper-modal-title">
      <div className="modal-header">
        <h3 id="tamper-modal-title" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-crimson)' }}>
          Tamper Detection Simulator
        </h3>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
        >
          &times;
        </button>
      </div>

      <div className="modal-body">
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          This overwrites the signed title and/or content directly, without recomputing the sealed hash, the way an
          unauthorized database edit would. It is the only action in the app that does this; verifying afterward
          shows every signature reported as broken because the recomputed hash no longer matches.
        </p>

        <div>
          <label className="input-label" htmlFor="tamper-title-input">Title:</label>
          <input
            id="tamper-title-input"
            type="text"
            className="text-input"
            value={tamperedTitle}
            onChange={(e) => setTamperedTitle(e.target.value)}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <label className="input-label" style={{ margin: 0 }} htmlFor="tamper-content-input">Content:</label>
            <button
              className="btn btn-secondary"
              onClick={handleInsertSampleTamper}
              style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
            >
              + Inject Malicious Clause
            </button>
          </div>
          <textarea
            id="tamper-content-input"
            className="text-area"
            rows={8}
            value={tamperedText}
            onChange={(e) => setTamperedText(e.target.value)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
          />
        </div>

        {error && (
          <div role="alert" style={{ color: 'var(--color-crimson)', fontSize: '0.85rem' }}>
            &times; {error}
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
          Cancel
        </button>
        <button className="btn btn-danger" onClick={handleTamper} disabled={loading}>
          {loading ? 'Modifying...' : 'Commit Tampered Content'}
        </button>
      </div>
    </Modal>
  );
};
