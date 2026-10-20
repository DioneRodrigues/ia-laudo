import { prepareClinicalDictationWithAI } from '../services/aiClinicalPipeline.js';
import { segmentTranscription } from '../services/clinicalSegmenter.js';
export default async function classifyClinicalSegmentsRoutes(app, { classifyClinicalSegments, clinicalFilterConfig }) {
  app.post('/classify-clinical-segments', { bodyLimit: 100000, schema: { body: {
    type: 'object', additionalProperties: false, required: ['examContext', 'segments'], properties: {
      examContext: { type: 'object', additionalProperties: false, properties: {
        name: { type: 'string', maxLength: 1000 }, id: { anyOf: [{ type: 'string', maxLength: 100 }, { type: 'null' }] },
      } },
      segments: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'object', additionalProperties: false,
        required: ['id', 'text'], properties: { id: { type: 'integer', minimum: 0 }, text: { type: 'string', minLength: 1, maxLength: 60000 } } } },
    },
  } } }, async (request, reply) => {
    const { segments, examContext } = request.body;
    const text = segments.map(s => s.text).join('\n');
    const originals = segmentTranscription(text);
    if (text.length > 60000 || originals.length !== segments.length || segments.some((s, id) => s.id !== id || s.text !== originals[id].text)) {
      return reply.code(400).send({ success: false, error: 'Segmentos inválidos: use IDs sequenciais e frases originais segmentadas.' });
    }
    const controller = new AbortController();
    const abort = () => { if (!reply.raw.writableEnded) controller.abort(); };
    request.raw.on('aborted', abort); reply.raw.on('close', abort);
    try {
      const result = await prepareClinicalDictationWithAI(text, { examName: examContext.name ?? examContext.id ?? '' }, app.log,
        { classifier: classifyClinicalSegments, config: clinicalFilterConfig, signal: controller.signal });
      return { success: true, ...result, segments: result.clinicalFilter.segments };
    } finally { request.raw.off('aborted', abort); reply.raw.off('close', abort); }
  });
}
