import React from 'react';
import { isDemoMode, resetDemoData } from '../services/index.js';

interface DemoBannerProps {
  onReset: () => void;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({ onReset }) => {
  if (!isDemoMode) return null;

  const handleReset = async () => {
    if (window.confirm('Reset the sample agreements? Agreements you created or edited in this browser are removed.')) {
      await resetDemoData();
      onReset();
    }
  };

  return (
    <div className="demo-bar">
      <div className="demo-bar-inner">
        <output>Demo: everything runs in your browser with sample data.</output>
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
