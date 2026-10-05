(() => {
  const EV = globalThis.EdenVoice;
  const visible = (element) => element.isConnected && element.getClientRects().length > 0
    && getComputedStyle(element).visibility !== 'hidden';

  EV.findEdenEditor = () => {
    const scope = EV.CONFIG.EDITOR_CONTAINER_SELECTOR
      ? document.querySelector(EV.CONFIG.EDITOR_CONTAINER_SELECTOR) : document;
    if (!scope) throw new Error('O painel configurado do Eden AI não foi encontrado.');
    let candidates = [...scope.querySelectorAll('.tiptap.ProseMirror[contenteditable="true"]')].filter(visible);
    if (!candidates.length) {
      candidates = [...scope.querySelectorAll('[contenteditable="true"]')]
        .filter((el) => /ProseMirror|tiptap/.test(el.className) && visible(el));
    }
    if (!candidates.length) throw new Error('Campo TipTap do Eden AI não encontrado. Abra o painel eden ai.');
    if (candidates.length > 1) throw new Error('Mais de um editor encontrado. Configure EDITOR_CONTAINER_SELECTOR para o painel Eden AI.');
    return candidates[0];
  };
  EV.captureContext = () => ({
    editor: EV.findEdenEditor(),
    url: location.href,
    exam: EV.CONFIG.EXAM_CONTEXT_SELECTOR
      ? document.querySelector(EV.CONFIG.EXAM_CONTEXT_SELECTOR)?.textContent : null,
  });
  EV.contextIsCurrent = (context) => {
    try {
      const current = EV.captureContext();
      return context && context.editor === current.editor && context.url === current.url && context.exam === current.exam;
    } catch { return false; }
  };
  const plainText = (editor) => editor.innerText.replace(/\r\n/g, '\n');
  const waitForEditor = () => new Promise((resolve) => setTimeout(resolve, 80));

  EV.insertTextIntoEden = async function insertTextIntoEden(text, context = EV.captureContext(), isCurrent = () => true) {
    const valid = () => isCurrent() && EV.contextIsCurrent(context);
    if (typeof text !== 'string' || !text.trim()) throw new Error('A transcrição não contém texto.');
    if (!valid()) throw new Error('A página ou o editor mudou. Nenhum texto foi inserido.');
    const editor = context.editor;
    EV.Logger?.info('Editor TipTap encontrado');
    const before = plainText(editor);
    const addition = text;
    const comparable = (value) => value.replace(/\s+/g, ' ').trim();
    if (comparable(before) === comparable(text)) return { method: 'unchanged' };
    editor.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    let method = 'execCommand(insertText)';
    try {
      // O Chrome converte \n em parágrafos com insertText. Quebras nativas
      // mantêm duas quebras também no documento interno do ProseMirror.
      const lines = addition.split('\n');
      for (let index = 0; index < lines.length; index++) {
        if (index && !document.execCommand('insertLineBreak', false)) break;
        if (lines[index] && !document.execCommand('insertText', false, lines[index])) break;
      }
    } catch { /* Tenta paste somente se nada mudou. */ }
    await waitForEditor();
    if (!valid()) throw new Error('A inserção foi cancelada ou a página mudou. Confira o editor antes de continuar.');
    if (plainText(editor) === before) {
      method = 'ClipboardEvent(paste)';
      // Reafirma a seleção inteira caso o primeiro método tenha movido o cursor.
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', addition);
      editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
      await waitForEditor();
    }
    if (!valid()) throw new Error('A inserção foi cancelada ou a página mudou. Confira o editor antes de continuar.');
    // Eventos sintéticos sozinhos não editam o documento. Não usamos innerHTML como fallback.
    if (plainText(editor) === before) throw new Error('O TipTap recusou a inserção. O texto está disponível abaixo para cópia manual.');
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: addition }));
    await waitForEditor();
    if (!EV.contextIsCurrent(context)) throw new Error('A página mudou durante a inserção. Confira o exame antes de continuar.');
    const after = plainText(editor);
    // innerText pode representar parágrafos do ProseMirror com quebras diferentes.
    if (comparable(after) !== comparable(text)) {
      throw new Error('Não foi possível confirmar a inserção completa. Confira o editor; não tente inserir novamente sem revisar.');
    }
    EV.Logger?.info(`Texto inserido; método: ${method}`);
    return { method };
  };
})();
