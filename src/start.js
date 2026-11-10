// Local / traditional server entry point:  npm start
import app, { closeDb } from './app.js';
import { config } from './config.js';

const server = app.listen(config.port, () => {
  console.log(`Skill Sphere API listening on :${config.port} (${config.env})`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
