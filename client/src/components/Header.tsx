import React from 'react';
import { Plus, RefreshCw } from 'lucide-react';

interface HeaderProps {
  onOpenCreateModal: () => void;
  onRefresh: () => void;
  loading: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onOpenCreateModal, onRefresh, loading }) => (
  <header className="app-header">
    <div className="header-inner">
      <div>
        <h1 className="brand-name">DocuTrust</h1>
        <p className="brand-subtitle">
          Multi-party agreements signed with ECDSA keys and checked for edits after signing.
        </p>
      </div>
      <div className="header-actions">
        <button type="button" className="btn btn-secondary" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
          {loading ? 'Refreshing' : 'Refresh'}
        </button>
        <button type="button" className="btn btn-primary" onClick={onOpenCreateModal}>
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          New agreement
        </button>
      </div>
    </div>
  </header>
);
