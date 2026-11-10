import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { requireAuth } from './auth.js';
import { errorHandler, notFound } from './errors.js';
import { formsRouter } from './routes/forms.js';
import { jobsRouter } from './routes/jobs.js';
import { meRouter } from './routes/me.js';

export function createApp({ db, verify, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // correct client IPs behind Render/Railway/Nginx

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : false }));
  app.use(express.json({ limit: '400kb' })); // profile photo is the largest body
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: config.rateLimitMax,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { code: 'rate_limited', message: 'Too many requests. Please slow down.' } },
    }),
  );

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  const auth = requireAuth({ verify, requireVerifiedEmail: config.requireVerifiedEmail });
  app.use('/api/v1', auth, meRouter({ db }), formsRouter({ db }), jobsRouter({ db }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
