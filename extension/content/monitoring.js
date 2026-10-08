(() => {
  const EV = globalThis.EdenVoice ||= {};
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };
  const value = (input) => input || "—";
  const duration = (seconds) => {
    const total = Math.max(0, Math.floor(seconds || 0));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };
  const section = (title, content) => {
    const wrapper = element("section", "ev-log-detail-section");
    wrapper.append(element("h4", "", title), content);
    return wrapper;
  };

  function appendHighlightedText(container, text, commands) {
    const source = String(text || "");
    let cursor = 0;
    const matches = [];
    for (const command of commands || []) {
      const detectedText = String(command?.detectedText || "");
      if (!detectedText) continue;
      const start = source.indexOf(detectedText, cursor);
      if (start < 0) continue;
      matches.push({ start, end: start + detectedText.length, command });
      cursor = start + detectedText.length;
    }
    matches.sort((a, b) => a.start - b.start);
    cursor = 0;
    for (const match of matches) {
      if (match.start < cursor) continue;
      container.append(document.createTextNode(source.slice(cursor, match.start)));
      const mark = element("mark", "eden-voice-command-highlight", source.slice(match.start, match.end));
      mark.title = String(match.command.label || "Comando médico");
      container.append(mark, element("span", "ev-command-label", ` → ${match.command.label || "Comando médico"}`));
      cursor = match.end;
    }
    container.append(document.createTextNode(source.slice(cursor)));
  }

  EV.Monitoring = Object.freeze({
    appendHighlightedText,
    render(container, logs, selectedId, { onSelect, onClear, onBack }) {
      container.replaceChildren();
      const toolbar = element("div", "ev-history-toolbar");
      const back = element("button", "ev-history-back", "‹ Ditado");
      back.type = "button"; back.onclick = onBack;
      toolbar.append(back, element("h2", "", selectedId ? "Detalhes do ditado" : "Monitoramento"));
      if (!selectedId && logs.length) {
        const clear = element("button", "ev-history-clear", "Limpar histórico");
        clear.type = "button"; clear.onclick = onClear; toolbar.append(clear);
      }
      container.append(toolbar);
      if (selectedId) {
        const log = logs.find((item) => item.id === selectedId);
        if (!log) {
          container.append(element("p", "ev-history-empty", "Registro não encontrado."));
          return;
        }
        const details = element("div", "ev-history-details");
        const metadata = element("dl", "ev-log-metadata");
        const fields = [
          ["Paciente", log.patient?.name],
          ["Sexo/idade", [log.patient?.gender, log.patient?.age].filter(Boolean).join(", ") || log.patient?.patientInfoRaw],
          ["Exame", log.exam?.name],
          ["Contexto", log.exam?.contextLabel || "Não identificado"],
          ["Resolução", log.exam?.resolution === 'manual' ? 'Manual' : 'Automática'],
          ["Comandos", String(log.commands?.length || 0)], ["Data", log.date], ["Hora", log.time],
          ["Duração do áudio", duration(log.audio?.durationSeconds)],
          ["Tempo de transcrição", `${((log.transcription?.durationMs || 0) / 1000).toFixed(1)}s`],
          ["Status", log.status === "success" ? "Sucesso" : `Erro${log.error?.stage ? ` · ${log.error.stage}` : ""}`],
        ];
        for (const [term, text] of fields) {
          metadata.append(element("dt", "", term), element("dd", "", value(text)));
        }
        details.append(metadata);
        if (!log.exam?.contextId) details.append(element('p', 'ev-exam-warning', '⚠ Exame não identificado. Comandos médicos específicos desabilitados.'));
        const original = element("p", "ev-log-original-text");
        appendHighlightedText(original, log.transcription?.originalText, log.commands);
        details.append(section("Transcrição original", original));
        const commands = element("ol", "ev-log-commands");
        for (const command of log.commands || []) {
          const item = element("li", "");
          item.append(element("strong", "", command.label || command.id));
          item.append(element("p", "", `Detectado: “${command.detectedText || ""}”`));
          item.append(element("p", "", `Alias: “${command.alias || ""}”`));
          item.append(element("p", "ev-log-replacement", command.replacement || ""));
          commands.append(item);
        }
        if (!commands.childElementCount) commands.append(element("li", "", "Nenhum comando identificado."));
        details.append(section("Comandos identificados", commands));
        details.append(section("Texto final inserido no Eden", element("p", "ev-log-final-text", log.finalText || "")));
        if (log.error?.message) details.append(section("Erro", element("p", "ev-log-error", log.error.message)));
        container.append(details);
        return;
      }
      if (!logs.length) {
        container.append(element("p", "ev-history-empty", "As transcrições concluídas aparecerão aqui."));
        return;
      }
      const list = element("div", "ev-history-list");
      for (const log of logs) {
        const card = element("button", "ev-history-card");
        card.type = "button"; card.onclick = () => onSelect(log.id);
        card.append(element("strong", "", `${log.date || "—"} ${log.time || ""}`));
        card.append(element("span", "", value(log.patient?.name)));
        card.append(element("span", "", value(log.exam?.name)));
        card.append(element('span', log.exam?.contextId ? '' : 'ev-exam-warning', `Contexto: ${log.exam?.contextLabel || '⚠ Não identificado'} · Resolução: ${log.exam?.resolution === 'manual' ? 'Manual' : 'Automática'}`));
        const status = ({ recording: "Gravando", transcribing: "Transcrevendo", processing: "Processando", inserting: "Inserindo", success: "Sucesso", error: "Erro" })[log.status] || "Registro";
        card.append(element("small", "", `${duration(log.audio?.durationSeconds)} · ${log.commands?.length || 0} comandos · ${status}`));
        list.append(card);
      }
      container.append(list);
    },
  });
})();
