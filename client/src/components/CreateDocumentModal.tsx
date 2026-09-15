import React, { useState } from 'react';
import { createDocument } from '../services/api.js';
import { Modal } from './Modal.js';

interface CreateDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newDocId: string) => void;
}

export const CreateDocumentModal: React.FC<CreateDocumentModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [signers, setSigners] = useState<Array<{ name: string; email: string; role: string }>>([
    { name: '', email: '', role: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddSigner = () => {
    setSigners([...signers, { name: '', email: '', role: '' }]);
  };

  const handleRemoveSigner = (idx: number) => {
    if (signers.length > 1) {
      setSigners(signers.filter((_, i) => i !== idx));
    }
  };

  const handleSignerChange = (idx: number, field: 'name' | 'email' | 'role', val: string) => {
    const updated = [...signers];
    updated[idx] = { ...updated[idx], [field]: val };
    setSigners(updated);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      setError('Please provide a document title and agreement content');
      return;
    }

    const validSigners = signers.filter((s) => s.name.trim() && s.email.trim());
    if (validSigners.length === 0) {
      setError('Please add at least one signer with name and email');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const newDoc = await createDocument({
        title,
        content,
        signers: validSigners,
      });
      setTitle('');
      setContent('');
      setSigners([{ name: '', email: '', role: '' }]);
      onCreated(newDoc.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Creation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} titleId="create-document-title">
      <div className="modal-header">
        <h3 id="create-document-title" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
          Draft New Agreement
        </h3>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
        >
          &times;
        </button>
      </div>

      <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <div>
          <label className="input-label" htmlFor="doc-title-input">Document Title:</label>
          <input
            id="doc-title-input"
            type="text"
            className="text-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Master Services Agreement (MSA)"
          />
        </div>

        <div>
          <label className="input-label" htmlFor="doc-content-input">Agreement Content / Terms:</label>
          <textarea
            id="doc-content-input"
            className="text-area"
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type or paste the agreement text here..."
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <span className="input-label" style={{ margin: 0 }} id="signers-legend">Designated Signers:</span>
            <button className="btn btn-secondary" onClick={handleAddSigner} style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
              + Add Signer
            </button>
          </div>

          <div role="group" aria-labelledby="signers-legend">
            {signers.map((s, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.4rem', marginBottom: '0.4rem' }}>
                <label className="visually-hidden" htmlFor={`signer-name-${idx}`}>
                  Signer {idx + 1} full name
                </label>
                <input
                  id={`signer-name-${idx}`}
                  type="text"
                  className="text-input"
                  placeholder="Full Name"
                  value={s.name}
                  onChange={(e) => handleSignerChange(idx, 'name', e.target.value)}
                />
                <label className="visually-hidden" htmlFor={`signer-email-${idx}`}>
                  Signer {idx + 1} email address
                </label>
                <input
                  id={`signer-email-${idx}`}
                  type="email"
                  className="text-input"
                  placeholder="Email Address"
                  value={s.email}
                  onChange={(e) => handleSignerChange(idx, 'email', e.target.value)}
                />
                <label className="visually-hidden" htmlFor={`signer-role-${idx}`}>
                  Signer {idx + 1} role
                </label>
                <input
                  id={`signer-role-${idx}`}
                  type="text"
                  className="text-input"
                  placeholder="Role (e.g. CEO)"
                  value={s.role}
                  onChange={(e) => handleSignerChange(idx, 'role', e.target.value)}
                />
                {signers.length > 1 && (
                  <button
                    className="btn btn-danger"
                    onClick={() => handleRemoveSigner(idx)}
                    aria-label={`Remove signer ${idx + 1}`}
                    style={{ padding: '0.3rem 0.6rem' }}
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
          </div>
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
        <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Sealing...' : 'Create & Hash Agreement'}
        </button>
      </div>
    </Modal>
  );
};
