import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase } from './db/database.js';
import { initializeSchema } from './db/schema.js';
import { seedDatabase } from './db/seed.js';
import { DocumentRepository } from './repositories/document.repository.js';
import { CryptoService } from './services/crypto.service.js';
import { SigningService } from './services/signing.service.js';
import { DocumentController } from './controllers/document.controller.js';
import { createApiRouter } from './routes/api.routes.js';

export interface AppContext {
  app: Express;
  db: DatabaseSync;
  repo: DocumentRepository;
  cryptoService: CryptoService;
  signingService: SigningService;
  controller: DocumentController;
}

export function createApp(dbPath?: string, shouldSeed = true): AppContext {
  const app = express();
  app.use(cors());
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

  // Mount API
  app.use('/api', createApiRouter(controller));

  // Serve client bundle in production
  const candidateDistPaths = [
    path.resolve(process.cwd(), 'client/dist'),
    path.resolve(process.cwd(), '../client/dist'),
  ];
  const clientDist = candidateDistPaths.find((p) => fs.existsSync(p));
  if (clientDist) {
    app.use(express.static(clientDist));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // Global error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
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
