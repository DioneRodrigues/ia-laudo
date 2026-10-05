# Eden Voice Transcriber

MVP de extensão Chrome Manifest V3 para `https://pacs.evacenter.com/*`. Grava um ditado, permite ouvi-lo, envia o áudio ao backend Fastify e substitui o conteúdo do editor Eden AI pela transcrição. Inclui expansão determinística no backend de comandos médicos, histórico local da extensão e painel administrativo protegido. Sem banco de dados, cadastro dinâmico de regras ou streaming.

## Arquitetura

```text
Microfone → MediaRecorder no content script → Blob em memória
       → POST /transcribe (multipart, campo audio)
       → arquivo temporário → OpenAI com contexto médico e português → remoção em finally
       → commandProcessor no backend
       → { success: true, text, medicalCommandCount, medicalCommands, logId } → editor TipTap/ProseMirror
       → GET /medical-commands → aba Máscaras (consulta somente leitura)
       ├→ chrome.storage.local (até 100 registros locais)
       └→ painel /admin (até 100 registros na memória do backend)
```

A extensão usa JavaScript puro e não precisa de build. Os scripts compartilham um namespace no mundo isolado do content script. O `MutationObserver` espera pelo editor, mantém um único painel e detecta remoção/substituição do editor. Uma sondagem de 500 ms também detecta mudanças de URL sem mutação DOM.

O `fetch` parte do content script; sua origem é a página PACS. O backend permite explicitamente essa origem. A extensão usa a permissão `storage` somente para salvar localmente o histórico; não precisa de service worker, `tabs`, `scripting`, acesso a todos os sites ou chave de API. A única regra de injeção é o domínio do PACS no manifest. A permissão de microfone é solicitada pela página após o clique.

`services/transcriptionService.js` usa o SDK oficial (`client.audio.transcriptions.create`) e o modelo configurável `gpt-transcribe`, recomendado pela [documentação oficial de transcrição de arquivos](https://developers.openai.com/api/docs/guides/speech-to-text), consultada em 02/10/2026. Para trocar o provedor, mantenha `transcribeAudio(filePath, { signal })` retornando uma string. No backend, os comandos médicos conhecidos são expandidos após a transcrição e antes da inserção.

## Estrutura

```text
extenssao-eden-ia/
├── .gitignore
├── README.md
├── extension/
│   ├── manifest.json
│   ├── content/
│   │   ├── config.js
│   │   ├── logConfig.js
│   │   ├── patientContext.js
│   │   ├── monitoring.js
│   │   ├── medicalCommandCatalog.js
│   │   ├── content.js
│   │   ├── recorder.js
│   │   ├── edenEditor.js
│   │   ├── edenControls.js
│   │   └── ui.js
│   ├── assets/clinicadamama-logo.png
│   ├── styles/content.css
│   ├── storage/logStore.js
│   ├── utils/logger.js
│   └── icons/.gitkeep
└── backend/
    ├── .env.example
    ├── .gitignore
    ├── package.json
    ├── package-lock.json
    ├── src/
    │   ├── app.js
    │   ├── server.js
    │   ├── config/transcriptionVocabulary.js
    │   ├── config/transcriptionContext.js
    │   ├── routes/medicalCommands.js
    │   ├── routes/transcribe.js
    │   ├── services/commandProcessor.js
    │   └── services/transcriptionService.js
    ├── uploads/.gitkeep
    └── test/
        ├── backend.test.js
        ├── commandProcessor.test.js
        ├── transcriptionService.test.js
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
TRANSCRIPTION_MEDICAL_CONTEXT_ENABLED=true
OPENAI_TIMEOUT_MS=120000
CORS_ORIGIN=https://pacs.evacenter.com
ADMIN_PASSWORD=senha-forte-com-pelo-menos-12-caracteres
ADMIN_SESSION_SECRET=segredo-aleatorio-com-pelo-menos-32-bytes
ADMIN_COOKIE_SECURE=true
```

`HOST=127.0.0.1` restringe o servidor à máquina do médico. Para abrir `/admin`, configure `ADMIN_PASSWORD` com pelo menos 12 caracteres e `ADMIN_SESSION_SECRET` com pelo menos 32 bytes aleatórios. O painel usa sessão em cookie HttpOnly e limita tentativas de login. Mantenha `ADMIN_COOKIE_SECURE=true` em produção HTTPS; em desenvolvimento HTTP local, use `false`. `CORS_ORIGIN` aceita origens explícitas separadas por vírgula, sem barra final e sem caminhos. `*` e `null` são rejeitados; requisições same-origin do painel também são aceitas.

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
   TRANSCRIPTION_MEDICAL_CONTEXT_ENABLED=true
   OPENAI_TIMEOUT_MS=120000
   CORS_ORIGIN=https://pacs.evacenter.com
   HOST=0.0.0.0
   PORT=3001
   ```

4. Configure o domínio HTTPS com porta interna **3001** e faça o deploy. Mantenha o comando padrão da imagem; não substitua por `npm start`, que carrega um `.env` local.
5. Verifique `/health` e ajuste `API_BASE_URL` em `extension/content/config.js` para o endereço do backend. As chamadas da extensão agora passam pelo service worker; o host também precisa constar em `host_permissions` de `extension/manifest.json`. O manifest inclui os esquemas HTTP e HTTPS para o IP `10.33.0.7`. Recarregue a extensão e a aba do PACS após alterações.

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
6. O painel da Clínica da Mama ocupa a área do editor Eden, acompanhando redimensionamento e rolagem. O botão **X** libera o campo para digitar manualmente; **Abrir ditado da Mama** restaura o painel. A extensão não insere sua interface dentro do documento TipTap.

Após editar os arquivos da extensão, clique em recarregar na página de extensões e recarregue também a aba do PACS.

## Testar o fluxo manualmente

### Integração com os botões do Eden (v0.2)

Clique no botão nativo de ditado (`data-testid="toggle-eden-ai-dictation-button"`) para iniciar a extensão. Clique novamente para **finalizar e transcrever automaticamente**. Depois da inserção validada, a extensão aguarda o botão `data-testid="execute-eden-ai-command-button"` habilitar e clica uma única vez em **Criar relatório**. O processamento/substituição do relatório é realizado pelo próprio Eden; a mensagem “Comando enviado ao Eden” confirma o clique, não a conclusão do relatório.

O clique do ditado é interceptado em captura, inclusive quando o alvo é um SVG interno. Se o controle informa **Escuta em pausa.**, a ação nativa é bloqueada e somente a extensão grava. Se indica `aria-pressed="true"`, “Escutando”, “Ouvindo”, “Escuta ativa” ou “Pausar escuta”, é enviado um clique nativo para pausar e a confirmação é aguardada antes de solicitar o microfone. Quando presente, `aria-pressed` prevalece sobre o texto durante transições. Estado desconhecido ou ausência de confirmação impede a gravação. O código não tem acesso direto às tracks privadas do Eden; depende de seu controle confirmar a pausa. O SVG animado, sozinho, não permite distinguir captura ativa de pausada.

Durante a solicitação do microfone e a gravação, um `MutationObserver` vigia reativações da escuta e remontagens do botão, com verificação adicional a cada 250 ms. Ao detectar reativação, solicita a pausa imediatamente, sem repetir cliques enquanto aguarda a confirmação. Se a pausa falhar, finaliza a gravação e mantém o áudio já capturado disponível para reprodução/transcrição. Além dessa proteção durante a gravação, a extensão mantém a escuta nativa pausada desde o carregamento, mesmo antes de “Novo ditado”, após finalizar/descartar e quando o painel Eden acaba de abrir. Essa vigilância permanente não solicita o microfone da extensão: apenas pausa o controle nativo quando seu estado indica captura ativa. O botão de ditado do Eden continua sendo um atalho para gravar pela extensão. Tentativas simultâneas compartilham um único clique de pausa; uma falha não provoca cliques contínuos. A vigilância é suspensa ao sair da página e retomada ao restaurá-la pelo navegador.

Os listeners são delegados e continuam funcionando quando o React recria os botões. Enquanto a extensão grava/processa, cliques manuais em Criar relatório são bloqueados para evitar envio prematuro ou duplicado. Troca de exame cancela também a espera pelo botão. Falha de inserção impede o clique; botão ausente/desabilitado após o timeout mantém o texto disponível e orienta o envio manual, sem retranscrever.

O painel da Clínica da Mama continua disponível: **Finalizar** nele mantém a etapa de reprodução e o botão **Transcrever**. O envio ao Eden após a transcrição é automático nos dois fluxos. Para voltar a apenas inserir texto, altere `AUTO_SUBMIT` para `false` em `extension/content/config.js`. Os seletores e `EDEN_CONTROL_TIMEOUT_MS` (4 segundos) estão no mesmo arquivo. Se usar `EDITOR_CONTAINER_SELECTOR`, escolha um contêiner que inclua o editor e os dois controles.

### Fluxo pelo painel da Clínica da Mama

Use um ditado de teste sem dados reais para a primeira validação:

1. Com o backend rodando e o Eden AI aberto, clique em **Iniciar gravação**.
2. Autorize o microfone e diga uma frase curta. Confira o cronômetro e o indicador do Chrome.
3. Clique em **Finalizar**. O indicador de captura deve desligar; todas as tracks são encerradas.
4. Reproduza a gravação no controle de áudio. **Descartar** libera o Blob e permite começar novamente.
5. Clique em **Transcrever** e aguarde. Não troque de exame durante o fluxo.
6. O texto anterior do campo Eden é substituído pela nova transcrição; em seguida, Criar relatório é acionado automaticamente. O conteúdo é selecionado e substituído apenas após uma resposta válida do backend, nunca ao iniciar a gravação.
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
{ "success": true, "text": "Texto transcrito.", "medicalCommandCount": 0, "medicalCommands": [] }
```

```json
{ "success": false, "error": "Descrição do erro" }
```

Formatos aceitos: WebM, Ogg, MP4, MP3 e WAV, com MIME compatível. O nome original do upload nunca é usado para criar caminhos. O backend limita tamanho e formato declarado; o provedor valida se o conteúdo contém áudio decodificável.

## Comandos médicos (V1)

Comandos médicos são aliases conhecidos substituídos por frases fixas no backend. O fluxo é **gravação → transcrição → processamento de comandos no backend → inserção no Eden**. A rota `backend/src/routes/transcribe.js` chama `processMedicalCommands` após validar o texto do provedor. `/transcribe` retorna `text` já processado, `medicalCommandCount` e `medicalCommands` (lista de ocorrências com `id`, `label`, `alias` e `replacement`). A extensão insere esse texto sem reprocessá-lo e usa a contagem para mostrar “1 comando médico aplicado” ou a quantidade no plural. Cada comando aparece com seu nome, o alias reconhecido e a frase expandida, inclusive após o envio ao Eden. A lista é renderizada como texto, sem interpretar HTML vindo do backend. Respostas de um backend antigo, sem contagem, continuam aceitas pela extensão (contagem zero).

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
  label: 'TI-RADS 3',
  aliases: ['tirads 3', 'ti rads 3'],
  replacement: 'Frase cadastrada para este comando.',
},
```

O campo opcional `label` define o nome apresentado ao médico (na ausência dele, usa-se `id`). Para aceitar outra grafia, acrescente uma string ao array `aliases` da regra correspondente. Use aliases únicos entre regras. O motor é genérico: não exige lógica específica para novas categorias. Após editar as regras, reinicie o backend ou faça um novo deploy no EasyPanel. Todas as extensões que usam esse backend recebem as novas expansões na próxima transcrição, sem atualização local.

Sem match, a transcrição segue exatamente como recebida. Se o processador falhar, o backend registra uma mensagem e retorna o texto original com contagem zero e resposta de sucesso. Os logs `[Eden Voice]` do backend mostram somente eventos, ID, alias e quantidade de substituições, sem o texto clínico completo. Não há IA para interpretar comandos, regras por seção, banco, API de regras ou configuração remota.

### Migração para regras no backend (extensão 0.3.0)

Atualize uma vez a extensão em todos os computadores e recarregue as abas do PACS; em seguida publique o backend novo. Essa ordem evita que uma extensão antiga expanda novamente os nomes Chammas presentes nas frases já processadas pelo servidor. Enquanto o backend antigo estiver ativo, a extensão nova insere o texto recebido sem expansão. Depois dessa migração, alterações em comandos e aliases exigem apenas atualizar/reiniciar o backend. As regras continuam somente no backend; o histórico administrativo é independente e não configura regras.

## Interface Clínica da Mama (0.4.0)

A identidade usa a logo oficial e as cores lilás/laranja do [site da Clínica da Mama](https://clinicadamama.com.br/). A logo foi obtida em `https://clinicadamama.com.br/wp-content/uploads/2024/07/logo-clinicadamama.png` em 02/10/2026 e está empacotada em `extension/assets/clinicadamama-logo.png`; não há requisição ao site da clínica durante o uso. Ícones SVG locais substituem os emojis. O design foi orientado pela skill [frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md).

O painel é uma camada ancorada às dimensões do editor, com espaço mínimo reservado e restauração dos atributos/estilos ao fechar. O editor mantém seu documento ProseMirror; não recebe botões, logo ou outros nós da extensão. O cabeçalho e as ações ficam visíveis enquanto os detalhes têm rolagem própria. Não há mais arrastar/minimizar: o X dá acesso ao campo nativo e o botão de reabertura permanece disponível.

Durante a gravação há cronômetro, ponto pulsante e animação de atividade (decorativa; não representa nível de volume). `prefers-reduced-motion` desativa a animação. Ao fechar gravando, o áudio é finalizado e mantido para reprodução/transcrição ao reabrir. Ao fechar durante uma requisição, a operação é cancelada para impedir inserções tardias sobre uma edição manual. Fechar o painel não reativa a escuta nativa do Eden.

Na versão 0.4.0, os detalhes dos comandos e a transcrição para recuperação ficavam apenas na memória da aba. A versão 0.5.0 acrescenta histórico local persistente e envia registros ao painel administrativo, conforme a seção de monitoramento abaixo. Publique o backend compatível e atualize a extensão para 0.5.0. Valide o tamanho/posicionamento no PACS real, especialmente contêineres com altura fixa.

## Contexto médico da transcrição

O contexto ajuda a reconhecer termos técnicos de ultrassonografia e comandos curtos em português brasileiro. Ele é enviado junto com o áudio, antes da expansão determinística. São duas responsabilidades distintas:

- **Transcrição:** reconhece a fala e preserva números, medidas, negações e lateralidade. Não deve interpretar achados, completar frases ou expandir comandos.
- **commandProcessor:** recebe o texto transcrito e substitui comandos conhecidos pelas frases fixas cadastradas. Continua no backend, após a transcrição e antes da resposta à extensão.

O vocabulário fica em [`backend/src/config/transcriptionVocabulary.js`](backend/src/config/transcriptionVocabulary.js), na lista `ULTRASOUND_TERMS`. O prompt é montado em [`backend/src/config/transcriptionContext.js`](backend/src/config/transcriptionContext.js). Nesta versão, a lista lexical é mantida separadamente do catálogo: contém termos e comandos, sem os replacements completos e sem importar o processador.

Para adicionar um termo, acrescente uma string à lista, por exemplo `"microcalcificações"`, e reinicie/republique o backend. Use a grafia correta, sem quebras de linha nem `<` ou `>`. Isso orienta o reconhecimento; para criar uma expansão, cadastre também a regra e seus aliases no `commandProcessor` conforme a seção de comandos médicos. Atualizar o vocabulário não exige atualizar a extensão.

Configure no ambiente do backend (ou em `backend/.env`):

```dotenv
OPENAI_TRANSCRIPTION_MODEL=gpt-transcribe
TRANSCRIPTION_MEDICAL_CONTEXT_ENABLED=true
```

O contexto fica habilitado por padrão. Use `false` para comparar a transcrição sem prompt médico nem palavras-chave; português continua explícito. Reinicie o backend após alterar o ambiente. Valores diferentes de `true`/`false` são rejeitados com mensagem de configuração.

O serviço envia `prompt`, `keywords` com o vocabulário e `languages: ["pt"]` a `audio.transcriptions.create` para `gpt-transcribe`. A opção `body` segue o exemplo da documentação oficial e foi testada com o SDK instalado, OpenAI 6.49.0. Para modelos anteriores configurados por ENV, usa `language: "pt"` e `prompt`, sem `keywords`; confirme o suporte ao prompt ao trocar de modelo. Não envia `language` e `languages` simultaneamente.

Não há retry automático nem fallback silencioso: se a API rejeitar o parâmetro de contexto, o serviço registra uma orientação para verificar o modelo/limites ou desligar a flag e propaga o erro pelo tratamento existente. Os novos logs registram somente modelo, idioma, estado do contexto, quantidade de termos e duração; não incluem áudio, chave, prompt ou texto clínico.

Exemplos desejados para homologação, sem garantia de correção lexical automática:

| Fala | Transcrição desejada | Etapa seguinte |
| --- | --- | --- |
| Chammas três | Chammas 3 | O processor expande a regra Chammas III. |
| Nódulo sólido da tireoide | Nódulo sólido da tireoide | O processor busca o alias flexível. |
| Imagem hipoecogênica avascularizada ao Doppler | Imagem hipoecogênica avascularizada ao Doppler | O processor aplica somente regras cadastradas que encontrar. |

Compare os mesmos áudios com a flag ligada e desligada, verificando também se o contexto induz termos não falados. Os testes automatizados validam o contrato de envio; a qualidade do reconhecimento precisa ser avaliada com gravações reais da clínica.

## Histórico local e monitoramento administrativo

O botão **Histórico** mantém os registros no painel da extensão. O painel administrativo `/admin`, protegido pela senha configurada no backend, oferece também o histórico central para acompanhamento. Ambos mostram paciente/exame, data/hora, duração e status; os detalhes incluem transcrição original com comandos destacados, cada comando e replacement, texto final e eventual erro por etapa. Os destaques são criados como nós de texto/`mark`, sem interpretar conteúdo clínico como HTML.

Os dados do paciente e exame são lidos de `#patient-info-minimize-tabs-section` e `[data-testid="study-reason-trigger"]` ao iniciar a gravação. O snapshot inicial fica associado ao ditado; no início da transcrição, a extensão relê os dados para detectar uma troca e registrar um aviso, mas não altera o snapshot. Se um seletor estiver ausente, o respectivo campo fica vazio e o fluxo continua.

O histórico local fica em `chrome.storage.local` neste computador e persiste após reiniciar o backend. A chamada existente `/transcribe` recebe áudio e contexto paciente/exame e cria o registro central; após inserção, a extensão comunica status/erro ao mesmo backend por callback protegido por token. Para aparecer no admin, `API_BASE_URL` da extensão e o domínio onde `/admin` foi aberto precisam apontar para a mesma instância do backend. O painel atualiza a lista a cada 5 segundos. Não há analytics nem endpoint externo adicional. Cada histórico conserva até 100 registros e remove o mais antigo ao exceder o limite. O botão **Limpar histórico** pede confirmação; a limpeza local e a central são independentes. O limite local está em `extension/content/logConfig.js` (`MAX_LOG_ENTRIES`) e o central em `backend/src/services/transcriptionLogStore.js` (`MAX_LOG_ENTRIES`). A cópia central existe apenas na memória do backend e é apagada ao reiniciar o processo. O console mostra apenas a quantidade de caracteres; `DEBUG_FULL_TEXT` permanece `false` por padrão.

## Aba Máscaras

A aba **Máscaras** da extensão consulta `GET /medical-commands`, que lê diretamente o catálogo `MEDICAL_COMMANDS` de `backend/src/services/commandProcessor.js`. O médico pode pesquisar por nome, alias ou trecho da frase e filtrar por categoria; ao abrir uma máscara, vê as expressões reconhecidas e o texto exato que será inserido. A tela é somente leitura: não altera nem cadastra regras. Como os dados vêm do backend, alterações no catálogo aparecem após o deploy/reinício do backend e a próxima consulta na extensão. A interface usa nós DOM e `textContent` para renderizar as regras com segurança.

## Testes automatizados

Dentro de `backend/`:

```bash
npm test
npm run test:browser
```

O primeiro comando inclui os testes unitários do processador: aliases, caixa, acentos, múltiplas ocorrências, limites de palavras, pontuação, preservação do texto e logs. Para executar somente esses testes, use `node --test backend/test/commandProcessor.test.js` na raiz. O teste de navegador também verifica a expansão antes de inserir/enviar ao Eden, a contagem no painel e o fallback quando o processador lança um erro.

Também inclui `transcriptionService.test.js`: vocabulário/contexto sem replacements, flag habilitada/desabilitada, modelo e timeout por ENV, português, preservação literal da resposta, erros sem retry, limpeza de streams e logs seguros. Um teste usa o SDK real com transporte HTTP simulado para verificar os campos multipart, sem acessar a OpenAI ou usar credenciais reais.

O segundo comando usa o Google Chrome instalado (`channel: 'chrome'`), um microfone simulado e uma instância real de TipTap 3/ProseMirror. Não chama a OpenAI nem precisa de `.env`. Verifica captura de paciente/exame, snapshot após troca de exame, histórico local até 100 registros, painel administrativo protegido com histórico central, destaques seguros contra HTML e log de falha na inserção.

Isso não substitui testar o Eden real: a versão e os plugins do editor do PACS podem diferir da fixture. Os testes de navegador carregam os mesmos scripts em uma página local; não automatizam a instalação da extensão nem as permissões do PACS.

## Configurações que você pode alterar

| Arquivo | Configuração |
| --- | --- |
| `backend/.env` | Chave, modelo, contexto de transcrição, porta, timeout, host e origens CORS. Crie a partir de `.env.example`. |
| `extension/content/config.js` | `API_BASE_URL`, timeouts, limite de áudio, escopo do editor, identificador do exame, seletores dos controles e `AUTO_SUBMIT`. |
| `extension/manifest.json` | Domínio onde a extensão é injetada, caso o endereço do PACS mude. |
| `extension/styles/content.css` | Cores, tipografia, estados e responsividade do painel ancorado ao editor. |

Se mudar a porta do backend, altere também `API_BASE_URL`. Se mudar o limite de áudio, ajuste também o limite multipart em `backend/src/app.js` e as mensagens de tamanho. A chave nunca sai do backend.

## Editor e validação no DOM real

No DevTools da aba do PACS, execute:

```js
document.querySelectorAll('.tiptap.ProseMirror[contenteditable="true"]')
```

Deve haver um único editor visível pertencente ao Eden AI. Não há dependência da sequência completa de classes. O fallback procura `contenteditable="true"` com classes contendo `ProseMirror` ou `tiptap`; campos genéricos não são selecionados.

Se houver vários editores visíveis, configure `EDITOR_CONTAINER_SELECTOR` com um seletor estável do contêiner do **Eden AI**, por exemplo um atributo `data-*` que realmente exista. O código recusa escolher arbitrariamente. Um editor único também precisa ser confirmado como pertencente ao Eden AI na integração real.

`insertTextIntoEden(text)` está isolada em `edenEditor.js`. Ela foca o editor, seleciona todo o conteúdo, usa `execCommand('insertText')` e, se nada mudar, tenta `ClipboardEvent('paste')`. Depois dispara `InputEvent` e verifica se o conteúdo final corresponde à transcrição. Se o texto já for igual, não o duplica. Se os dois métodos forem recusados sem alterar o documento, o texto anterior permanece; uma alteração parcial é reportada para revisão manual. Não atribui `innerHTML` ao editor e não força acesso a objetos privados do React.

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

**Conexão da extensão com o backend:** as chamadas a `/transcribe`, `/medical-commands` e ao callback de status passam pelo service worker da extensão, que tem permissão explícita para o host. Isso evita que o `fetch` do content script fique sujeito à origem da página HTTPS e ao bloqueio de mixed content. O backend também reconhece origens `chrome-extension://` válidas, sem abrir CORS com `*`. Configure `CORS_ORIGIN` com a origem da página Eden/PACS, por exemplo `https://pacs.evacenter.com`, para os acessos web habituais. O navegador pode pedir nova autorização de host ao recarregar/instalar a extensão.

**Alteração do IP/host do backend:** quando mudar `API_BASE_URL`, inclua o mesmo host em `host_permissions` de `extension/manifest.json` (permissões HTTP e/ou HTTPS conforme o endereço usado), publique também o backend atualizado e recarregue a extensão e a aba do PACS. Para um IP privado, o computador precisa estar na rede local ou VPN que alcança esse IP, e o Chrome pode solicitar permissão de acesso à rede local. HTTP permite a conexão a partir da extensão, mas não criptografa o tráfego; HTTPS com certificado válido continua sendo a opção adequada para proteger áudio e dados clínicos em trânsito.

**Erro do provedor:** confira chave, saldo, acesso ao modelo e conectividade do backend com a OpenAI. Mensagens brutas do SDK são omitidas para evitar vazamentos. O modelo é configurável no `.env`.

**Página mudou:** por segurança, não há tentativa de inserir automaticamente em um novo editor. Faça um novo ditado no exame correto. Se o texto já tiver sido recebido antes de uma falha de inserção, ele aparece para cópia manual.

## Ciclo de vida dos dados

O backend cria um diretório temporário por requisição dentro de `uploads/`, salva um único arquivo e remove o diretório em `finally` antes de responder, inclusive em erro do provedor ou multipart. Falha de exclusão gera erro explícito; verifique `uploads/` nesse caso. Encerrar o processo à força ou desligar a máquina não executa `finally`: após um crash, remova eventuais resíduos antes de retomar o uso.

O histórico da extensão guarda localmente paciente/exame, transcrição original, replacements médicos e texto final em `chrome.storage.local`. A cópia central fica temporariamente na memória do backend e só é acessível após login em `/admin`. Esses dados não são enviados a analytics ou endpoints de terceiros; os metadados seguem junto do áudio na chamada existente `/transcribe` e o status final usa callback do mesmo backend. O backend apaga o áudio temporário após transcrever. O envio à OpenAI é necessário para transcrição; a retenção do provedor segue as condições da conta/API e não é controlada pela limpeza dos históricos.
