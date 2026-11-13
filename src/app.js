// The ready-to-use Express app (default export).
//
// * Vercel detects this file and calls the exported app for every request.
// * `src/start.js` imports it and calls listen() for local development.
//
// The database connection is opened lazily on the first request and reused.
import { createTokenVerifier } from './auth.js';
import { config } from './config.js';
import { createApp } from './create-app.js';
import { openDb } from './db.js';

let dbPromise;

function getDb() {
  dbPromise ??= (async () => {
    const serverless =
      process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT ||
      process.cwd().startsWith('/var/task');
    if (serverless && config.databaseUrl.startsWith('file:')) {
      throw new Error(
        'DATABASE_URL is not set. In Vercel -> Settings -> Environment Variables add ' +
          'DATABASE_URL (your Turso libsql:// URL) and DATABASE_AUTH_TOKEN, then redeploy.',
      );
    }
    return openDb({ url: config.databaseUrl, authToken: config.databaseAuthToken });
  })().catch((err) => {
    dbPromise = undefined; // try again on the next request
    console.error('Database startup failed:', err.message);
    throw err;
  });
  return dbPromise;
}

const db = {
  all: async (...args) => (await getDb()).all(...args),
  get: async (...args) => (await getDb()).get(...args),
  run: async (...args) => (await getDb()).run(...args),
  batch: async (...args) => (await getDb()).batch(...args),
  close: async () => {
    if (dbPromise) (await dbPromise).close();
  },
};

const app = createApp({
  db,
  verify: createTokenVerifier({ projectId: config.firebaseProjectId }),
  config,
});

export const closeDb = () => db.close();
export default app;