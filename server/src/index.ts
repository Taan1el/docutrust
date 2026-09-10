import { createApp } from './app.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

const { app } = createApp();

app.listen(PORT, () => {
  console.log(`[DocuTrust Server] REST API listening on http://localhost:${PORT}`);
  console.log(`[DocuTrust Server] Digital Signature Verification ready on /api/documents/:id/verify`);
});
