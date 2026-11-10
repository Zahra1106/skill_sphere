import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HttpError } from './errors.js';

// Public keys Google uses to sign Firebase ID tokens.
const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/**
 * Returns an async function that verifies a Firebase ID token and returns its
 * claims. Follows Firebase's documented checks: RS256, issuer, audience, exp.
 * `jwks` can be injected (used by the tests).
 */
export function createTokenVerifier({ projectId, jwks }) {
  const keys = jwks ?? createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));
  return async (token) => {
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    if (typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 128) {
      throw new Error('Invalid subject');
    }
    return payload;
  };
}

/** Middleware: requires `Authorization: Bearer <Firebase ID token>`. */
export function requireAuth({ verify, requireVerifiedEmail }) {
  return async (req, _res, next) => {
    const match = /^Bearer (.+)$/i.exec(req.headers.authorization ?? '');
    if (!match) return next(new HttpError(401, 'unauthenticated', 'Please sign in.'));

    let claims;
    try {
      claims = await verify(match[1]);
    } catch {
      return next(
        new HttpError(401, 'invalid_token', 'Your session has expired. Please sign in again.'),
      );
    }

    if (requireVerifiedEmail && claims.email_verified !== true) {
      return next(new HttpError(403, 'email_not_verified', 'Please verify your email first.'));
    }

    req.user = {
      uid: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : '',
      name: typeof claims.name === 'string' ? claims.name : '',
    };
    next();
  };
}
