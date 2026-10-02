import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { createDocument } from '../services/index.js';
import { Modal } from './Modal.js';

interface CreateDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newDocId: string) => void;
}

const EMPTY_SIGNER = { name: '', email: '', role: '' };

export const CreateDocumentModal: React.FC<CreateDocumentModalProps> = ({ isOpen, onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [signers, setSigners] = useState<Array<{ name: string; email: string; role: string }>>([{ ...EMPTY_SIGNER }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddSigner = () => setSigners([...signers, { ...EMPTY_SIGNER }]);

  const handleRemoveSigner = (idx: number) => {
    if (signers.length > 1) setSigners(signers.filter((_, i) => i !== idx));
  };

  const handleSignerChange = (idx: number, field: 'name' | 'email' | 'role', val: string) => {
    const updated = [...signers];
    updated[idx] = { ...updated[idx], [field]: val };
    setSigners(updated);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      setError('Enter a title and the agreement text.');
      return;
    }

    const validSigners = signers.filter((s) => s.name.trim() && s.email.trim());
    if (validSigners.length === 0) {
      setError('Add at least one signer with a name and an email address.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const newDoc = await createDocument({ title, content, signers: validSigners });
      setTitle('');
      setContent('');
      setSigners([{ ...EMPTY_SIGNER }]);
      onCreated(newDoc.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} titleId="create-document-title">
      <div className="modal-header">
        <h2 id="create-document-title" className="modal-title">New agreement</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <div className="modal-body">
        <div className="field">
          <label className="field-label" htmlFor="doc-title-input">Title</label>
          <input
            id="doc-title-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Master services agreement"
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="doc-content-input">Agreement text</label>
          <textarea
            id="doc-content-input"
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type or paste the terms here"
          />
        </div>

        <fieldset className="signer-fieldset">
          <legend className="field-label">Signers</legend>
          {signers.map((s, idx) => (
            <div key={idx} className="signer-row">
              <label className="visually-hidden" htmlFor={`signer-name-${idx}`}>
                Signer {idx + 1} full name
              </label>
              <input
                id={`signer-name-${idx}`}
                type="text"
                placeholder="Full name"
                value={s.name}
                onChange={(e) => handleSignerChange(idx, 'name', e.target.value)}
              />
              <label className="visually-hidden" htmlFor={`signer-email-${idx}`}>
                Signer {idx + 1} email address
              </label>
              <input
                id={`signer-email-${idx}`}
                type="email"
                placeholder="Email address"
                value={s.email}
                onChange={(e) => handleSignerChange(idx, 'email', e.target.value)}
              />
              <label className="visually-hidden" htmlFor={`signer-role-${idx}`}>
                Signer {idx + 1} role
              </label>
              <input
                id={`signer-role-${idx}`}
                type="text"
                placeholder="Role"
                value={s.role}
                onChange={(e) => handleSignerChange(idx, 'role', e.target.value)}
              />
              {signers.length > 1 && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => handleRemoveSigner(idx)}
                  aria-label={`Remove signer ${idx + 1}`}
                >
                  <X size={18} strokeWidth={1.75} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-secondary" onClick={handleAddSigner}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            Add signer
          </button>
        </fieldset>

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
        <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Hashing' : 'Create and hash agreement'}
        </button>
      </div>
    </Modal>
  );
};
