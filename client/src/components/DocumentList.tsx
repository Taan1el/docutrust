import React from 'react';
import type { DocumentRecord } from '../../../shared/types.js';

interface DocumentListProps {
  documents: DocumentRecord[];
  selectedDocId: string | null;
  onSelectDoc: (id: string) => void;
  loading: boolean;
}

export const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  selectedDocId,
  onSelectDoc,
  loading,
}) => {
  if (loading && documents.length === 0) {
    return (
      <div className="panel-card" style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading cryptographic agreements...</p>
      </div>
    );
  }

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="panel-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          Agreements ({documents.length})
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {documents.map((doc) => {
          const isSelected = doc.id === selectedDocId;
          const signedCount = doc.signers.filter((s) => s.status === 'SIGNED').length;

          let badgeClass = 'badge-pending';
          let label = 'Pending';
          if (doc.status === 'COMPLETED') {
            badgeClass = 'badge-completed';
            label = 'Sealed & Valid';
          } else if (doc.status === 'PARTIALLY_SIGNED') {
            badgeClass = 'badge-partial';
            label = `Partially Signed (${signedCount}/${doc.signers.length})`;
          }

          return (
            <div
              key={doc.id}
              className={`doc-list-item ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectDoc(doc.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span className="doc-title">{doc.title}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' }}>
                <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {doc.id}
                </span>
                <span className={`badge-status ${badgeClass}`}>{label}</span>
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Signers: {doc.signers.map((s) => s.name).join(', ')}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
