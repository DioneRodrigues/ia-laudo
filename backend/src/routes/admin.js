import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));
const cookieName = 'eden_voice_admin';
const sessionDurationSeconds = 8 * 60 * 60;
const equalSecret = (expected, provided) => {
  if (typeof expected !== 'string' || typeof provided !== 'string') return false;
  const a = Buffer.from(expected), b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
};
const configReady = (password, secret) => typeof password === 'string' && password.length >= 12
  && typeof secret === 'string' && Buffer.byteLength(secret) >= 32;

export default async function adminRoutes(app, { store, password, sessionSecret, cookieSecure = true }) {
  const attempts = new Map();
  const sessions = new Map();
  const secure = cookieSecure === true || cookieSecure === 'true';
  const sign = (expires) => createHmac('sha256', sessionSecret).update(expires).digest('base64url');
  const sessionCookie = (token, maxAge) => `${cookieName}=${token}; Path=/admin/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  const cookieToken = (header = '') => header.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const validSession = (request) => {
    if (!configReady(password, sessionSecret)) return false;
    const token = cookieToken(request.headers.cookie);
    const separator = token?.indexOf('.') ?? -1;
    if (separator <= 0) return false;
    const expires = token.slice(0, separator);
    if (!/^\d{10,}$/u.test(expires) || Number(expires) <= Math.floor(Date.now() / 1000)) return false;
    const signature = token.slice(separator + 1);
    const valid = equalSecret(sign(expires), signature) && sessions.get(signature) === Number(expires);
    if (!valid && sessions.has(signature)) sessions.delete(signature);
    return valid;
  };
  const securityHeaders = (reply) => reply
    .header('Cache-Control', 'no-store')
    .header('X-Content-Type-Options', 'nosniff')
    .header('Referrer-Policy', 'no-referrer')
    .header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  const requireSession = async (request, reply) => {
    if (!validSession(request)) return reply.code(401).send({ success: false, error: 'Sessão administrativa necessária.' });
  };

  app.get('/admin', async (_request, reply) => {
    securityHeaders(reply);
    return reply.type('text/html; charset=utf-8').send(await readFile(join(publicDir, 'admin.html')));
  });
  app.get('/admin/styles.css', async (_request, reply) => {
    securityHeaders(reply);
    return reply.type('text/css; charset=utf-8').send(await readFile(join(publicDir, 'admin.css')));
  });
  app.get('/admin/app.js', async (_request, reply) => {
    securityHeaders(reply);
    return reply.type('text/javascript; charset=utf-8').send(await readFile(join(publicDir, 'admin.js')));
  });
  app.get('/admin/clinic-logo.png', async (_request, reply) => {
    securityHeaders(reply);
    return reply.type('image/png').send(await readFile(join(publicDir, 'clinic-logo.png')));
  });

  app.post('/admin/api/login', async (request, reply) => {
    securityHeaders(reply);
    if (!configReady(password, sessionSecret)) return reply.code(503).send({ success: false, error: 'Configure ADMIN_PASSWORD e ADMIN_SESSION_SECRET no backend.' });
    const ip = request.ip;
    const current = attempts.get(ip) || { count: 0, resetAt: 0 };
    if (current.resetAt <= Date.now()) { current.count = 0; current.resetAt = Date.now() + 60_000; }
    if (current.count >= 5) return reply.code(429).send({ success: false, error: 'Muitas tentativas. Aguarde um minuto.' });
    current.count++;
    attempts.set(ip, current);
    if (!equalSecret(password, request.body?.password)) return reply.code(401).send({ success: false, error: 'Senha inválida.' });
    attempts.delete(ip);
    const expires = String(Math.floor(Date.now() / 1000) + sessionDurationSeconds);
    const signature = sign(expires);
    for (const [active, expiry] of sessions) if (expiry <= Math.floor(Date.now() / 1000)) sessions.delete(active);
    if (sessions.size >= 5) return reply.code(429).send({ success: false, error: 'Limite de sessões administrativas atingido.' });
    sessions.set(signature, Number(expires));
    reply.header('Set-Cookie', sessionCookie(`${expires}.${signature}`, sessionDurationSeconds));
    return { success: true };
  });
  app.get('/admin/api/session', async (request, reply) => {
    securityHeaders(reply);
    return { success: true, authenticated: validSession(request), configured: configReady(password, sessionSecret), secureCookie: secure };
  });
  app.post('/admin/api/logout', { preHandler: requireSession }, async (request, reply) => {
    securityHeaders(reply);
    const token = cookieToken(request.headers.cookie);
    const signature = token?.slice(token.indexOf('.') + 1);
    if (signature) sessions.delete(signature);
    reply.header('Set-Cookie', sessionCookie('', 0));
    return { success: true };
  });
  app.get('/admin/api/logs', { preHandler: requireSession }, async (_request, reply) => {
    securityHeaders(reply);
    return { success: true, logs: store.list() };
  });
  app.post('/admin/api/logs/clear', { preHandler: requireSession }, async (_request, reply) => {
    securityHeaders(reply);
    store.clear();
    return { success: true };
  });
}
