import { buildApp } from './app.js';

if (!process.env.OPENAI_API_KEY?.trim()) {
  console.error('Configure OPENAI_API_KEY no ambiente ou no arquivo backend/.env antes de iniciar.');
  process.exit(1);
}
const port = Number(process.env.PORT || 3001);
const timeout = Number(process.env.OPENAI_TIMEOUT_MS || 120000);
if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isFinite(timeout) || timeout < 1000 || timeout > 120000) {
  console.error('PORT inválida ou OPENAI_TIMEOUT_MS fora do intervalo de 1000 a 120000.');
  process.exit(1);
}
try {
  const app = await buildApp();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => { await app.close(); process.exit(0); });
  }
  await app.listen({ port, host: process.env.HOST || '127.0.0.1' });
} catch {
  console.error('Não foi possível iniciar o backend. Verifique a porta, CORS_ORIGIN e a permissão em uploads.');
  process.exit(1);
}
