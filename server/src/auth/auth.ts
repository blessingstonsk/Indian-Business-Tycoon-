import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import { DomainError } from '../../../shared/index';
import type { Caller } from '../shared/context';

// Google ID tokens (from Google Identity Services in the browser) are verified against Google's
// published keys; we then issue our own short session token (HS256) for API and WebSocket calls.

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const SESSION_TTL = '30d';

export interface AuthConfig {
  sessionSecret: string;
  googleClientId?: string;
  devLogin: boolean;
}

export class AuthService {
  private key: Uint8Array;
  private googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

  constructor(private readonly cfg: AuthConfig) {
    if (cfg.sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
    this.key = new TextEncoder().encode(cfg.sessionSecret);
  }

  get googleEnabled() {
    return Boolean(this.cfg.googleClientId);
  }

  get devLoginEnabled() {
    return this.cfg.devLogin;
  }

  async issue(caller: Caller): Promise<string> {
    return new SignJWT({ name: caller.name, picture: caller.picture })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(caller.uid)
      .setIssuedAt()
      .setExpirationTime(SESSION_TTL)
      .sign(this.key);
  }

  async verifySession(token: string | null | undefined): Promise<Caller | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      if (!payload.sub) return null;
      return { uid: payload.sub, name: (payload.name as string | null) ?? null, picture: (payload.picture as string | null) ?? null };
    } catch {
      return null;
    }
  }

  async verifyGoogle(credential: string): Promise<Caller> {
    if (!this.cfg.googleClientId) throw new DomainError('UNAUTHENTICATED', 'Google sign-in is not configured on this server');
    try {
      const { payload } = await jwtVerify(credential, this.googleKeys, { issuer: GOOGLE_ISSUERS, audience: this.cfg.googleClientId });
      if (!payload.sub) throw new Error('missing sub');
      return {
        uid: `g_${payload.sub}`,
        name: (payload.name as string | undefined) ?? null,
        picture: (payload.picture as string | undefined) ?? null,
      };
    } catch {
      throw new DomainError('UNAUTHENTICATED', 'Google sign-in could not be verified – please try again');
    }
  }

  /** Development only: sign in as a named test player. The same name always maps to the same uid. */
  devCaller(name: string): Caller {
    if (!this.cfg.devLogin) throw new DomainError('PERMISSION_DENIED', 'Test sign-in is disabled');
    const clean = name.trim().slice(0, 24);
    const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (slug.length < 2) throw new DomainError('INVALID_ACTION', 'Pick a name with at least 2 letters');
    return { uid: `dev_${slug}`, name: clean, picture: null };
  }
}
