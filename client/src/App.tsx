import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import type { DocumentRecord, VerificationResult } from '../../shared/types.js';
import {
  fetchDocuments,
  fetchDocumentById,
  verifyDocument,
} from './services/index.js';
import { Header } from './components/Header.js';
import { DocumentList } from './components/DocumentList.js';
import { DocumentViewer } from './components/DocumentViewer.js';
import { SignModal } from './components/SignModal.js';
import { CreateDocumentModal } from './components/CreateDocumentModal.js';
import { DemoBanner } from './components/DemoBanner.js';
import { StatsBar } from './components/StatsBar.js';

export const App: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentRecord | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [version, setVersion] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSignOpen, setIsSignOpen] = useState(false);
  const [signingSignerId, setSigningSignerId] = useState<string | null>(null);

  // Load document list
  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const docs = await fetchDocuments();
      setDocuments(docs);
      if (docs.length > 0 && (!selectedDocId || !docs.some((d) => d.id === selectedDocId))) {
        setSelectedDocId(docs[0].id);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load agreements');
    } finally {
      setLoading(false);
    }
  }, [selectedDocId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Load selected document and auto-verify
  useEffect(() => {
    if (!selectedDocId) {
      setSelectedDoc(null);
      setVerification(null);
      return;
    }

    let isMounted = true;
    const loadDetailAndVerify = async () => {
      try {
        const doc = await fetchDocumentById(selectedDocId);
        if (!isMounted) return;
        setSelectedDoc(doc);

        const vResult = await verifyDocument(selectedDocId);
        if (isMounted) setVerification(vResult);
      } catch (err) {
        console.error('Failed to load document details:', err);
      }
    };

    loadDetailAndVerify();
    return () => {
      isMounted = false;
    };
  }, [selectedDocId, version]);

  const handleManualVerify = async () => {
    if (!selectedDocId) return;
    try {
      setVerifying(true);
      const result = await verifyDocument(selectedDocId);
      setVerification(result);
    } catch (err) {
      console.error('Manual verification failed:', err);
    } finally {
      setVerifying(false);
    }
  };

  const handleOpenSignModal = (signerId: string) => {
    setSigningSignerId(signerId);
    setIsSignOpen(true);
  };

  const handleDocumentUpdated = () => {
    setVersion((v) => v + 1);
    void loadDocuments();
  };

  const activeSigner = selectedDoc?.signers.find((s) => s.id === signingSignerId);

  return (
    <div className="app-container">
      <DemoBanner onReset={handleDocumentUpdated} />
      <Header onOpenCreateModal={() => setIsCreateOpen(true)} onRefresh={loadDocuments} loading={loading} />

      <main className="app-main">
        {loadError && (
          <p role="alert" className="form-error">
            {loadError}
          </p>
        )}
        <div className="workspace">
          <aside className="shelf" aria-labelledby="agreements-title">
            <h2 id="agreements-title" className="panel-heading">Agreements</h2>
            <StatsBar documents={documents} />
            <DocumentList
              documents={documents}
              selectedDocId={selectedDocId}
              onSelectDoc={setSelectedDocId}
              loading={loading}
            />
          </aside>

          <DocumentViewer
            document={selectedDoc}
            verification={verification}
            onVerify={handleManualVerify}
            onOpenSignModal={handleOpenSignModal}
            onTampered={handleDocumentUpdated}
            verifying={verifying}
          />
        </div>
      </main>

      <CreateDocumentModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(id) => {
          loadDocuments();
          setSelectedDocId(id);
        }}
      />

      <SignModal
        isOpen={isSignOpen}
        documentId={selectedDocId || ''}
        signerId={signingSignerId}
        signerName={activeSigner?.name || ''}
        contentHash={selectedDoc?.contentHash || ''}
        onClose={() => setIsSignOpen(false)}
        onSigned={handleDocumentUpdated}
      />

    </div>
  );
};

export default App;
