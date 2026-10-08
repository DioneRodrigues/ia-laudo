import { MEDICAL_COMMANDS } from '../src/services/commandProcessor.js';
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import OpenAI from "openai";
import { createTranscriptionService } from "../src/services/transcriptionService.js";
import { ULTRASOUND_TERMS } from "../src/config/transcriptionVocabulary.js";
import { ULTRASOUND_TRANSCRIPTION_CONTEXT as context } from "../src/config/transcriptionContext.js";

async function setup(t, overrides = {}, respond = () => ({ text: "Chammas 3" })) {
  const directory = await mkdtemp(join(tmpdir(), "eden-transcription-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "audio.webm");
  await writeFile(path, "fake-audio-only-for-unit-test");
  const calls = [], logs = [];
  let clientOptions;
  const transcribe = createTranscriptionService({
    env: { OPENAI_API_KEY: "test-key-never-send", ...overrides },
    logger: { info: (line) => logs.push(line), warn: (line) => logs.push(line) },
    createClient: (options) => {
      clientOptions = options;
      return { audio: { transcriptions: { create: async (request, options) => {
        calls.push({ request, options });
        // Consumir o arquivo como o SDK, inclusive nos testes de falha.
        for await (const chunk of request.file) assert.ok(chunk.length);
        return respond();
      } } } };
    },
  });
  return { path, transcribe, calls, logs, get clientOptions() { return clientOptions; } };
}

test("contexto contém vocabulário técnico e comandos, sem replacements", async () => {
  for (const term of ["Chammas 3", "hipoecogênico", "angiomiolipoma", "Doppler", ...ULTRASOUND_TERMS]) {
    assert.ok(context.includes(term), term);
  }
  assert.equal(new Set(ULTRASOUND_TERMS).size, ULTRASOUND_TERMS.length);
  assert.ok(ULTRASOUND_TERMS.every((term) => !/[<>\r\n]/u.test(term)));
  const commands = MEDICAL_COMMANDS;
  assert.ok(commands.length > 0);
  for (const command of commands) assert.ok(!context.includes(command.replacement), command.id);
  for (const instruction of ["Não resuma", "Não interprete clinicamente", "números", "medidas", "lateralidade", "negações", "não os expanda"]) {
    assert.ok(context.includes(instruction), instruction);
  }
});

for (const flag of [undefined, "true", "false"]) {
  test(`contexto com flag ${flag ?? "ausente (padrão habilitado)"}`, async (t) => {
    const fixture = await setup(t, { TRANSCRIPTION_MEDICAL_CONTEXT_ENABLED: flag });
    const signal = new AbortController().signal;
    assert.equal(await fixture.transcribe(fixture.path, { signal }), "Chammas 3");
    const { request, options } = fixture.calls[0];
    assert.equal(options.signal, signal);
    assert.equal(options.body.model, "gpt-transcribe");
    assert.deepEqual(options.body.languages, ["pt"]);
    assert.ok(!("language" in options.body));
    if (flag === "false") {
      assert.ok(!("prompt" in request));
      assert.ok(!("prompt" in options.body));
      assert.ok(!("keywords" in options.body));
    } else {
      assert.equal(options.body.prompt, context);
      assert.deepEqual(options.body.keywords, ULTRASOUND_TERMS);
    }
    assert.equal(fixture.clientOptions.maxRetries, 0);
    assert.equal(fixture.clientOptions.timeout, 120000);
    assert.equal(request.file.destroyed, true);
    const logs = fixture.logs.join("\n");
    assert.match(logs, /Transcrição concluída em/);
    for (const secret of ["test-key-never-send", "fake-audio", "Chammas 3", context]) assert.ok(!logs.includes(secret));
  });
}

test("modelo e timeout configurados por ENV, idioma singular para modelo anterior", async (t) => {
  const fixture = await setup(t, { OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-transcribe", OPENAI_TIMEOUT_MS: "8000" });
  await fixture.transcribe(fixture.path);
  const { body } = fixture.calls[0].options;
  assert.equal(body.model, "gpt-4o-transcribe");
  assert.equal(body.language, "pt");
  assert.ok(!("languages" in body));
  assert.ok(!("keywords" in body));
  assert.equal(body.prompt, context);
  assert.equal(fixture.clientOptions.timeout, 8000);
});

test("flag inválida falha claramente antes de chamar API", async (t) => {
  const fixture = await setup(t, { TRANSCRIPTION_MEDICAL_CONTEXT_ENABLED: "talvez" });
  await assert.rejects(fixture.transcribe(fixture.path), /deve ser true ou false/);
  assert.equal(fixture.calls.length, 0);
});

for (const error of [
  Object.assign(new Error("prompt clínico sensível"), { status: 400, param: "prompt" }),
  Object.assign(new Error("credenciais sensíveis"), { status: 401 }),
  Object.assign(new Error("limite"), { status: 429 }),
  Object.assign(new Error("indisponível"), { status: 500 }),
  Object.assign(new Error("timeout"), { name: "APIConnectionTimeoutError" }),
  Object.assign(new Error("cancelado"), { name: "AbortError" }),
]) {
  test(`propaga ${error.status ?? error.name} sem retry e fecha stream`, async (t) => {
    const fixture = await setup(t, {}, () => { throw error; });
    await assert.rejects(fixture.transcribe(fixture.path), (actual) => actual === error);
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0].request.file.destroyed, true);
    assert.ok(!fixture.logs.join("\n").includes(error.message));
    if (error.param === "prompt") assert.match(fixture.logs.join("\n"), /API rejeitou o contexto médico/);
  });
}

test("rejeita transcrição vazia e preserva conteúdo válido sem expansão", async (t) => {
  const empty = await setup(t, {}, () => ({ text: "  " }));
  await assert.rejects(empty.transcribe(empty.path), (error) => error.message === "Transcrição vazia" && error.code === "TRANSCRIPTION_EMPTY");
  assert.ok(empty.logs.includes("[Eden Voice API] O provedor retornou uma transcrição vazia"));
  const literal = "Nódulo sólido da tireoide. Chammas três. 1,2 cm à direita, sem fluxo.";
  const fixture = await setup(t, {}, () => ({ text: literal }));
  assert.equal(await fixture.transcribe(fixture.path), literal);
});

test("SDK instalado serializa prompt, keywords e languages no multipart sem rede", async (t) => {
  const fixture = await setup(t);
  let count = 0;
  const transcribe = createTranscriptionService({
    env: { OPENAI_API_KEY: "test-only" },
    logger: { info() {}, warn() {} },
    createClient: (options) => new OpenAI({ ...options, fetch: async (url, init) => {
      count++;
      assert.equal(new URL(url).pathname, "/v1/audio/transcriptions");
      const form = await new Request(url, init).formData();
      assert.equal(form.get("model"), "gpt-transcribe");
      assert.equal(form.get("prompt"), context);
      assert.deepEqual(form.getAll("languages[]"), ["pt"]);
      assert.equal(form.has("language"), false);
      assert.deepEqual(form.getAll("keywords[]"), ULTRASOUND_TERMS);
      assert.equal(await form.get("file").text(), "fake-audio-only-for-unit-test");
      return new Response(JSON.stringify({ text: "Chammas 3" }), { headers: { "content-type": "application/json" } });
    } }),
  });
  assert.equal(await transcribe(fixture.path), "Chammas 3");
  assert.equal(count, 1);
});
