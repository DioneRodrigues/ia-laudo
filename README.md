# Eden Voice Transcriber

MVP de extensão Chrome Manifest V3 para `https://pacs.evacenter.com/*`. Grava um ditado, permite ouvi-lo, envia o áudio ao backend Fastify e acrescenta a transcrição ao editor Eden AI. Inclui expansão determinística no backend de comandos médicos. Sem banco, histórico, cadastro dinâmico de regras, login ou streaming.

## Arquitetura

```text
Microfone → MediaRecorder no content script → Blob em memória
       → POST /transcribe (multipart, campo audio)
       → arquivo temporário → serviço OpenAI → remoção em finally
       → commandProcessor no backend
       → { success: true, text, medicalCommandCount } → editor TipTap/ProseMirror
```

A extensão usa JavaScript puro e não precisa de build. Os scripts compartilham um namespace no mundo isolado do content script. O `MutationObserver` espera pelo editor, mantém um único painel e detecta remoção/substituição do editor. Uma sondagem de 500 ms também detecta mudanças de URL sem mutação DOM.

O `fetch` parte do content script; sua origem é a página PACS. O backend permite explicitamente essa origem. A extensão não precisa de service worker, `tabs`, `storage`, `scripting`, acesso a todos os sites ou chave de API. A única regra de injeção é o domínio do PACS no manifest. A permissão de microfone é solicitada pela página após o clique.

`services/transcriptionService.js` usa o SDK oficial (`client.audio.transcriptions.create`) e o modelo configurável `gpt-transcribe`, conforme a [documentação oficial de transcrição de arquivos](https://developers.openai.com/api/docs/guides/speech-to-text), consultada em 29/09/2026. Para trocar o provedor, mantenha `transcribeAudio(filePath, { signal })` retornando uma string. No backend, os comandos médicos conhecidos são expandidos após a transcrição e antes da inserção.

## Estrutura

```text
extenssao-eden-ia/
├── .gitignore
├── README.md
├── extension/
│   ├── manifest.json
│   ├── content/
│   │   ├── config.js
│   │   ├── content.js
│   │   ├── recorder.js
│   │   ├── edenEditor.js
│   │   ├── edenControls.js
│   │   └── ui.js
│   ├── styles/content.css
│   └── icons/.gitkeep
└── backend/
    ├── .env.example
    ├── .gitignore
    ├── package.json
    ├── package-lock.json
    ├── src/
    │   ├── app.js
    │   ├── server.js
    │   ├── routes/transcribe.js
    │   ├── services/commandProcessor.js
    │   └── services/transcriptionService.js
    ├── uploads/.gitkeep
    └── test/
        ├── backend.test.js
        ├── commandProcessor.test.js
        ├── browser.test.js
        └── fixtures/editor.js
```

A pasta existente é a raiz do monorepo. `app.js` separa a construção do servidor de sua inicialização para permitir testes sem credenciais. Os testes e sua fixture não são incluídos na extensão.

## Requisitos e instalação

- Node.js 22 ou superior e npm.
- Chrome atualizado e microfone disponível.
- Acesso ao PACS e ao painel Eden AI.
- Chave da API OpenAI com acesso ao modelo de transcrição e saldo/cota disponíveis.

Na raiz do projeto:

```bash
cd backend
npm ci
cp .env.example .env
```

Edite `backend/.env` e preencha `OPENAI_API_KEY`. Nunca coloque a chave na extensão. Exemplo de configuração, mantendo a chave apenas no arquivo local:

```dotenv
PORT=3001
HOST=127.0.0.1
OPENAI_API_KEY=sua-chave-real
OPENAI_TRANSCRIPTION_MODEL=gpt-transcribe
OPENAI_TIMEOUT_MS=120000
CORS_ORIGIN=https://pacs.evacenter.com
```

`HOST=127.0.0.1` restringe o servidor à máquina do médico. O MVP não oferece autenticação e não deve ser exposto publicamente como está. `CORS_ORIGIN` aceita origens explícitas separadas por vírgula, sem barra final e sem caminhos. `*` e `null` são rejeitados. CORS não substitui autenticação: clientes locais como curl não dependem de CORS.

## Iniciar o backend

Dentro de `backend/`:

```bash
npm start
```

Para desenvolvimento com reinício ao editar arquivos:

```bash
npm run dev
```

Verifique a disponibilidade:

```bash
curl http://localhost:3001/health
```

Resposta: `{"success":true}`. Esse endpoint confirma apenas que o servidor está respondendo, não valida credenciais nem acesso à OpenAI. O servidor recusa iniciar se a chave estiver vazia.

## Docker e EasyPanel

O `backend/Dockerfile` usa Node.js 22, instala somente dependências de produção, executa como usuário `node` e inclui healthcheck em `/health`. O `.dockerignore` exclui `.env`, áudio, testes e dependências locais do contexto enviado ao Docker. As variáveis são fornecidas em runtime; não é necessário criar `.env` dentro da imagem.

No EasyPanel, crie um serviço **App** com origem no repositório ou upload:

1. Configure **Build Path** como `/backend`.
2. Selecione o builder **Dockerfile**, com caminho `Dockerfile` (relativo ao Build Path).
3. Configure as variáveis de ambiente do serviço:

   ```dotenv
   OPENAI_API_KEY=sua-chave-real
   OPENAI_TRANSCRIPTION_MODEL=gpt-transcribe
   OPENAI_TIMEOUT_MS=120000
   CORS_ORIGIN=https://pacs.evacenter.com
   HOST=0.0.0.0
   PORT=3001
   ```

4. Configure o domínio HTTPS com porta interna **3001** e faça o deploy. Mantenha o comando padrão da imagem; não substitua por `npm start`, que carrega um `.env` local.
5. Verifique `https://seu-dominio/health` e altere `API_BASE_URL` em `extension/content/config.js` para esse domínio HTTPS. Recarregue a extensão e a aba do PACS.

Não é necessário volume persistente: `/app/uploads` recebe apenas arquivos temporários. O Build Path define também o contexto Docker, conforme a [documentação do EasyPanel](https://easypanel.io/docs/builders).

Para construir e executar localmente, a partir da raiz do repositório:

```bash
docker build -t eden-voice-backend ./backend
docker run --rm --init -p 127.0.0.1:3001:3001 --env-file backend/.env -e HOST=0.0.0.0 -e PORT=3001 eden-voice-backend
```

## Carregar a extensão

1. Abra `chrome://extensions`.
2. Ative **Developer Mode / Modo do desenvolvedor**.
3. Clique em **Load unpacked / Carregar sem compactação**.
4. Selecione a pasta **extension/**, não a raiz do projeto.
5. Abra ou recarregue `https://pacs.evacenter.com/` e entre no painel **eden ai**.
6. O painel flutuante aparece quando um editor compatível está visível. Arraste pelo cabeçalho para movê-lo pela página; ele permanece dentro da janela. O botão `−` minimiza o painel; `+` expande. A posição permanece enquanto a página estiver aberta e volta ao canto inferior direito ao recarregar.

Após editar os arquivos da extensão, clique em recarregar na página de extensões e recarregue também a aba do PACS.

## Testar o fluxo manualmente

### Integração com os botões do Eden (v0.2)

Clique no botão nativo de ditado (`data-testid="toggle-eden-ai-dictation-button"`) para iniciar a extensão. Clique novamente para **finalizar e transcrever automaticamente**. Depois da inserção validada, a extensão aguarda o botão `data-testid="execute-eden-ai-command-button"` habilitar e clica uma única vez em **Criar relatório**. O processamento/substituição do relatório é realizado pelo próprio Eden; a mensagem “Comando enviado ao Eden” confirma o clique, não a conclusão do relatório.

O clique do ditado é interceptado em captura, inclusive quando o alvo é um SVG interno. Se o controle informa **Escuta em pausa.**, a ação nativa é bloqueada e somente a extensão grava. Se indica `aria-pressed="true"`, “Escutando”, “Ouvindo”, “Escuta ativa” ou “Pausar escuta”, é enviado um clique nativo para pausar e a confirmação é aguardada antes de solicitar o microfone. Quando presente, `aria-pressed` prevalece sobre o texto durante transições. Estado desconhecido ou ausência de confirmação impede a gravação. O código não tem acesso direto às tracks privadas do Eden; depende de seu controle confirmar a pausa. O SVG animado, sozinho, não permite distinguir captura ativa de pausada.

Durante a solicitação do microfone e a gravação, um `MutationObserver` vigia reativações da escuta e remontagens do botão, com verificação adicional a cada 250 ms. Ao detectar reativação, solicita a pausa imediatamente, sem repetir cliques enquanto aguarda a confirmação. Se a pausa falhar, finaliza a gravação e mantém o áudio já capturado disponível para reprodução/transcrição. Além dessa proteção durante a gravação, a extensão mantém a escuta nativa pausada desde o carregamento, mesmo antes de “Novo ditado”, após finalizar/descartar e quando o painel Eden acaba de abrir. Essa vigilância permanente não solicita o microfone da extensão: apenas pausa o controle nativo quando seu estado indica captura ativa. O botão de ditado do Eden continua sendo um atalho para gravar pela extensão. Tentativas simultâneas compartilham um único clique de pausa; uma falha não provoca cliques contínuos. A vigilância é suspensa ao sair da página e retomada ao restaurá-la pelo navegador.

Os listeners são delegados e continuam funcionando quando o React recria os botões. Enquanto a extensão grava/processa, cliques manuais em Criar relatório são bloqueados para evitar envio prematuro ou duplicado. Troca de exame cancela também a espera pelo botão. Falha de inserção impede o clique; botão ausente/desabilitado após o timeout mantém o texto disponível e orienta o envio manual, sem retranscrever.

O painel flutuante continua disponível: **Finalizar** nele mantém a etapa de reprodução e o botão **Transcrever**. O envio ao Eden após a transcrição é automático nos dois fluxos. Para voltar a apenas inserir texto, altere `AUTO_SUBMIT` para `false` em `extension/content/config.js`. Os seletores e `EDEN_CONTROL_TIMEOUT_MS` (4 segundos) estão no mesmo arquivo. Se usar `EDITOR_CONTAINER_SELECTOR`, escolha um contêiner que inclua o editor e os dois controles.

### Fluxo pelo painel flutuante

Use um ditado de teste sem dados reais para a primeira validação:

1. Com o backend rodando e o Eden AI aberto, clique em **Iniciar gravação**.
2. Autorize o microfone e diga uma frase curta. Confira o cronômetro e o indicador do Chrome.
3. Clique em **Finalizar**. O indicador de captura deve desligar; todas as tracks são encerradas.
4. Reproduza a gravação no controle de áudio. **Descartar** libera o Blob e permite começar novamente.
5. Clique em **Transcrever** e aguarde. Não troque de exame durante o fluxo.
6. O texto anterior é preservado e a transcrição acrescentada após duas quebras de linha; em seguida, Criar relatório é acionado automaticamente.
7. Confira o resultado gerado pelo Eden. Para testar a persistência do editor antes do envio, desative temporariamente `AUTO_SUBMIT`, recarregue a extensão/aba e valide a digitação posterior.
8. Clique em **Novo ditado** para recomeçar.

O limite é **20 MiB por áudio**, inferior ao limite de 25 MB documentado pela OpenAI. O gravador interrompe gravações que excedem esse limite. O timeout do provedor é de 120 segundos, sem retry automático; o da extensão é de 150 segundos. Após falha de rede, o áudio permanece apenas na memória da aba para reprodução ou nova tentativa. Uma tentativa após timeout pode ser uma nova chamada cobrada pelo provedor.

Também é possível testar o endpoint com um arquivo de áudio real:

```bash
curl -X POST http://localhost:3001/transcribe \
  -H 'Origin: https://pacs.evacenter.com' \
  -F 'audio=@/caminho/ditado.webm;type=audio/webm'
```

Respostas:

```json
{ "success": true, "text": "Texto transcrito.", "medicalCommandCount": 0 }
```

```json
{ "success": false, "error": "Descrição do erro" }
```

Formatos aceitos: WebM, Ogg, MP4, MP3 e WAV, com MIME compatível. O nome original do upload nunca é usado para criar caminhos. O backend limita tamanho e formato declarado; o provedor valida se o conteúdo contém áudio decodificável.

## Comandos médicos (V1)

Comandos médicos são aliases conhecidos substituídos por frases fixas no backend. O fluxo é **gravação → transcrição → processamento de comandos no backend → inserção no Eden**. A rota `backend/src/routes/transcribe.js` chama `processMedicalCommands` após validar o texto do provedor. `/transcribe` retorna `text` já processado e `medicalCommandCount`. A extensão insere esse texto sem reprocessá-lo e usa a contagem para mostrar “1 comando médico aplicado” ou a quantidade no plural. Respostas de um backend antigo, sem contagem, continuam aceitas pela extensão (contagem zero).

As regras ficam na lista `MEDICAL_COMMANDS` de `backend/src/services/commandProcessor.js`. A V1 inclui Chammas 1 a 5, com as frases cadastradas, números por extenso e romanos. A busca ignora maiúsculas/minúsculas; “três” e “tres” são aliases explícitos. O restante do texto, incluindo acentos, espaços e quebras de linha, é preservado. Limites Unicode evitam matches dentro de palavras e números maiores. As substituições acontecem em uma única passagem, sem reprocessar as frases inseridas. Um ponto imediatamente após o alias é aproveitado quando a frase já termina com ponto, evitando `..`; outras pontuações são preservadas.

Exemplos:

| Entrada | Saída |
| --- | --- |
| `Chammas 1` | `sem vascularização (Chammas I).` |
| `Nódulo sólido. Chammas três.` | `Nódulo sólido. nódulo com vascularização periférica e central. Periférica maior ou igual a central (Chammas III).` |
| `Nódulo A Chammas 2. Nódulo B Chammas 4.` | `Nódulo A nódulo apenas com vascularização periférica (Chammas II). Nódulo B nódulo com vascularização central e periférica. Predomínio da central (Chammas IV).` |
| `Fígado normal.` | `Fígado normal.` |

Para adicionar um comando, acrescente um objeto à lista (exemplo de estrutura; substitua a frase ilustrativa antes de usar):

```js
{
  id: 'tirads-3',
  aliases: ['tirads 3', 'ti rads 3'],
  replacement: 'Frase cadastrada para este comando.',
},
```

Para aceitar outra grafia, acrescente uma string ao array `aliases` da regra correspondente. Use aliases únicos entre regras. O motor é genérico: não exige lógica específica para novas categorias. Após editar as regras, reinicie o backend ou faça um novo deploy no EasyPanel. Todas as extensões que usam esse backend recebem as novas expansões na próxima transcrição, sem atualização local.

Sem match, a transcrição segue exatamente como recebida. Se o processador falhar, o backend registra uma mensagem e retorna o texto original com contagem zero e resposta de sucesso. Os logs `[Eden Voice]` do backend mostram somente eventos, ID, alias e quantidade de substituições, sem o texto clínico completo. Não há IA para interpretar comandos, regras por seção, banco, API de regras ou configuração remota.

### Migração para regras no backend (extensão 0.3.0)

Atualize uma vez a extensão em todos os computadores e recarregue as abas do PACS; em seguida publique o backend novo. Essa ordem evita que uma extensão antiga expanda novamente os nomes Chammas presentes nas frases já processadas pelo servidor. Enquanto o backend antigo estiver ativo, a extensão nova insere o texto recebido sem expansão. Depois dessa migração, alterações em comandos e aliases exigem apenas atualizar/reiniciar o backend. Não há banco, painel administrativo ou download de regras para a extensão.

## Testes automatizados

Dentro de `backend/`:

```bash
npm test
npm run test:browser
```

O primeiro comando inclui os testes unitários do processador: aliases, caixa, acentos, múltiplas ocorrências, limites de palavras, pontuação, preservação do texto e logs. Para executar somente esses testes, use `node --test backend/test/commandProcessor.test.js` na raiz. O teste de navegador também verifica a expansão antes de inserir/enviar ao Eden, a contagem no painel e o fallback quando o processador lança um erro.

O segundo comando usa o Google Chrome instalado (`channel: 'chrome'`), um microfone simulado e uma instância real de TipTap 3/ProseMirror. Não chama a OpenAI nem precisa de `.env`. Verifica o estado interno do editor, os métodos de inserção, preservação do texto, tracks encerradas, reprodução, multipart, CORS e bloqueio por mudança de rota. O teste do backend verifica também erros do provedor, entradas inválidas, limite de tamanho e limpeza em sucesso/erro.

Isso não substitui testar o Eden real: a versão e os plugins do editor do PACS podem diferir da fixture. Os testes de navegador carregam os mesmos scripts em uma página local; não automatizam a instalação da extensão nem as permissões do PACS.

## Configurações que você pode alterar

| Arquivo | Configuração |
| --- | --- |
| `backend/.env` | Chave, modelo, porta, timeout, host e origens CORS. Crie a partir de `.env.example`. |
| `extension/content/config.js` | `API_BASE_URL`, timeouts, limite de áudio, escopo do editor, identificador do exame, seletores dos controles e `AUTO_SUBMIT`. |
| `extension/manifest.json` | Domínio onde a extensão é injetada, caso o endereço do PACS mude. |
| `extension/styles/content.css` | `right` e `bottom` para afastar o painel de botões específicos do Eden. |

Se mudar a porta do backend, altere também `API_BASE_URL`. Se mudar o limite de áudio, ajuste também o limite multipart em `backend/src/app.js` e as mensagens de tamanho. A chave nunca sai do backend.

## Editor e validação no DOM real

No DevTools da aba do PACS, execute:

```js
document.querySelectorAll('.tiptap.ProseMirror[contenteditable="true"]')
```

Deve haver um único editor visível pertencente ao Eden AI. Não há dependência da sequência completa de classes. O fallback procura `contenteditable="true"` com classes contendo `ProseMirror` ou `tiptap`; campos genéricos não são selecionados.

Se houver vários editores visíveis, configure `EDITOR_CONTAINER_SELECTOR` com um seletor estável do contêiner do **Eden AI**, por exemplo um atributo `data-*` que realmente exista. O código recusa escolher arbitrariamente. Um editor único também precisa ser confirmado como pertencente ao Eden AI na integração real.

`insertTextIntoEden(text)` está isolada em `edenEditor.js`. Ela foca o editor, colapsa a seleção no final, usa `execCommand('insertText')` e, se nada mudar, tenta `ClipboardEvent('paste')`. Depois dispara `InputEvent` e verifica preservação do conteúdo e presença da transcrição. Não atribui `innerHTML` ao editor e não força acesso a objetos privados do React.

Eventos sintéticos, sozinhos, não garantem alteração do estado interno. A confirmação automática na extensão observa o DOM; os testes conferem o estado ProseMirror da fixture. **A persistência no estado do Eden real precisa ser validada**, incluindo digitação posterior e ação normal do painel. Se o Eden bloquear os dois métodos, o painel apresenta o texto para cópia manual; não insere repetidamente após falha parcial.

O ditado fica vinculado à URL e ao elemento editor desde o início da gravação. Remoção do editor, troca de URL ou mudança do identificador configurado interrompe o fluxo. Isso também vale enquanto o navegador aguarda permissão do microfone.

**Ponto obrigatório de integração:** verifique como o PACS troca de exame. Se reutilizar o mesmo editor na mesma URL, configure `EXAM_CONTEXT_SELECTOR` apontando para um elemento cujo `textContent` identifique unicamente o exame. Sem isso não é possível distinguir essa troca apenas pelo HTML fornecido. Em frames ou shadow roots, o seletor do documento principal não alcança o editor: é necessário adaptar a integração após inspecionar o DOM real. O MVP não injeta em todos os frames.

## Logs e diagnóstico

- Extensão: abra o DevTools da aba do PACS e filtre o Console por `[Eden Voice]`.
- Backend: terminal onde executou `npm start`. Os logs incluem horário, duração, tamanho, status e sucesso/erro, sem chave, áudio ou transcrição.
- Requisição: painel Network do DevTools, filtro `transcribe`. Evite compartilhar capturas do payload/resposta, que contêm o ditado.
- O log `Editor TipTap encontrado` aparece ao iniciar um ditado e ao inserir. O log de inserção informa `execCommand(insertText)` ou `ClipboardEvent(paste)`.
- Para inspecionar `EdenVoice.findEdenEditor()` diretamente, selecione o contexto da extensão no seletor de contexto do Console; esse namespace não é exposto ao JavaScript da página.

## Problemas comuns

**Painel não apareceu:** confirme que a extensão está habilitada, recarregue a aba, abra o Eden AI e confira o seletor acima. Mais de um editor visível, editor em iframe ou seletor de contêiner incorreto impedem a escolha segura. Uma vez criado, o painel permanece disponível para exibir erros após mudanças da SPA.

**Microfone negado:** use as permissões do site ao lado da URL para permitir o microfone e recarregue. No macOS/Windows, confira também a permissão do sistema para o Google Chrome. Conecte um dispositivo de entrada e verifique se outro aplicativo está bloqueando seu uso. A solicitação só acontece após clicar em iniciar; não há permissão de captura permanente no manifest.

**Backend indisponível:** acesse `/health`, confirme a porta e o terminal. Se `localhost` resolver incorretamente na sua máquina, ajuste `API_BASE_URL` para `http://127.0.0.1:3001`.

**CORS:** o valor padrão correto é `https://pacs.evacenter.com`, sem `/*` nem barra final. Neste fluxo, a origem não é `chrome-extension://...`. Reinicie o backend após alterar `.env`. A requisição usa `FormData` sem definir `Content-Type` manualmente, para preservar o boundary multipart. Consulte a [documentação de requisições de extensões do Chrome](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).

**Acesso à rede local / mixed content / política do PACS:** dependendo da versão e das políticas do Chrome, pode ser necessário permitir acesso à rede local nas permissões do site para acessar localhost a partir do PACS em HTTPS. A resposta de preflight inclui suporte à rede privada apenas para origens autorizadas. Se a política corporativa ou a página impedir o acesso, CORS sozinho não resolve: use um backend HTTPS permitido e altere `API_BASE_URL`. Não desative globalmente a segurança do navegador.

**Erro do provedor:** confira chave, saldo, acesso ao modelo e conectividade do backend com a OpenAI. Mensagens brutas do SDK são omitidas para evitar vazamentos. O modelo é configurável no `.env`.

**Página mudou:** por segurança, não há tentativa de inserir automaticamente em um novo editor. Faça um novo ditado no exame correto. Se o texto já tiver sido recebido antes de uma falha de inserção, ele aparece para cópia manual.

## Ciclo de vida dos dados

O backend cria um diretório temporário por requisição dentro de `uploads/`, salva um único arquivo e remove o diretório em `finally` antes de responder, inclusive em erro do provedor ou multipart. Falha de exclusão gera erro explícito; verifique `uploads/` nesse caso. Encerrar o processo à força ou desligar a máquina não executa `finally`: após um crash, remova eventuais resíduos antes de retomar o uso.

Na extensão, áudio e transcrição ficam somente na memória. Ao descartar, concluir a transcrição ou sair da página, os recursos de áudio são liberados; o texto de recuperação é eliminado ao iniciar um novo ditado. Não há armazenamento local nem histórico. O envio à OpenAI é necessário para a transcrição; a exclusão local não controla a retenção do provedor.
