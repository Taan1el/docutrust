import { createApp } from './app.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
// The API has no authentication, so it listens on loopback unless HOST says otherwise.
const HOST = process.env.HOST || '127.0.0.1';
const { app } = createApp(process.env.DOCUTRUST_DB_PATH || undefined);

app.listen(PORT, HOST, () => {
  console.log(`DocuTrust API listening on http://${HOST}:${PORT}`);
});
