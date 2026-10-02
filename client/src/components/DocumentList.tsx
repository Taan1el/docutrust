import React from 'react';
import type { DocumentRecord } from '../../../shared/types.js';
import { formatTimestamp } from '../utils/format.js';

interface DocumentListProps {
  documents: DocumentRecord[];
  selectedDocId: string | null;
  onSelectDoc: (id: string) => void;
  loading: boolean;
}

export function statusOf(doc: DocumentRecord): { tone: 'ok' | 'warn' | 'bad'; label: string } {
  if (doc.status === 'COMPLETED') return { tone: 'ok', label: 'Fully signed' };
  if (doc.status === 'REJECTED') return { tone: 'bad', label: 'Rejected' };
  if (doc.status === 'PARTIALLY_SIGNED') return { tone: 'warn', label: 'Partially signed' };
  return { tone: 'warn', label: 'Waiting on signers' };
}

export const DocumentList: React.FC<DocumentListProps> = ({ documents, selectedDocId, onSelectDoc, loading }) => {
  if (documents.length === 0) {
    return (
      <p className="empty-note">{loading ? 'Loading agreements.' : 'No agreements yet. Create one to start signing.'}</p>
    );
  }

  return (
    <ul className="doc-list">
      {documents.map((doc) => {
        const isSelected = doc.id === selectedDocId;
        const signedCount = doc.signers.filter((s) => s.status === 'SIGNED').length;
        const total = doc.signers.length;
        const status = statusOf(doc);
        return (
          <li key={doc.id} className={isSelected ? 'doc-item is-selected' : 'doc-item'}>
            <button type="button" className="row-btn" aria-pressed={isSelected} onClick={() => onSelectDoc(doc.id)}>
              {doc.title}
            </button>
            <p className="status doc-status">
              <span className={`status-dot ${status.tone}`} aria-hidden="true" />
              {status.label}
            </p>
            <p className="doc-signed">
              <span
                className="meter meter-sm"
                role="meter"
                aria-label={`Signatures on ${doc.title}`}
                aria-valuenow={signedCount}
                aria-valuemin={0}
                aria-valuemax={total}
              >
                <span className="meter-fill" style={{ width: `${total ? (signedCount / total) * 100 : 0}%` }} />
              </span>
              <span className="mono">{`${signedCount} / ${total}`}</span>
            </p>
            <p className="cell-sub mono">{formatTimestamp(doc.createdAt)}</p>
          </li>
        );
      })}
    </ul>
  );
};
