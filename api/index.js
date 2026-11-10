// Vercel serverless entry point. Vercel calls the exported function for every
// request (vercel.json rewrites all paths here). The app + database connection
// are created once per warm instance and reused.
import { createApp } from '../src/app.js';
import { createTokenVerifier } from '../src/auth.js';
import { config } from '../src/config.js';
import { openDb } from '../src/db.js';

let appPromise;

function getApp() {
  appPromise ??= openDb({ url: config.databaseUrl, authToken: config.databaseAuthToken })
    .then((db) =>
      createApp({
        db,
        verify: createTokenVerifier({ projectId: config.firebaseProjectId }),
        config,
      }),
    )
    .catch((err) => {
      appPromise = undefined; // retry on the next request
      throw err;
    });
  return appPromise;
}

export default async function handler(req, res) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err) {
    console.error('Startup error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'startup_failed', message: 'Server is not ready. Check DATABASE_URL.' } }));
  }
}
