import React from 'react';

interface HeaderProps {
  onOpenCreateModal: () => void;
  onRefresh: () => void;
  documentCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenCreateModal,
  onRefresh,
  documentCount,
}) => {
  return (
    <header className="app-header">
      <div className="brand-badge">
        <div className="brand-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div>
          <h1 className="brand-title">DocuTrust</h1>
          <div className="brand-sub">Asymmetric Digital Signatures & Tamper Detection</div>
        </div>
      </div>

      <div className="header-actions">
        <button className="btn btn-secondary" onClick={onRefresh} aria-label={`Refresh agreements (${documentCount} loaded)`}>

          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Refresh ({documentCount})
        </button>

        <button className="btn btn-primary" onClick={onOpenCreateModal}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Agreement
        </button>
      </div>
    </header>
  );
};
