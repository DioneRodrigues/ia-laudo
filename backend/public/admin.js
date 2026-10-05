(() => {
  const $ = (selector) => document.querySelector(selector);
  const loginView = $('#login-view'), unconfigured = $('#unconfigured-view'), dashboard = $('#dashboard');
  const statusName = { success: 'Sucesso', error: 'Erro', transcribing: 'Transcrevendo', processing: 'Processando', inserting: 'Inserindo' };
  const api = async (path, options = {}) => {
    const response = await fetch(`/admin/api/${path}`, {
      credentials: 'same-origin', cache: 'no-store',
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    let data;
    try { data = await response.json(); } catch { throw new Error(`Resposta inválida (${response.status}).`); }
    if (!response.ok || !data.success) throw new Error(data.error || `Falha HTTP ${response.status}.`);
    return data;
  };
  const node = (tag, className, text) => {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined && text !== null) result.textContent = String(text);
    return result;
  };
  const localDate = (timestamp, options) => {
    const date = new Date(timestamp);
    return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('pt-BR', options).format(date);
  };
  const duration = (seconds = 0) => {
    const total = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };
  const statusClass = (status) => status === 'success' ? 'success' : status === 'error' ? 'error' : 'pending';
  const appendHighlighted = (target, text, commands = []) => {
    const source = String(text || '');
    const matches = [];
    let cursor = 0;
    for (const command of commands) {
      const detected = String(command.detectedText || '');
      const index = detected ? source.indexOf(detected, cursor) : -1;
      if (index < 0) continue;
      matches.push({ start: index, end: index + detected.length, command });
      cursor = index + detected.length;
    }
    cursor = 0;
    for (const match of matches) {
      target.append(document.createTextNode(source.slice(cursor, match.start)));
      const mark = node('mark', 'command-highlight', source.slice(match.start, match.end));
      mark.title = match.command.label || 'Comando médico';
      target.append(mark, node('span', 'command-label', ` → ${match.command.label || 'Comando médico'}`));
      cursor = match.end;
    }
    target.append(document.createTextNode(source.slice(cursor)));
  };

  let logs = [], selectedId = null;
  function renderDetails(log) {
    const panel = $('#detail-panel'); panel.replaceChildren();
    const heading = node('div', 'detail-head');
    const title = node('div');
    title.append(node('div', 'eyebrow', `${localDate(log.timestamp, { day: '2-digit', month: 'long', year: 'numeric' })} · ${localDate(log.timestamp, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })}`));
    title.append(node('h2', '', log.patient?.name || 'Paciente não identificado'));
    title.append(node('p', '', log.exam?.name || 'Exame não identificado'));
    heading.append(title, node('span', `status ${statusClass(log.status)}`, statusName[log.status] || 'Desconhecido'));
    panel.append(heading);
    const metadata = node('div', 'detail-grid');
    const fields = [
      ['Sexo/idade', [log.patient?.gender, log.patient?.age].filter(Boolean).join(', ') || log.patient?.patientInfoRaw || '—'],
      ['Áudio', duration(log.audio?.durationSeconds)],
      ['Tamanho', `${((log.audio?.sizeBytes || 0) / 1024 / 1024).toFixed(2)} MB`],
      ['Transcrição', `${((log.transcription?.durationMs || 0) / 1000).toFixed(1)}s`],
    ];
    for (const [label, value] of fields) {
      const field = node('div', 'detail-field'); field.append(node('span', '', label), node('strong', '', value)); metadata.append(field);
    }
    panel.append(metadata);
    const original = node('p', 'clinical-text'); appendHighlighted(original, log.transcription?.originalText, log.commands);
    panel.append(section('Transcrição original', original));
    const commandList = node('ol', 'command-list');
    for (const command of log.commands || []) {
      const item = node('li', 'command-card');
      item.append(node('strong', '', command.label || command.id));
      item.append(node('p', '', `Detectado: “${command.detectedText || ''}”`));
      item.append(node('p', '', `Alias: “${command.alias || ''}”`));
      item.append(node('p', 'replacement', command.replacement || ''));
      commandList.append(item);
    }
    if (!commandList.childElementCount) commandList.append(node('li', 'command-card', 'Nenhum comando médico identificado.'));
    panel.append(section('Comandos identificados', commandList));
    panel.append(section('Texto final inserido no Eden', node('p', 'clinical-text', log.finalText || '')));
    if (log.error) {
      const error = node('div', 'error-box'); error.append(node('strong', '', `Falha em ${log.error.stage || 'etapa desconhecida'}`), node('p', '', log.error.message || 'Erro sem detalhes.'));
      panel.append(error);
    }
  }
  function section(title, content) {
    const result = node('section', 'detail-section'); result.append(node('h3', '', title), content); return result;
  }
  function renderList() {
    $('#log-count').textContent = `${logs.length} ${logs.length === 1 ? 'registro' : 'registros'}`;
    $('#last-update').textContent = `Atualizado ${localDate(new Date(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
    const list = $('#log-list'); list.replaceChildren();
    if (!logs.length) { list.append(node('p', 'placeholder', 'Nenhuma transcrição registrada ainda.')); $('#detail-panel').replaceChildren(node('div', 'placeholder', 'Aguardando o próximo ditado.')); selectedId = null; return; }
    for (const log of logs) {
      const item = node('button', 'log-item'); item.type = 'button'; item.setAttribute('aria-current', String(log.id === selectedId));
      const top = node('div', 'log-item-top');
      top.append(node('time', '', `${localDate(log.timestamp, { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${localDate(log.timestamp, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })}`));
      top.append(node('span', `status ${statusClass(log.status)}`, statusName[log.status] || 'Desconhecido'));
      item.append(top, node('strong', '', log.patient?.name || 'Paciente não identificado'));
      item.append(node('span', 'exam', log.exam?.name || 'Exame não identificado'));
      item.append(node('span', 'log-meta', `${duration(log.audio?.durationSeconds)} · ${log.commands?.length || 0} comandos`));
      item.onclick = () => { selectedId = log.id; renderList(); renderDetails(log); };
      list.append(item);
    }
    const selected = logs.find((log) => log.id === selectedId) || logs[0];
    selectedId = selected.id;
    const active = list.querySelector('[aria-current="true"]'); active?.setAttribute('aria-current', 'true');
    renderDetails(selected);
  }
  async function refresh() {
    try { logs = (await api('logs')).logs; renderList(); $('#dashboard-error').hidden = true; }
    catch (error) { $('#dashboard-error').textContent = error.message; $('#dashboard-error').hidden = false; }
  }
  async function show() {
    const session = await api('session');
    $('#logout').hidden = !session.authenticated;
    loginView.hidden = session.authenticated || !session.configured;
    unconfigured.hidden = session.configured;
    dashboard.hidden = !session.authenticated;
    if (session.authenticated) await refresh();
    return session;
  }
  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button'); button.disabled = true;
    $('#login-error').hidden = true;
    try {
      await api('login', { method: 'POST', body: JSON.stringify({ password: $('#password').value }) });
      $('#password').value = '';
      const session = await show();
      if (!session.authenticated) {
        const message = session.secureCookie && window.location.protocol !== 'https:'
          ? 'A senha foi aceita, mas o navegador não salvou o cookie Secure. Acesse o painel por HTTPS; em desenvolvimento HTTP local, defina ADMIN_COOKIE_SECURE=false e reinicie o backend.'
          : 'A senha foi aceita, mas a sessão não persistiu. Verifique se o navegador permite cookies para este domínio e se o painel está acessando a mesma instância do backend.';
        throw new Error(message);
      }
    } catch (error) { $('#login-error').textContent = error.message; $('#login-error').hidden = false; }
    finally { button.disabled = false; }
  });
  $('#logout').onclick = async () => { try { await api('logout', { method: 'POST', body: '{}' }); } finally { await show(); } };
  $('#refresh').onclick = refresh;
  $('#clear').onclick = async () => {
    if (!window.confirm('Tem certeza que deseja apagar os registros mantidos na memória do servidor?')) return;
    try { await api('logs/clear', { method: 'POST', body: '{}' }); logs = []; selectedId = null; renderList(); }
    catch (error) { $('#dashboard-error').textContent = error.message; $('#dashboard-error').hidden = false; }
  };
  void show().catch((error) => { $('#login-error').textContent = error.message; $('#login-error').hidden = false; loginView.hidden = false; });
  window.setInterval(() => { if (!dashboard.hidden) void refresh(); }, 5000);
})();
