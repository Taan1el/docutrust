import { Router } from 'express';
import { DocumentController } from '../controllers/document.controller.js';

export function createApiRouter(controller: DocumentController): Router {
  const router = Router();

  router.get('/health', controller.health);
  router.get('/documents', controller.listDocuments);
  router.post('/documents', controller.createDocument);
  router.get('/documents/:id', controller.getDocumentById);
  router.post('/documents/:id/sign', controller.signDocument);
  router.get('/documents/:id/verify', controller.verifyDocument);
  router.post('/documents/:id/tamper', controller.simulateTamper);
  router.get('/crypto/keypair', controller.generateKeypair);

  return router;
}
