// Synthetic smoke check. No audio/patient data, no changes to a running server.
import OpenAI from 'openai';
import { createClinicalSegmentClassifier } from '../src/services/clinicalSegmentClassifier.js';
import { buildApp } from '../src/app.js';
import { classifierProviderUrl } from '../src/services/clinicalClassifierDiagnostics.js';
const classifier = createClinicalSegmentClassifier({ createClient: options => {
  const client = new OpenAI(options);
  return { responses: { create: async (...args) => {
    const response = await client.responses.create(...args);
    if (process.argv.includes('--schema-diagnostics')) {
      let data; try { data = JSON.parse(response.output_text); } catch { /* No raw text printed. */ }
      console.log(JSON.stringify({ providerStatus: response.status, returnedSegments: Array.isArray(data?.segments) ? data.segments.map(s => ({
        id: Number.isInteger(s.id) ? s.id : 'invalid', include: typeof s.include === 'boolean' ? s.include : 'invalid',
        reason: ['report', 'question', 'patient_answer', 'instruction', 'conversation', 'unknown'].includes(s.reason) ? s.reason : 'invalid',
        expectedKeysOnly: Object.keys(s).sort().join(',') === 'id,include,reason',
      })) : 'invalid' }));
    }
    return response;
  } } };
} });
const app = await buildApp({ logger: false, classifyClinicalSegments: classifier });
try {
  const payload = { examContext: { name: 'Tireoide', id: 'tireoide' }, segments: [
    { id: 0, text: 'Teste, teste, som testando.' },
    { id: 1, text: 'Lobo direito 4.5 por 3.2 por 1.0.' },
    { id: 2, text: 'Lobo esquerdo 1.0, 2.3, 4.5.' },
    { id: 3, text: 'Istmo 1.5 por 3.4 por 2.5.' },
  ] };
  const response = await app.inject({ method: 'POST', url: '/classify-clinical-segments', payload });
  const result = response.json();
  console.log(JSON.stringify({ endpointRegistered: app.hasRoute({ method: 'POST', url: '/classify-clinical-segments' }),
    endpointStatus: response.statusCode, providerUrl: classifierProviderUrl(), clinicalFilter: result.clinicalFilter,
    measurements: result.measurements?.map(({ structure, values }) => ({ structure, values })),
  }, null, 2));
  if (response.statusCode !== 200 || result.clinicalFilter?.mode !== 'ai' || result.measurements?.length !== 3) process.exitCode = 1;
} finally { await app.close(); }
