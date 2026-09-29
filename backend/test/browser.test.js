import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { buildApp } from '../src/app.js';

test('Chrome: TipTap real e fluxo de ditado com microfone simulado', { timeout: 60000 }, async (t) => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('./fixtures/editor.js', import.meta.url))], bundle: true, write: false, format: 'iife' });
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/editor.js' ? 'text/javascript' : 'text/html');
    response.end(request.url === '/editor.js' ? bundle.outputFiles[0].text : '<!doctype html><html><body><div id="editor"></div><script src="/editor.js"></script></body></html>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const uploadsDir = await mkdtemp(join(tmpdir(), 'eden-browser-'));
  const app = await buildApp({ logger: false, uploadsDir, corsOrigin: origin, transcribeAudio: async (path) => {
    assert.ok((await readFile(path)).length > 0); return 'Texto transcrito de teste.';
  } });
  const api = await app.listen({ port: 0, host: '127.0.0.1' });
  t.after(async () => { await app.close(); await rm(uploadsDir, { recursive: true, force: true }); });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const script = (name) => page.addScriptTag({ path: fileURLToPath(new URL(`../../extension/content/${name}.js`, import.meta.url)) });
  const prepare = async (controller = false) => {
    await page.goto(origin);
    await page.waitForFunction(() => window.testEditor);
    await script('config');
    await page.evaluate((api) => { EdenVoice.CONFIG = { ...EdenVoice.CONFIG, API_BASE_URL: api, AUTO_SUBMIT: false }; }, api);
    await script('edenEditor');
    if (controller) {
      for (const name of ['recorder', 'edenControls', 'ui', 'content']) await script(name);
      await page.addStyleTag({ path: fileURLToPath(new URL('../../extension/styles/content.css', import.meta.url)) });
    }
  };
  const nativeControls = async ({ active = false, unknown = false, disabled = false, pauseFails = false } = {}) => {
    await page.evaluate((options) => {
      EdenVoice.CONFIG = { ...EdenVoice.CONFIG, AUTO_SUBMIT: true, EDEN_CONTROL_TIMEOUT_MS: 600 };
      window.nativeClicks = 0; window.submitClicks = 0; window.submittedText = '';
      const toggle = document.createElement('div');
      toggle.dataset.testid = 'toggle-eden-ai-dictation-button';
      toggle.tabIndex = 0;
      toggle.innerHTML = '<svg width="53" height="53"><circle cx="26" cy="26" r="20" /></svg><span></span>';
      toggle.querySelector('span').textContent = options.unknown ? 'Estado desconhecido' : options.active ? 'Escutando' : 'Escuta em pausa.';
      toggle.onclick = () => {
        nativeClicks++;
        if (!options.pauseFails) toggle.querySelector('span').textContent = toggle.textContent.includes('pausa') ? 'Escutando' : 'Escuta em pausa.';
      };
      const submit = document.createElement('button');
      submit.dataset.testid = 'execute-eden-ai-command-button';
      submit.textContent = 'Criar relatório'; submit.disabled = options.disabled;
      submit.onclick = () => { submitClicks++; submittedText = testEditor.getText(); testEditor.commands.clearContent(); };
      document.body.prepend(toggle, submit);
    }, { active, unknown, disabled, pauseFails });
  };
  await t.test('botão nativo inicia, finaliza, transcreve e envia uma única vez', async () => {
    await prepare(true); await nativeControls();
    await page.locator('[data-testid="toggle-eden-ai-dictation-button"] svg').click();
    await page.getByRole('button', { name: 'Finalizar' }).waitFor();
    assert.equal(await page.evaluate(() => nativeClicks), 0);
    await page.waitForTimeout(250);
    await page.locator('[data-testid="toggle-eden-ai-dictation-button"] svg').click();
    await page.getByText('✅ Comando enviado ao Eden', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => [nativeClicks, submitClicks, submittedText]), [0, 1, 'Texto transcrito de teste.']);
    assert.equal(await page.evaluate(() => testEditor.getText()), '');
  });
  await t.test('pausa nativa é confirmada antes de abrir o microfone', async () => {
    await prepare(true); await nativeControls({ active: true });
    await page.evaluate(() => {
      const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (...args) => {
        window.pausedBeforeMicrophone = document.querySelector('[data-testid="toggle-eden-ai-dictation-button"]').textContent.includes('pausa');
        return get(...args);
      };
    });
    await page.getByRole('button', { name: 'Iniciar gravação' }).click();
    await page.getByRole('button', { name: 'Finalizar' }).waitFor();
    assert.deepEqual(await page.evaluate(() => [nativeClicks, pausedBeforeMicrophone]), [1, true]);
  });
  for (const options of [{ unknown: true }, { active: true, pauseFails: true }]) {
    await t.test(`não abre microfone sem pausa confirmada: ${JSON.stringify(options)}`, async () => {
      await prepare(true); await nativeControls(options);
      await page.evaluate(() => { window.micRequests = 0; navigator.mediaDevices.getUserMedia = async () => { micRequests++; throw new Error('Não deveria gravar'); }; });
      await page.locator('[data-testid="toggle-eden-ai-dictation-button"] svg').click();
      await page.getByRole('alert').filter({ hasText: /pausa/ }).waitFor();
      assert.equal(await page.evaluate(() => micRequests), 0);
    });
  }
  await t.test('envio espera botão habilitar e bloqueia clique manual durante processamento', async () => {
    await prepare(true); await nativeControls({ disabled: true });
    await page.evaluate(() => testEditor.commands.setContent('<p>Texto existente.</p>'));
    await page.locator('[data-testid="toggle-eden-ai-dictation-button"] svg').click();
    await page.getByRole('button', { name: 'Finalizar' }).waitFor();
    await page.waitForTimeout(250);
    await page.locator('[data-testid="toggle-eden-ai-dictation-button"] svg').click();
    await page.getByText('Texto inserido. Enviando ao Eden…', { exact: true }).waitFor();
    await page.evaluate(() => {
      const button = document.querySelector('[data-testid="execute-eden-ai-command-button"]');
      button.disabled = false;
      button.click();
    });
    await page.getByText('✅ Comando enviado ao Eden', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => [submitClicks, submittedText]), [1, 'Texto existente.\n\nTexto transcrito de teste.']);
  });
  await t.test('botão indisponível preserva texto e não reenvia nem reinsere', async () => {
    await prepare(true); await nativeControls({ disabled: true });
    await page.locator('[data-testid="toggle-eden-ai-dictation-button"] svg').click();
    await page.getByRole('button', { name: 'Finalizar' }).waitFor();
    await page.waitForTimeout(250);
    await page.locator('[data-testid="toggle-eden-ai-dictation-button"] svg').click();
    await page.getByRole('alert').filter({ hasText: 'Envie pelo Eden manualmente' }).waitFor();
    assert.equal(await page.evaluate(() => submitClicks), 0);
    assert.equal(await page.evaluate(() => testEditor.getText()), 'Texto transcrito de teste.');
  });
  await t.test('mudança de exame durante espera do botão cancela envio', async () => {
    await prepare(true); await nativeControls({ disabled: true });
    await page.locator('[data-testid="toggle-eden-ai-dictation-button"] svg').click();
    await page.getByRole('button', { name: 'Finalizar' }).waitFor();
    await page.waitForTimeout(250);
    await page.locator('[data-testid="toggle-eden-ai-dictation-button"] svg').click();
    await page.getByText('Texto inserido. Enviando ao Eden…', { exact: true }).waitFor();
    await page.evaluate(() => {
      history.pushState({}, '', '/outro-exame');
      document.querySelector('[data-testid="execute-eden-ai-command-button"]').disabled = false;
    });
    await page.getByRole('alert').filter({ hasText: /mudou/ }).waitFor();
    assert.equal(await page.evaluate(() => submitClicks), 0);
  });
  await t.test('falha ao inserir impede Criar relatório', async () => {
    await prepare(true); await nativeControls();
    await page.evaluate(() => { EdenVoice.insertTextIntoEden = async () => { throw new Error('Inserção recusada.'); }; });
    await page.locator('[data-testid="toggle-eden-ai-dictation-button"] svg').click();
    await page.getByRole('button', { name: 'Finalizar' }).waitFor();
    await page.waitForTimeout(250);
    await page.locator('[data-testid="toggle-eden-ai-dictation-button"] svg').click();
    await page.getByRole('alert').filter({ hasText: 'Inserção recusada' }).waitFor();
    assert.equal(await page.evaluate(() => submitClicks), 0);
  });
  await t.test('inserção modifica o estado interno e permite edição posterior', async () => {
    await prepare();
    await page.evaluate(() => EdenVoice.insertTextIntoEden('Primeiro texto.'));
    assert.equal(await page.evaluate(() => testEditor.getText()), 'Primeiro texto.');
    await page.evaluate(() => EdenVoice.insertTextIntoEden('Segundo texto.'));
    assert.equal(await page.evaluate(() => testEditor.getText()), 'Primeiro texto.\n\nSegundo texto.');
    await page.keyboard.type(' Continuacao.');
    assert.ok((await page.evaluate(() => testEditor.getText())).endsWith('Segundo texto. Continuacao.'));
  });
  await t.test('fallback paste atualiza o documento ProseMirror', async () => {
    await prepare();
    await page.evaluate(() => { document.execCommand = () => false; testEditor.commands.setContent('<p>Existente.</p>'); });
    const result = await page.evaluate(() => EdenVoice.insertTextIntoEden('Novo texto.'));
    assert.equal(result.method, 'ClipboardEvent(paste)');
    assert.equal(await page.evaluate(() => testEditor.getText()), 'Existente.\n\nNovo texto.');
  });
  await t.test('inserção parcial não é confundida com sucesso nem repetida', async () => {
    await prepare();
    await page.evaluate(() => {
      testEditor.commands.setContent('<p>Mesmo texto.</p>');
      const exec = document.execCommand.bind(document);
      document.execCommand = (command, ...args) => command === 'insertText' ? false : exec(command, ...args);
    });
    await assert.rejects(page.evaluate(() => EdenVoice.insertTextIntoEden('Mesmo texto.')), /confirmar a inserção completa/);
    assert.equal(await page.evaluate(() => testEditor.getText().trim()), 'Mesmo texto.');
  });
  await t.test('não interpreta HTML nem escolhe entre dois editores', async () => {
    await prepare();
    await page.evaluate(() => EdenVoice.insertTextIntoEden('<img src=x onerror=alert(1)>'));
    assert.equal(await page.locator('.tiptap img').count(), 0);
    assert.equal(await page.evaluate(() => testEditor.getText()), '<img src=x onerror=alert(1)>');
    await page.evaluate(() => document.body.append(document.querySelector('.tiptap').cloneNode(true)));
    await assert.rejects(page.evaluate(() => EdenVoice.insertTextIntoEden('Não inserir')), /Mais de um editor/);
  });
  await t.test('grava, fecha tracks, reproduz, envia multipart e insere', async () => {
    await prepare(true);
    await page.evaluate(() => {
      const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (...args) => { window.testStream = await get(...args); return testStream; };
    });
    await page.getByRole('button', { name: 'Iniciar gravação' }).click();
    await page.getByRole('button', { name: 'Finalizar' }).waitFor();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Finalizar' }).click();
    await page.getByRole('button', { name: 'Transcrever', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => testStream.getTracks().every((track) => track.readyState === 'ended')), true);
    await page.locator('audio').evaluate((audio) => audio.play());
    await page.getByRole('button', { name: 'Transcrever', exact: true }).click();
    await page.getByText('✅ Texto inserido no Eden', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => testEditor.getText()), 'Texto transcrito de teste.');
    assert.equal(await page.locator('#eden-voice-transcriber-root').count(), 1);
    assert.equal(await page.locator('audio').getAttribute('src'), null);
  });
  await t.test('troca de rota durante requisição impede inserir', async () => {
    await prepare(true);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route('**/transcribe', async (route) => { await gate; await route.fulfill({ json: { success: true, text: 'Não inserir.' } }).catch(() => {}); });
    await page.getByRole('button', { name: 'Iniciar gravação' }).click();
    await page.getByRole('button', { name: 'Finalizar' }).waitFor();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Finalizar' }).click();
    await page.getByRole('button', { name: 'Transcrever', exact: true }).click();
    await page.evaluate(() => history.pushState({}, '', '/outro-exame'));
    await page.getByRole('alert').filter({ hasText: 'A página ou o editor mudou' }).waitFor();
    release();
    assert.equal(await page.evaluate(() => testEditor.getText()), '');
    await page.unrouteAll({ behavior: 'wait' });
  });
  await t.test('SPA: editor tardio, painel único e remontagem', async () => {
    await prepare();
    await page.evaluate(() => { window.savedEditor = document.querySelector('#editor'); savedEditor.remove(); });
    for (const name of ['recorder', 'edenControls', 'ui', 'content']) await script(name);
    assert.equal(await page.locator('#eden-voice-transcriber-root').count(), 0);
    await page.evaluate(() => document.body.append(savedEditor));
    await page.locator('#eden-voice-transcriber-root').waitFor();
    await page.evaluate(() => document.querySelector('#eden-voice-transcriber-root').remove());
    await page.locator('#eden-voice-transcriber-root').waitFor();
    await script('config');
    await script('content');
    assert.equal(await page.locator('#eden-voice-transcriber-root').count(), 1);
  });
  for (const [name, message] of [['NotAllowedError', 'Acesso ao microfone recusado'], ['NotFoundError', 'Nenhuma entrada de áudio encontrada']]) {
    await t.test(`microfone: ${name}`, async () => {
      await prepare(true);
      await page.evaluate((name) => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('teste', name); }; }, name);
      await page.getByRole('button', { name: 'Iniciar gravação' }).click();
      await page.getByRole('alert').filter({ hasText: message }).waitFor();
    });
  }
  await t.test('microfone liberado após permissão tardia em outra rota', async () => {
    await prepare(true);
    await page.evaluate(() => {
      const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = () => new Promise((resolve) => {
        window.grantMicrophone = async () => { window.lateStream = await get({ audio: true }); resolve(lateStream); };
      });
    });
    await page.getByRole('button', { name: 'Iniciar gravação' }).click();
    await page.evaluate(() => history.pushState({}, '', '/novo'));
    await page.getByRole('alert').filter({ hasText: 'A página ou o editor mudou' }).waitFor();
    await page.evaluate(() => grantMicrophone());
    await page.waitForFunction(() => lateStream.getTracks().every((track) => track.readyState === 'ended'));
  });
  for (const [label, response, expected] of [
    ['JSON inválido', { status: 200, contentType: 'text/html', body: '<html>erro</html>' }, 'Resposta HTTP inválida'],
    ['texto ausente', { json: { success: true } }, 'sem text válido'],
    ['erro HTTP', { status: 503, json: { success: false, error: 'Serviço indisponível.' } }, 'Serviço indisponível'],
  ]) await t.test(`resposta do backend: ${label}`, async () => {
    await prepare(true);
    await page.route('**/transcribe', (route) => route.fulfill(response));
    await page.getByRole('button', { name: 'Iniciar gravação' }).click();
    await page.getByRole('button', { name: 'Finalizar' }).waitFor();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: 'Finalizar' }).click();
    await page.getByRole('button', { name: 'Transcrever', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: expected }).waitFor();
    assert.equal(await page.evaluate(() => testEditor.getText()), '');
    await page.getByRole('button', { name: 'Descartar' }).click();
    await page.getByRole('button', { name: 'Iniciar gravação' }).waitFor();
    await page.unrouteAll({ behavior: 'wait' });
  });
});
