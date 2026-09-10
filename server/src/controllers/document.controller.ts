import { Request, Response } from 'express';
import { SigningService } from '../services/signing.service.js';
import { CryptoService } from '../services/crypto.service.js';

export class DocumentController {
  constructor(
    private signingService: SigningService,
    private cryptoService: CryptoService
  ) {}

  health = (_req: Request, res: Response): void => {
    res.json({
      status: 'healthy',
      service: 'docutrust-engine',
      timestamp: new Date().toISOString(),
    });
  };

  listDocuments = (_req: Request, res: Response): void => {
    try {
      const docs = this.signingService.getAllDocuments();
      res.json({ success: true, data: docs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to list documents' });
    }
  };

  getDocumentById = (req: Request, res: Response): void => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const doc = this.signingService.getDocumentById(id);

      if (!doc) {
        res.status(404).json({ success: false, error: `Document not found: ${id}` });
        return;
      }

      res.json({ success: true, data: doc });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to get document' });
    }
  };

  createDocument = (req: Request, res: Response): void => {
    try {
      const { title, content, signers, creatorName } = req.body;
      const doc = this.signingService.createDocument(
        { title, content, signers },
        creatorName || 'Web User'
      );
      res.status(201).json({ success: true, data: doc });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Document creation failed' });
    }
  };

  signDocument = (req: Request, res: Response): void => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { signerId, privateKeyPem } = req.body;

      if (!signerId) {
        res.status(400).json({ success: false, error: 'signerId is required in request body' });
        return;
      }

      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const userAgent = (req.headers['user-agent'] as string) || 'DocuTrust-WebClient/1.0';

      const updated = this.signingService.signDocument(
        id,
        signerId,
        privateKeyPem,
        ip,
        userAgent
      );

      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Signing failed' });
    }
  };

  verifyDocument = (req: Request, res: Response): void => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = this.signingService.verifyDocument(id);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Verification failed' });
    }
  };

  simulateTamper = (req: Request, res: Response): void => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { tamperedContent } = req.body;

      if (!tamperedContent) {
        res.status(400).json({ success: false, error: 'tamperedContent is required' });
        return;
      }

      const updated = this.signingService.simulateTamper(id, tamperedContent);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Tamper simulation failed' });
    }
  };

  generateKeypair = (req: Request, res: Response): void => {
    try {
      const algorithm = (req.query.algo as any) || 'ECDSA_P256_SHA256';
      const bundle = this.cryptoService.generateKeyPair(algorithm);
      res.json({ success: true, data: bundle });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}
