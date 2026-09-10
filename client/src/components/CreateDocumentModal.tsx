import React, { useState } from 'react';
import { createDocument } from '../services/api.js';

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

  if (!isOpen) return null;

  const handleAddSigner = () => {
    setSigners([...signers, { name: '', email: '', role: '' }]);
  };

  const handleRemoveSigner = (idx: number) => {
    if (signers.length > 1) {
      setSigners(signers.filter((_, i) => i !== idx));
    }
  };

  const handleSignerChange = (idx: number, field: string, val: string) => {
    const updated = [...signers];
    (updated[idx] as any)[field] = val;
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
      onCreated(newDoc.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Creation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Draft New Cryptographic Agreement</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
          >
            &times;
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div>
            <label className="input-label">Document Title:</label>
            <input
              type="text"
              className="text-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Master Services Agreement (MSA)"
            />
          </div>

          <div>
            <label className="input-label">Agreement Content / Terms:</label>
            <textarea
              className="text-area"
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Type or paste the legal agreement clauses here..."
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label className="input-label" style={{ margin: 0 }}>Designated Signers:</label>
              <button className="btn btn-secondary" onClick={handleAddSigner} style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
                + Add Signer
              </button>
            </div>

            {signers.map((s, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.4rem', marginBottom: '0.4rem' }}>
                <input
                  type="text"
                  className="text-input"
                  placeholder="Full Name"
                  value={s.name}
                  onChange={(e) => handleSignerChange(idx, 'name', e.target.value)}
                />
                <input
                  type="email"
                  className="text-input"
                  placeholder="Email Address"
                  value={s.email}
                  onChange={(e) => handleSignerChange(idx, 'email', e.target.value)}
                />
                <input
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
                    style={{ padding: '0.3rem 0.6rem' }}
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
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
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Sealing...' : 'Create & Hash Agreement'}
          </button>
        </div>
      </div>
    </div>
  );
};
