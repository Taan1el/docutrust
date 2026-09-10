import React, { useState, useEffect } from 'react';
import { simulateTamper } from '../services/api.js';

interface TamperSimulatorModalProps {
  isOpen: boolean;
  documentId: string;
  currentContent: string;
  onClose: () => void;
  onTampered: () => void;
}

export const TamperSimulatorModal: React.FC<TamperSimulatorModalProps> = ({
  isOpen,
  documentId,
  currentContent,
  onClose,
  onTampered,
}) => {
  const [tamperedText, setTamperedText] = useState(currentContent);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTamperedText(currentContent);
  }, [currentContent]);

  if (!isOpen) return null;

  const handleTamper = async () => {
    try {
      setLoading(true);
      setError(null);
      await simulateTamper(documentId, tamperedText);
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-crimson)' }}>
            Tamper Detection Simulator
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
          >
            &times;
          </button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Test cryptographic resilience by modifying the document text after it has been digitally signed. The DocuTrust engine will detect the altered SHA-256 digest and flag the signature as invalid.
          </p>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label className="input-label" style={{ margin: 0 }}>Editable Document Content:</label>
              <button
                className="btn btn-secondary"
                onClick={handleInsertSampleTamper}
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
              >
                + Inject Malicious Clause
              </button>
            </div>
            <textarea
              className="text-area"
              rows={8}
              value={tamperedText}
              onChange={(e) => setTamperedText(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
            />
          </div>

          {error && (
            <div style={{ color: 'var(--color-crimson)', fontSize: '0.85rem' }}>
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
      </div>
    </div>
  );
};
