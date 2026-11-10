import 'dotenv/config';

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '', 10) || 3000,

  // Firebase project that issues the ID tokens the app sends us.
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? 'skillsphere-7aada',

  // Local development: a SQLite file.   DATABASE_URL=file:./data/skillsphere.db
  // Vercel / production: a Turso URL.   DATABASE_URL=libsql://<db>-<org>.turso.io
  databaseUrl: process.env.DATABASE_URL ?? 'file:./data/skillsphere.db',
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN || undefined,

  // Only needed for Flutter *web*. Mobile apps ignore CORS.
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Same rule as the app: users must verify their email before using it.
  requireVerifiedEmail: (process.env.REQUIRE_VERIFIED_EMAIL ?? 'true') !== 'false',

  // Requests per IP per 15 minutes (per server instance).
  rateLimitMax: Number.parseInt(process.env.RATE_LIMIT_MAX ?? '', 10) || 600,
};
