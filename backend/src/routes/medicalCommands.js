import { getMedicalCommandCatalog } from '../services/commandProcessor.js';

export default async function medicalCommandRoutes(app) {
  app.get('/medical-commands', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { success: true, commands: getMedicalCommandCatalog() };
  });
}
