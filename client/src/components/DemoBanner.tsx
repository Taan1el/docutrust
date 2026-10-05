import React from 'react';
import { isDemoMode, resetDemoData } from '../services/index.js';

interface DemoBannerProps {
  onReset: () => void;
  workspace?: boolean;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({ onReset, workspace = false }) => {
  if (!isDemoMode) return null;

  const handleReset = async () => {
    if (window.confirm('Reset the sample agreements? Your file workspace and signing identity are kept.')) {
      await resetDemoData();
      onReset();
    }
  };

  return (
    <div className="demo-bar">
      <div className="demo-bar-inner">
        <output>{workspace ? 'Your workspace: files are signed and verified in this browser.' : 'Demo: everything runs in your browser with sample data.'}</output>
        <span className="demo-bar-links">
          <button type="button" className="link-btn" onClick={handleReset}>
            Reset sample data
          </button>
          <a href="https://github.com/Taan1el/docutrust" target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </span>
      </div>
    </div>
  );
};
