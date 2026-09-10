import React, { useState } from 'react';
import { signDocument } from '../services/api.js';

interface SignModalProps {
  isOpen: boolean;
  documentId: string;
  signerId: string | null;
  signerName: string;
  contentHash: string;
  onClose: () => void;
  onSigned: () => void;
}

export const SignModal: React.FC<SignModalProps> = ({
  isOpen,
  documentId,
  signerId,
  signerName,
  contentHash,
  onClose,
  onSigned,
}) => {
  const [pin, setPin] = useState('1234');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !signerId) return null;

  const handleSign = async () => {
    try {
      setLoading(true);
      setError(null);
      await signDocument(documentId, signerId);
      onSigned();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Signing failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Digital Signing Ceremony (Smart-ID / e-ID)</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
          >
            &times;
          </button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            You are creating a legally binding cryptographic signature for <strong>{signerName}</strong> under EU Regulation 910/2014 (eIDAS).
          </p>

          <div style={{ background: 'var(--bg-secondary)', padding: '0.9rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
              Canonical SHA-256 Document Digest
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--color-cyan)', wordBreak: 'break-all' }}>
              {contentHash}
            </span>
          </div>

          <div>
            <label className="input-label">Signing PIN / Authorization Code:</label>
            <input
              type="password"
              className="text-input"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter 4-digit PIN"
              maxLength={6}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
              Simulates authentication with a cryptographic hardware token or smart card.
            </span>
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
          <button className="btn btn-primary" onClick={handleSign} disabled={loading}>
            {loading ? 'Generating Asymmetric Proof...' : 'Sign Agreement'}
          </button>
        </div>
      </div>
    </div>
  );
};
