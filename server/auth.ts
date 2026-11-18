import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getSetting } from './db.ts';

const COOKIE_NAME = 'sklad_session';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret(): string {
  return getSetting('auth_secret', 'fallback-secret-change-me');
}

export function createSessionToken(): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const nonce = crypto.randomBytes(12).toString('hex');
  const payload = `${exp}.${nonce}`;
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expStr, nonce, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  const payload = `${expStr}.${nonce}`;
  const expectedSig = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export function extractTokenFromRequest(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  const rawCookie = req.headers.cookie;
  if (!rawCookie) return undefined;
  const pairs = rawCookie.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key === COOKIE_NAME) {
      return decodeURIComponent(val);
    }
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string): void {
  const maxAgeSec = Math.floor(TOKEN_TTL_MS / 1000);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: maxAgeSec * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractTokenFromRequest(req);
  if (!verifySessionToken(token)) {
    res.status(401).json({ error: 'Требуется вход в систему' });
    return;
  }
  next();
}
