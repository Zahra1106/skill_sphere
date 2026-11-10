import { createApp } from './app.js';
import { createTokenVerifier } from './auth.js';
import { config } from './config.js';
import { openDb } from './db.js';

const db = await openDb({ url: config.databaseUrl, authToken: config.databaseAuthToken });
const verify = createTokenVerifier({ projectId: config.firebaseProjectId });
const app = createApp({ db, verify, config });

const server = app.listen(config.port, () => {
  console.log(`Skill Sphere API listening on :${config.port} (${config.env})`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
