import React, { useState } from 'react';
import { signDocument } from '../services/api.js';
import { Modal } from './Modal.js';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signerId) return null;

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
    <Modal isOpen={isOpen} onClose={onClose} titleId="sign-modal-title">
      <div className="modal-header">
        <h3 id="sign-modal-title" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
          Sign Agreement
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
          This creates an asymmetric-key signature for <strong>{signerName}</strong> over this document's current
          digest. A fresh ECDSA P-256 keypair is generated for the signature; the private key is used once and never
          stored.
        </p>

        <div style={{ background: 'var(--bg-secondary)', padding: '0.9rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
            Canonical SHA-256 Document Digest
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--color-cyan)', wordBreak: 'break-all' }}>
            {contentHash}
          </span>
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
        <button className="btn btn-primary" onClick={handleSign} disabled={loading}>
          {loading ? 'Signing...' : 'Confirm & Sign'}
        </button>
      </div>
    </Modal>
  );
};
