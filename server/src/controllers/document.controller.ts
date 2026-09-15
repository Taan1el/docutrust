import { Request, Response } from 'express';
import { SigningService } from '../services/signing.service.js';
import { CryptoService } from '../services/crypto.service.js';
import { isDocuTrustError } from '../../../shared/errors.js';
import { parseSignPayload, parseTamperPayload } from '../../../shared/validation.js';

const MAX_CREATOR_NAME_LENGTH = 200;

function creatorNameFrom(body: unknown): string {
  const name = body && typeof body === 'object' ? (body as Record<string, unknown>).creatorName : undefined;
  if (typeof name === 'string' && name.trim()) {
    return name.trim().slice(0, MAX_CREATOR_NAME_LENGTH);
  }
  return 'Web User';
}

export class DocumentController {
  constructor(
    private signingService: SigningService,
    private cryptoService: CryptoService
  ) {}

  /** Sends a typed DocuTrustError with its own status, or a generic 500 for anything unexpected. */
  private handleError(err: unknown, res: Response, fallbackMessage: string): void {
    if (isDocuTrustError(err)) {
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    // Unexpected failures (database or crypto internals) are logged for
    // diagnosis but never sent to the client verbatim.
    console.error(fallbackMessage, err instanceof Error ? err.stack : err);
    res.status(500).json({ success: false, error: fallbackMessage });
  }

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
    } catch (err) {
      this.handleError(err, res, 'Failed to list documents');
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
    } catch (err) {
      this.handleError(err, res, 'Failed to get document');
    }
  };

  createDocument = (req: Request, res: Response): void => {
    try {
      const doc = this.signingService.createDocument(req.body, creatorNameFrom(req.body));
      res.status(201).json({ success: true, data: doc });
    } catch (err) {
      this.handleError(err, res, 'Document creation failed');
    }
  };

  signDocument = (req: Request, res: Response): void => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { signerId, privateKeyPem } = parseSignPayload(req.body);

      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const userAgent = (req.headers['user-agent'] as string) || 'DocuTrust-WebClient/1.0';

      const updated = this.signingService.signDocument(id, signerId, privateKeyPem, ip, userAgent);

      res.json({ success: true, data: updated });
    } catch (err) {
      this.handleError(err, res, 'Signing failed');
    }
  };

  verifyDocument = (req: Request, res: Response): void => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = this.signingService.verifyDocument(id);
      res.json({ success: true, data: result });
    } catch (err) {
      this.handleError(err, res, 'Verification failed');
    }
  };

  simulateTamper = (req: Request, res: Response): void => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const tamper = parseTamperPayload(req.body);
      const updated = this.signingService.simulateTamper(id, tamper);
      res.json({ success: true, data: updated });
    } catch (err) {
      this.handleError(err, res, 'Tamper simulation failed');
    }
  };

  generateKeypair = (req: Request, res: Response): void => {
    try {
      const algo = req.query.algo;
      const algorithm = algo === 'RSA_PSS_SHA256' ? 'RSA_PSS_SHA256' : 'ECDSA_P256_SHA256';
      const bundle = this.cryptoService.generateKeyPair(algorithm);
      res.json({ success: true, data: bundle });
    } catch (err) {
      this.handleError(err, res, 'Keypair generation failed');
    }
  };
}
