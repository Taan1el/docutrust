import React from 'react';
import type { DocumentRecord } from '../../../shared/types.js';
import { formatCount } from '../utils/pluralize.js';

interface StatsBarProps {
  documents: DocumentRecord[];
}

/** One-line tally above the agreements list, with a flat meter for collected signatures. */
export const StatsBar: React.FC<StatsBarProps> = ({ documents }) => {
  const sealed = documents.filter((d) => d.status === 'COMPLETED').length;
  const totalSigners = documents.reduce((n, d) => n + d.signers.length, 0);
  const signed = documents.reduce((n, d) => n + d.signers.filter((s) => s.status === 'SIGNED').length, 0);
  const percent = totalSigners > 0 ? (signed / totalSigners) * 100 : 0;

  return (
    <div className="tally">
      <p className="tally-line">{`${formatCount(documents.length, 'agreement')}, ${sealed} fully signed, ${documents.length - sealed} waiting on signers`}</p>
      <div className="tally-meter">
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
        <span className="mono">{`${signed} / ${totalSigners}`}</span>
      </div>
    </div>
  );
};
