import express, { Express, Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase } from './db/database.js';
import { initializeSchema } from './db/schema.js';
import { seedDatabase } from './db/seed.js';
import { DocumentRepository } from './repositories/document.repository.js';
import { CryptoService } from './services/crypto.service.js';
import { SigningService } from './services/signing.service.js';
import { DocumentController } from './controllers/document.controller.js';
import { createApiRouter } from './routes/api.routes.js';
import { defaultClientDir } from './config.js';
import { isDocuTrustError } from '../../shared/errors.js';

export interface AppContext {
  app: Express;
  db: DatabaseSync;
  repo: DocumentRepository;
  cryptoService: CryptoService;
  signingService: SigningService;
  controller: DocumentController;
}

export function createApp(dbPath?: string, shouldSeed = true, clientDir: string = defaultClientDir): AppContext {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(express.json({ limit: '10mb' }));

  const db = createDatabase(dbPath);
  initializeSchema(db);
  if (shouldSeed) {
    seedDatabase(db);
  }

  const repo = new DocumentRepository(db);
  const cryptoService = new CryptoService();
  const signingService = new SigningService(repo, cryptoService);
  const controller = new DocumentController(signingService, cryptoService);

  // There is no authentication, so two cheap guards matter for a locally run
  // API: responses are never cached, and POST bodies must be JSON, which a
  // cross-site HTML form cannot send without triggering a CORS preflight.
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'POST' && !req.is('application/json')) {
      res.status(415).json({ success: false, error: 'POST requests must use Content-Type: application/json' });
      return;
    }
    next();
  });
  app.use('/api', createApiRouter(controller));
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });

  // Serve the built client when it exists (production and Docker).
  if (fs.existsSync(path.join(clientDir, 'index.html'))) {
    app.use(express.static(clientDir));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  // Global error handler. Reached by body-parser failures (malformed or
  // oversized JSON) before routing, and as a safety net for anything a
  // controller did not catch itself; every controller method already catches
  // its own errors, so this should rarely fire in practice.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (isDocuTrustError(err)) {
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    const httpError = err as { type?: string; status?: number };
    if (httpError?.type === 'entity.parse.failed') {
      res.status(400).json({ success: false, error: 'Request body must be valid JSON' });
      return;
    }
    if (httpError?.type === 'entity.too.large') {
      res.status(413).json({ success: false, error: 'Request body is too large' });
      return;
    }
    // Log the real error server-side only; unexpected failures (database or
    // crypto library internals) never reach the client verbatim.
    console.error('Unhandled server error:', err instanceof Error ? err.stack : err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  });

  return {
    app,
    db,
    repo,
    cryptoService,
    signingService,
    controller,
  };
}
