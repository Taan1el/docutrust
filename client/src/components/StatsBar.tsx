import React from 'react';
import type { DocumentRecord } from '../../../shared/types.js';

interface StatsBarProps {
  documents: DocumentRecord[];
}

export const StatsBar: React.FC<StatsBarProps> = ({ documents }) => {
  const sealed = documents.filter((d) => d.status === 'COMPLETED').length;
  const totalSigners = documents.reduce((n, d) => n + d.signers.length, 0);
  const signed = documents.reduce((n, d) => n + d.signers.filter((s) => s.status === 'SIGNED').length, 0);
  const percent = totalSigners > 0 ? (signed / totalSigners) * 100 : 0;

  return (
    <div className="stats-strip">
      <div className="stat-cell">
        <span className="stat-label">Agreements</span>
        <span className="stat-value">{documents.length}</span>
      </div>
      <div className="stat-cell">
        <span className="stat-label">Fully signed</span>
        <span className="stat-value">{sealed}</span>
      </div>
      <div className="stat-cell">
        <span className="stat-label">Waiting on signers</span>
        <span className="stat-value">{documents.length - sealed}</span>
      </div>
      <div className="stat-cell">
        <span className="stat-label">Signatures collected</span>
        <span className="stat-value">{`${signed} / ${totalSigners}`}</span>
        <div
          className="meter"
          role="meter"
          aria-label="Signatures collected"
          aria-valuenow={signed}
          aria-valuemin={0}
          aria-valuemax={totalSigners}
        >
          <div className="meter-fill" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
};
