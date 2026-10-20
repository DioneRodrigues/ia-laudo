import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentTranscription, buildFilteredText } from '../src/services/clinicalSegmenter.js';
import { createClinicalSegmentClassifier } from '../src/services/clinicalSegmentClassifier.js';
import { prepareClinicalDictationWithAI } from '../src/services/aiClinicalPipeline.js';
import { processMedicalCommands } from '../src/services/commandProcessor.js';
const silent = { info() {}, warn() {} };
const decision = (segments, included) => ({ segments: segments.map(s => ({ id: s.id, include: included.includes(s.id), reason: included.includes(s.id) ? 'report' : 'conversation' })) });
const examples = [
  ['Tireoide', 'E aí, tava comendo a comidinha gostosa aqui, que eu fiz.\nHum, bom, hein?\nVamos lá então.\nDimensões do lobo direito: 5.4, 3.2, 8.1.\nTransverso é 8.1, que eu já falei.', [3, 4]],
  ['Mama', 'Cara, eu tô aqui vendo a gravação do debate.\nPô, Lula...\nE, siliconeoma, cisto simples, mama esquerda sem alterações, mama direita também.\nDiagnóstico BI-RADS 1.', [2, 3]],
  ['Abdome', 'Você já fez cirurgia?\nSim, fiz ano passado.\nAusência da vesícula.\nColédoco mede 3,3 milímetros.', [2, 3]],
  ['Tireoide', 'Lobo direito, 4,5 por 4,2 por 2,0.\nLobo esquerdo, 1,5 por 4,2 por 3,2.\nIstmo, 1,5 por 2,0 por 5,3.', [0, 1, 2]],
  ['Mama', 'Siliconoma, ok.', [0]],
  ['Mama', 'Não tem nódulo sólido.', [0]],
];
for (const [index, [examName, text, ids]] of examples.entries()) test(`contrato com classificação simulada: exemplo ${index + 1}`, async () => {
  const result = await prepareClinicalDictationWithAI(text, { examName }, silent, {
    classifier: async ({ segments }) => decision(segments, ids),
  });
  assert.equal(result.clinicalFilter.mode, 'ai');
  assert.equal(result.filteredText, segmentTranscription(text).filter(s => ids.includes(s.id)).map(s => s.text).join(' '));
  if (index === 4) assert.equal(result.filterDetails.segments[0].reason, 'medical_command');
  if (index === 5) {
    assert.equal(result.filterDetails.segments[0].commandCandidates[0].execute, false);
    const details = {};
    assert.equal(processMedicalCommands(result.text, details, silent, { examName }), text);
    assert.equal(details.count, 0);
  }
});
test('proteção determinística vence exclusão da IA sem proteger alias negado', async () => {
  const result = await prepareClinicalDictationWithAI('Siliconeoma, ok. Não tem nódulo sólido.', { examName: 'Mama' }, silent, {
    classifier: async ({ segments }) => decision(segments, []),
  });
  assert.equal(result.filteredText, 'Siliconeoma, ok.');
  assert.equal(result.filterDetails.segments[0].reason, 'medical_command');
  assert.equal(result.filterDetails.segments[1].includeInReport, false);
});
test('reconstrução conserva ordem, números, lateralidade, negação e texto exato', () => {
  const source = 'Não há lesão à esquerda.\nLobo direito: 55.2, 3.2, 8.1.\nLobo direito: 55.2, 3.2, 8.1.';
  const segments = segmentTranscription(source);
  assert.equal(segments.length, 3);
  for (const s of segments) assert.equal(s.text, source.slice(s.start, s.end));
  const classification = decision(segments, [0, 1, 2]); classification.segments.reverse();
  assert.equal(buildFilteredText(segments, classification), source.replaceAll('\n', ' '));
});
for (const kind of ['missing', 'duplicate', 'unknown', 'rewritten', 'stringBoolean', 'invalidReason', 'contradictory', 'null', 'invalidJSON', 'http', 'refusal', 'incomplete']) test(`fallback seguro: ${kind}`, async () => {
  const input = 'Siliconoma, ok.';
  const classifier = createClinicalSegmentClassifier({ env: { OPENAI_API_KEY: 'test' }, createClient: () => ({ responses: { create: async () => {
    if (kind === 'http') throw new Error('sensitive provider message');
    const data = decision(segmentTranscription(input), [0]);
    if (kind === 'missing') data.segments = [];
    if (kind === 'duplicate') data.segments.push(data.segments[0]);
    if (kind === 'unknown') data.segments[0].id = 99;
    if (kind === 'rewritten') data.segments[0].text = 'Valor corrigido 5.2';
    if (kind === 'stringBoolean') data.segments[0].include = 'true';
    if (kind === 'contradictory') data.segments[0].reason = 'question';
    if (kind === 'invalidReason') data.segments[0].reason = 'provider leaked text';
    return { status: kind === 'incomplete' ? 'incomplete' : 'completed', output_text: kind === 'invalidJSON' ? '{' : kind === 'refusal' ? '' : JSON.stringify(kind === 'null' ? null : data) };
  } } }) });
  const result = await prepareClinicalDictationWithAI(input, { examName: 'Mama' }, silent, { classifier });
  assert.equal(result.clinicalFilter.mode, 'deterministic_fallback');
  assert.equal(result.filteredText, input);
});
test('deadline limita até cliente que ignora AbortSignal; sem retry', async () => {
  let calls = 0, signal;
  const started = Date.now();
  const result = await prepareClinicalDictationWithAI('Siliconoma.', { examName: 'Mama' }, silent, {
    config: { ENABLE_AI_FILTER: true, USE_DETERMINISTIC_FALLBACK: true, TIMEOUT_MS: 15 },
    classifier: (args) => { calls++; signal = args.signal; return new Promise(() => {}); },
  });
  assert.equal(calls, 1); assert.equal(signal.aborted, true); assert.ok(Date.now() - started < 1000);
  assert.equal(result.clinicalFilter.mode, 'deterministic_fallback');
});
test('config desabilitada não chama IA; fallback desligado bloqueia inserção', async () => {
  let calls = 0; const classifier = async () => { calls++; throw new Error('failed'); };
  const disabled = await prepareClinicalDictationWithAI('Siliconoma.', { examName: 'Mama' }, silent, { classifier, config: { ENABLE_AI_FILTER: false } });
  assert.equal(calls, 0); assert.equal(disabled.clinicalFilter.mode, 'deterministic_fallback');
  const blocked = await prepareClinicalDictationWithAI('Siliconoma.', { examName: 'Mama' }, silent, { classifier, config: { ENABLE_AI_FILTER: true, USE_DETERMINISTIC_FALLBACK: false, TIMEOUT_MS: 100 } });
  assert.equal(blocked.filterDetails.failed, true);
});
test('payload contém apenas contexto canônico e id/text; SDK sem retries nem armazenamento', async () => {
  let body, clientOptions;
  const classifier = createClinicalSegmentClassifier({ env: { OPENAI_API_KEY: 'test' }, createClient: (options) => {
    clientOptions = options;
    return { responses: { create: async (input) => { body = input; return { status: 'completed', output_text: JSON.stringify(decision(JSON.parse(input.input).segments, [0])) }; } } };
  } });
  await prepareClinicalDictationWithAI('Siliconoma.', { examName: 'Ultrassonografia das mamas', patientName: 'PRIVATE', cpf: 'PRIVATE', recordId: 'PRIVATE' }, silent, { classifier });
  const payload = JSON.parse(body.input);
  assert.deepEqual(Object.keys(payload).sort(), ['examContext', 'segments']);
  assert.deepEqual(payload.examContext, { name: 'Mama', id: 'mama' });
  assert.deepEqual(Object.keys(payload.segments[0]).sort(), ['id', 'text']);
  assert.ok(!JSON.stringify(body).includes('PRIVATE'));
  assert.equal(body.store, false); assert.equal(clientOptions.maxRetries, 0); assert.equal(body.text.format.strict, true);
});
test('logs não incluem texto clínico nem mensagens do provedor', async () => {
  const logs = []; const logger = { info: s => logs.push(s), warn: s => logs.push(s) };
  await prepareClinicalDictationWithAI('Siliconoma, conteúdo privado.', { examName: 'Mama' }, logger, { classifier: async () => { throw new Error('SECRET'); } });
  assert.ok(!logs.join(' ').includes('conteúdo privado')); assert.ok(!logs.join(' ').includes('SECRET'));
});
test('volume continua determinístico após classificação', async () => {
  const result = await prepareClinicalDictationWithAI('Rim direito 11 longitudinal, 4,3 AP, 4,8 transversal.', { examName: 'Abdome' }, silent, { classifier: async ({ segments }) => decision(segments, [0]) });
  assert.equal(result.measurements[0].volume, 118.7);
});
