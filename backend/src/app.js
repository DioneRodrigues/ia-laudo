import Fastify, { LogController } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import transcribeRoutes from './routes/transcribe.js';
import { transcribeAudio } from './services/transcriptionService.js';

export async function buildApp(options = {}) {
  const app = Fastify({ logger: options.logger ?? true, logController: new LogController({ disableRequestLogging: true }), requestTimeout: 180000, bodyLimit: 21 * 1024 * 1024 });
  const origins = (options.corsOrigin ?? process.env.CORS_ORIGIN ?? 'https://pacs.evacenter.com')
    .split(',').map((value) => value.trim()).filter(Boolean);
  if (!origins.length || origins.includes('*') || origins.includes('null')) throw new Error('CORS_ORIGIN deve conter origens explícitas.');
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && !origins.includes(origin)) return reply.code(403).send({ success: false, error: 'Origem não autorizada pelo CORS_ORIGIN.' });
    reply.header('Cache-Control', 'no-store');
    // Compatibilidade com versões do Chrome que usam preflight de rede privada.
    if (origin && origins.includes(origin) && request.headers['access-control-request-private-network'] === 'true') {
      reply.header('Access-Control-Allow-Private-Network', 'true');
    }
  });
  await app.register(cors, { origin: origins, methods: ['POST', 'GET', 'OPTIONS'], allowedHeaders: ['Content-Type'], credentials: false });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 0, parts: 1 } });
  const uploadsDir = options.uploadsDir || fileURLToPath(new URL('../uploads/', import.meta.url));
  await mkdir(uploadsDir, { recursive: true, mode: 0o700 });
  app.get('/health', async () => ({ success: true }));
  await app.register(transcribeRoutes, { uploadsDir, transcribeAudio: options.transcribeAudio || transcribeAudio });
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    app.log.warn({ event: 'request_failed', statusCode });
    reply.code(statusCode).send({ success: false, error: statusCode === 413 ? 'O áudio excedeu o limite permitido.' : 'Requisição inválida ou falha interna.' });
  });
  return app;
}
