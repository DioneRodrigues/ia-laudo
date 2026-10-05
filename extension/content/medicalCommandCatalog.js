(() => {
  const EV = globalThis.EdenVoice ||= {};
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };
  const normalize = (value) => String(value || '').toLocaleLowerCase('pt-BR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  function render(container, { commands = [], loading = false, error = '', onRetry = () => {} } = {}) {
    container.replaceChildren();
    const heading = el('div', 'ev-mask-page-heading');
    const title = el('div');
    title.append(el('span', 'ev-mask-eyebrow', 'CONSULTA · SOMENTE VISUALIZAÇÃO'));
    title.append(el('h2', '', 'Máscaras médicas'));
    title.append(el('p', '', 'Veja o que está cadastrado e quais expressões ativam cada texto.'));
    heading.append(title, el('span', 'ev-mask-total', loading ? '…' : `${commands.length} ${commands.length === 1 ? 'máscara' : 'máscaras'}`));
    container.append(heading);

    if (loading) {
      container.append(el('p', 'ev-mask-message', 'Carregando máscaras do catálogo…'));
      return;
    }
    if (error) {
      const message = el('div', 'ev-mask-error');
      message.append(el('p', '', error));
      const retry = el('button', 'ev-mask-retry', 'Tentar novamente');
      retry.type = 'button'; retry.onclick = onRetry;
      message.append(retry); container.append(message);
      return;
    }
    if (!commands.length) {
      container.append(el('p', 'ev-mask-message', 'Nenhuma máscara está cadastrada no momento.'));
      return;
    }

    const normalizedCommands = commands.map((command) => ({
      ...command,
      category: command.category || 'Geral',
      searchText: normalize([command.label, command.category, command.replacement, ...(command.aliases || [])].join(' ')),
    }));
    const categories = ['Todas', ...new Set(normalizedCommands.map((command) => command.category))];
    let activeCategory = 'Todas';
    const search = el('input', 'ev-mask-search');
    search.type = 'search';
    search.placeholder = 'Buscar por nome, expressão ou conteúdo';
    search.setAttribute('aria-label', 'Buscar máscaras médicas');
    container.append(search);

    const filters = el('div', 'ev-mask-filters');
    const results = el('div', 'ev-mask-results');
    container.append(filters, results);
    const resultCount = el('p', 'ev-mask-result-count');
    container.insertBefore(resultCount, results);
    const filterButtons = new Map();

    const renderResults = () => {
      const query = normalize(search.value.trim());
      const matches = normalizedCommands.filter((command) =>
        (activeCategory === 'Todas' || command.category === activeCategory)
        && (!query || command.searchText.includes(query)));
      resultCount.textContent = `${matches.length} ${matches.length === 1 ? 'resultado' : 'resultados'}`;
      results.replaceChildren();
      if (!matches.length) {
        results.append(el('p', 'ev-mask-message', 'Nenhuma máscara encontrada. Tente outro termo ou categoria.'));
        return;
      }
      for (const command of matches) {
        const card = el('details', 'ev-mask-card');
        const summary = el('summary', 'ev-mask-summary');
        const identity = el('span', 'ev-mask-identity');
        identity.append(el('span', 'ev-mask-category', command.category), el('strong', '', command.label || command.id));
        summary.append(identity, el('span', 'ev-mask-open-hint', 'Ver conteúdo'));
        const body = el('div', 'ev-mask-card-body');
        const aliasList = el('ul', 'ev-mask-alias-list');
        for (const alias of command.aliases || []) aliasList.append(el('li', '', alias));
        body.append(el('h3', '', 'Expressões reconhecidas'), aliasList);
        body.append(el('h3', 'ev-mask-content-title', 'Texto inserido no laudo'), el('p', 'ev-mask-replacement', command.replacement));
        card.append(summary, body); results.append(card);
      }
    };

    for (const category of categories) {
      const filter = el('button', 'ev-mask-filter', category);
      filter.type = 'button'; filter.setAttribute('aria-pressed', String(category === activeCategory));
      filter.onclick = () => {
        activeCategory = category;
        for (const [name, button] of filterButtons) button.setAttribute('aria-pressed', String(name === activeCategory));
        renderResults();
      };
      filterButtons.set(category, filter); filters.append(filter);
    }
    search.addEventListener('input', renderResults);
    renderResults();
  }

  EV.MedicalCommandCatalog = Object.freeze({ render });
})();
