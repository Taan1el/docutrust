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
    <div className="table-wrap">
      <table className="doc-table">
        <thead>
          <tr>
            <th scope="col">Agreement</th>
            <th scope="col">Status</th>
            <th scope="col">Signed</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => {
            const isSelected = doc.id === selectedDocId;
            const signedCount = doc.signers.filter((s) => s.status === 'SIGNED').length;
            const total = doc.signers.length;
            const status = statusOf(doc);
            return (
              <tr key={doc.id} className={isSelected ? 'is-selected' : undefined}>
                <td data-label="Agreement">
                  <button type="button" className="row-btn" aria-pressed={isSelected} onClick={() => onSelectDoc(doc.id)}>
                    {doc.title}
                  </button>
                  <span className="cell-sub">{doc.signers.map((s) => s.name).join(', ')}</span>
                </td>
                <td data-label="Status">
                  <span className="status">
                    <span className={`status-dot ${status.tone}`} aria-hidden="true" />
                    {status.label}
                  </span>
                </td>
                <td data-label="Signed">
                  <span className="signed-cell">
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
                  </span>
                </td>
                <td data-label="Created" className="mono">
                  {formatTimestamp(doc.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
