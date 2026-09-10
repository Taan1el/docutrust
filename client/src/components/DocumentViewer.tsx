import React, { useState } from 'react';
import type { DocumentRecord, VerificationResult } from '../../../shared/types.js';

interface DocumentViewerProps {
  document: DocumentRecord | null;
  verification: VerificationResult | null;
  onVerify: () => void;
  onOpenSignModal: (signerId: string) => void;
  onOpenTamperModal: () => void;
  verifying: boolean;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  document,
  verification,
  onVerify,
  onOpenSignModal,
  onOpenTamperModal,
  verifying,
}) => {
  const [showAuditTrail, setShowAuditTrail] = useState(false);

  if (!document) {
    return (
      <div className="document-view-panel" style={{ padding: '3rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Select an agreement from the sidebar to inspect.</p>
      </div>
    );
  }

  const isTampered = verification?.isTampered;
  const isAllValid = verification?.isValid;

  return (
    <div className="document-view-panel">
      {/* Top Meta Ribbon */}
      <div className="doc-meta-ribbon">
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>{document.title}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.35rem' }}>
            <span className="hash-chip" title="Cryptographic SHA-256 Content Digest">
              SHA256:{document.contentHash.substring(0, 24)}...
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Created: {new Date(document.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button className="btn btn-secondary" onClick={onVerify} disabled={verifying}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            {verifying ? 'Verifying...' : 'Verify Cryptographic Integrity'}
          </button>
          <button className="btn btn-danger" onClick={onOpenTamperModal}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Simulate Tampering
          </button>
        </div>
      </div>

      {/* Tamper Warning Banner if tampered */}
      {isTampered && (
        <div className="tamper-banner">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <div>
            <strong style={{ fontSize: '0.95rem' }}>CRITICAL: Cryptographic Seal Violation Detected!</strong>
            <p style={{ fontSize: '0.82rem', marginTop: '0.15rem' }}>
              The current document text does not match the original SHA-256 digest signed by participants. All digital signatures have been mathematically invalidated.
            </p>
          </div>
        </div>
      )}

      {/* Verification Success Box */}
      {verification && !isTampered && isAllValid && (
        <div className="verification-box" style={{ borderColor: 'rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399', fontWeight: 700 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            All Digital Signatures Valid &amp; Seal Intact
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Verified against public key certificates via ECDSA P-256. Zero tampering detected.
          </p>
        </div>
      )}

      {/* Document Text Parchment */}
      <div className="parchment-sheet">
        {document.content}
      </div>

      {/* Signers & Digital Stamps */}
      <div className="signatures-section">
        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Signatures &amp; Public-Key Certificates</h3>

        <div className="signers-grid">
          {document.signers.map((signer) => {
            const isSigned = signer.status === 'SIGNED';

            return (
              <div
                key={signer.id}
                className={`signature-stamp-card ${isSigned ? 'signed' : ''}`}
              >
                {isSigned && (
                  <div className="stamp-seal">
                    Valid<br />e-ID Seal
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{signer.name}</span>
                  <span
                    className={`badge-status ${isSigned ? 'badge-completed' : 'badge-pending'}`}
                  >
                    {isSigned ? 'Signed' : 'Pending'}
                  </span>
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {signer.role} • {signer.email}
                </div>

                {isSigned ? (
                  <>
                    <div className="stamp-sig-line">
                      {signer.name}
                    </div>
                    <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Key Fingerprint: {signer.publicKeyPem ? signer.publicKeyPem.substring(28, 48) : 'ECDSA-P256'}...<br />
                      Signed: {signer.signedAt ? new Date(signer.signedAt).toLocaleString() : ''}<br />
                      Client: {signer.userAgent || 'Smart-ID'} ({signer.ipAddress})
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: '0.5rem' }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => onOpenSignModal(signer.id)}
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      Execute Digital Signature
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Collapsible Immutable Audit Log */}
      <div style={{ padding: '0 1.5rem 1.5rem 1.5rem' }}>
        <button
          className="btn btn-secondary"
          onClick={() => setShowAuditTrail(!showAuditTrail)}
          style={{ width: '100%', justifyContent: 'space-between' }}
        >
          <span>Immutable Cryptographic Audit Trail ({document.auditTrail?.length || 0} events)</span>
          <span>{showAuditTrail ? '▲ Hide' : '▼ View'}</span>
        </button>

        {showAuditTrail && document.auditTrail && (
          <div className="audit-list">
            {document.auditTrail.map((ev) => (
              <div key={ev.id} className="audit-entry">
                <div>
                  <strong style={{ color: 'var(--color-cyan)' }}>{ev.action}</strong>
                  <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                    by {ev.actorName}
                  </span>
                </div>
                <span style={{ color: 'var(--text-muted)' }}>
                  {new Date(ev.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
