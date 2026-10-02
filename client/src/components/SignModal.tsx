import React, { useState } from 'react';
import { X } from 'lucide-react';
import { signDocument } from '../services/index.js';
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} titleId="sign-modal-title">
      <div className="modal-header">
        <h2 id="sign-modal-title" className="modal-title">Sign agreement</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <div className="modal-body">
        <p className="form-note">
          This signs the document hash for <strong>{signerName}</strong>. A new ECDSA P-256 key pair is generated for
          the signature. The private key signs once and is not stored; only the public key is kept for verification.
        </p>
        <dl className="kv kv-wide">
          <dt>SHA-256 of title and text</dt>
          <dd className="mono hash-full">{contentHash}</dd>
        </dl>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSign} disabled={loading}>
          {loading ? 'Signing' : 'Sign with a new key'}
        </button>
      </div>
    </Modal>
  );
};
