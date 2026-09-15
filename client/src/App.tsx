import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import type { DocumentRecord, VerificationResult } from '../../shared/types.js';
import {
  fetchDocuments,
  fetchDocumentById,
  verifyDocument,
} from './services/api.js';
import { Header } from './components/Header.js';
import { DocumentList } from './components/DocumentList.js';
import { DocumentViewer } from './components/DocumentViewer.js';
import { SignModal } from './components/SignModal.js';
import { CreateDocumentModal } from './components/CreateDocumentModal.js';
import { TamperSimulatorModal } from './components/TamperSimulatorModal.js';

export const App: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentRecord | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSignOpen, setIsSignOpen] = useState(false);
  const [isTamperOpen, setIsTamperOpen] = useState(false);
  const [signingSignerId, setSigningSignerId] = useState<string | null>(null);

  // Load document list
  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const docs = await fetchDocuments();
      setDocuments(docs);
      if (docs.length > 0 && (!selectedDocId || !docs.some((d) => d.id === selectedDocId))) {
        setSelectedDocId(docs[0].id);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
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
  }, [selectedDocId]);

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

  const handleDocumentUpdated = async () => {
    if (selectedDocId) {
      const doc = await fetchDocumentById(selectedDocId);
      setSelectedDoc(doc);
      const vResult = await verifyDocument(selectedDocId);
      setVerification(vResult);
    }
    loadDocuments();
  };

  const activeSigner = selectedDoc?.signers.find((s) => s.id === signingSignerId);

  return (
    <div className="app-container">
      <Header
        onOpenCreateModal={() => setIsCreateOpen(true)}
        onRefresh={loadDocuments}
        documentCount={documents.length}
      />

      <main className="main-content">
        <div className="workspace-grid">
          <DocumentList
            documents={documents}
            selectedDocId={selectedDocId}
            onSelectDoc={setSelectedDocId}
            loading={loading}
          />

          <DocumentViewer
            document={selectedDoc}
            verification={verification}
            onVerify={handleManualVerify}
            onOpenSignModal={handleOpenSignModal}
            onOpenTamperModal={() => setIsTamperOpen(true)}
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

      <TamperSimulatorModal
        isOpen={isTamperOpen}
        documentId={selectedDocId || ''}
        currentTitle={selectedDoc?.title || ''}
        currentContent={selectedDoc?.content || ''}
        onClose={() => setIsTamperOpen(false)}
        onTampered={handleDocumentUpdated}
      />
    </div>
  );
};

export default App;
