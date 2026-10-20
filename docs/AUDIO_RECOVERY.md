# Áudio local e recuperação — V1

O Blob final é salvo **antes de qualquer POST /transcribe**. O salvamento só é confirmado depois de `IDBTransaction.oncomplete`, com durabilidade `strict`. O callback do `MediaRecorder.onstop` aguarda esse salvamento, inclusive em finalizações inesperadas que produzam áudio não vazio. Reprodução e processamento vêm depois.

## Componentes e arquivos

Criados:

- `extension/storage/audioStore.js`: IndexedDB nativo, transações, índices, retenção, quota, recuperação e locks entre abas.
- `extension/storage/audioStoreClient.js`: cliente privado do armazenamento.
- `extension/storage/broker.html` e `broker.js`: página interna que armazena Blobs e faz as chamadas HTTP existentes.
- `extension/storage/player.html`, `player.js` e `extension/styles/player.css`: player na origem da extensão, usado quando o CSP do PACS bloqueia URLs `blob:`.
- `extension/services/recordingProcessor.js`: checkpoints, retries e segurança de contexto.
- `extension/services/commandProcessor.generated.js`: processador gerado a partir das regras existentes do backend, usado apenas quando falta o texto processado.
- `backend/scripts/buildExtensionCommands.js`: geração desse arquivo, sem nova dependência.
- `backend/test/audioRecovery.test.js`: cenários de recuperação com IndexedDB real.
- `backend/test/extensionStorage.test.js`: extensão instalada, comunicação binária, origem do banco, multipart e reload.
- Este documento.

Alterados:

- `extension/content/config.js`: limites compartilhados de retenção e retry.
- `extension/content/recorder.js`, `content.js`, `apiClient.js`: finalização, persistência e processamento por ID.
- `extension/content/monitoring.js`, `ui.js`, `extension/styles/content.css`: pendências, reprodução, detalhes, retry e exclusão.
- `extension/background/apiBridge.js`, `serviceWorker.js`: upload do registro persistido e autenticação do canal local.
- `extension/manifest.json`: novos scripts e página interna.
- `backend/src/routes/transcribe.js`: preserva `TRANSCRIPTION_EMPTY` e informa `commandProcessing.success`. Nenhum endpoint novo.
- `backend/test/backend.test.js`, `browser.test.js`, `backend/package.json`: contratos, integração e comandos de testes/build.

`commandProcessor`, `examCatalog`, `medicalCommandCatalog`, vocabulário, contexto de transcrição e `edenEditor` não tiveram suas regras alteradas.

## Por que uma página interna

IndexedDB aberto diretamente por um content script pertence à origem do PACS. Aqui o banco é aberto em `chrome-extension://<id>/storage/broker.html`, na origem da extensão.

Um `MessageChannel` faz structured clone dos Blobs, sem base64, arrays JSON de bytes ou localStorage. O service worker emite uma credencial de uso único, restrita à aba e com validade de 15 segundos. Somente o canal autenticado recebe operações; o JavaScript do PACS não recebe o conteúdo. Listagens e confirmações de checkpoints transportam somente metadados; o player carrega um Blob por vez.

O banco `eden-voice`, versão 1, possui o object store `recordings`, keyPath `id`, e índices `status`, `createdAt`, `patientName` (`patient.name`) e `examName` (`exam.name`). Não há sincronização, analytics ou cloud storage. O áudio é transmitido exclusivamente ao POST `/transcribe` existente. O callback de status e a consulta ao catálogo já existentes continuam disponíveis.

## Registro persistido

```js
{
  id: 'uuid',
  createdAt: 'ISO_DATE', updatedAt: 'ISO_DATE',
  date: '09/10/2026', time: '08:31', status: 'pending',
  patient: { name: 'Paciente de exemplo', gender: '...', age: '...' },
  exam: { name: 'Abdome', contextId: 'abdome', contextLabel: 'Abdome' },
  audio: { blob: Blob, mimeType: 'audio/webm;codecs=opus', sizeBytes: 139393, durationSeconds: 42 },
  recording: { startedAt: 'ISO_DATE', finishedAt: 'ISO_DATE' },
  processing: {
    attemptCount: 0, autoAttempts: 0, retryCount: 0,
    lastAttemptAt: null, lastError: null,
    autoRetryable: false, nextAttemptAt: null
  },
  transcription: { originalText: null, processedText: null, durationMs: null },
  commands: [],
  insertion: { success: false, insertedAt: null, error: null },
  // Retornados pelo backend quando disponíveis:
  remoteLogId: null, remoteCompletionToken: null
}
```

`attemptCount` conta execuções iniciadas; `retryCount` conta falhas. `autoAttempts` limita a sequência automática e não é zerado por reload. `lastError` tem `{ stage, code, message, timestamp }`. `insertion` também guarda checkpoints de envio (`submitStartedAt`, `submittedAt`) quando AUTO_SUBMIT está habilitado.

## Fluxo e checkpoints

1. MediaRecorder finaliza; o Blob completo é salvo como `pending`.
2. O processador adquire lock por ID, relê o registro e marca `uploading`.
3. O POST existente retorna transcrição e resultado dos comandos; ambos são persistidos como `transcribed`.
4. `processing` confirma o resultado dos comandos. O backend continua sendo o processador normal.
5. O contexto é validado; `inserting` precede a chamada ao editor.
6. A inserção confirmada é persistida. Se configurado, o fluxo aguarda e clica no envio nativo do Eden.
7. Somente então marca `success`, grava observabilidade sem Blob no logStore e executa limpeza.

Qualquer falha mantém o Blob e grava `failed`. Falhas na própria escrita de checkpoint deixam o checkpoint anterior intacto. Uma falha de log ou limpeza depois de `success` não transforma a operação concluída em falha.

Se `commandProcessing.success === false`, o texto original é salvo e a operação fica em falha; não se insere o fallback como sucesso. No retry, a extensão executa localmente o mesmo processador gerado das fontes do backend. Se `processedText` já existe, essa etapa também é pulada.

Ao alterar as regras do backend, gerar novamente:

```sh
npm run build:extension --prefix backend
```

Publicar backend e extensão atualizados juntos para que o cliente receba os novos indicadores de erro. Backends antigos não distinguem a falha de comandos do seu fallback original.

## Reprocessar, ouvir e excluir

O botão “Manter no histórico” libera o painel para outro ditado sem excluir o áudio. No Histórico, cada registro mostra data/hora, paciente, exame, duração, tentativas, comandos e status. `Reprocessar` atualiza o mesmo ID, com o mesmo Blob. Não abre o microfone.

- Sem `originalText`: envia o áudio salvo ao POST existente.
- Com `originalText`: não chama novamente a API de transcrição.
- Sem `processedText`: executa os comandos localmente e salva o resultado.
- Com `processedText`: tenta somente as etapas pendentes de inserção/envio.
- Com `success`: não executa novamente.

O botão é desabilitado durante o processamento. Há lock em memória por ID e Web Locks na origem da extensão para impedir concorrência entre abas; outro lock serializa inserções de gravações diferentes. Reload destrói o frame e libera os locks.

`Ouvir áudio` lê os bytes binários do Blob, cria uma URL temporária e inicia a reprodução com volume ativo. Se CSP ou o decodificador bloquear o player da página, o histórico usa o player hospedado na origem da extensão; ele abre o mesmo registro diretamente no IndexedDB. O áudio continua fora da origem do PACS. Atualizações de status preservam o elemento de mídia e a posição da reprodução. Arquivo inválido, falha de leitura e carregamento superior a 12 segundos exibem mensagem sem excluir o original. A URL é revogada quando o player é removido ou a página sai. `Excluir` exige a confirmação “Tem certeza que deseja excluir esta gravação local?” e remove o registro e o Blob. Logs finais sem áudio têm a retenção própria já existente.

## Retry automático e reload

A sequência automática tem no máximo três tentativas: imediata, após 5 segundos e após mais 15 segundos. São elegíveis erros de rede, timeout, 502, 503, 504 e `TRANSCRIPTION_EMPTY`. Validação, contexto, comandos e editor exigem intervenção manual. Não há retry infinito. Tentativas manuais continuam possíveis após o limite.

Offline não inicia upload automático. `online` aciona a fila respeitando o backoff persistido. A inicialização recupera pendências e agenda apenas operações elegíveis. Pending e failed sobrevivem a F5.

`uploading`, `transcribing`, `transcribed`, `processing` e `inserting` sem lock ativo são recuperados como `failed`, com `stage: recovery` e `code: PROCESS_INTERRUPTED`. Não são presumidos como concluídos e não são retomados automaticamente, porque uma inserção pode ter ocorrido antes da interrupção. O usuário revisa o editor e clica Reprocessar.

Não existe transação atômica entre o DOM do Eden e IndexedDB. Se o clique de envio começou e não foi confirmado, o sistema bloqueia novo clique e pede conferência manual. Se a inserção foi confirmada, mas o editor mudou antes de enviar, também bloqueia o envio automático.

## Proteção de contexto

Patient name e exam name salvos são preservados mesmo quando o backend retorna metadados adicionais. Antes de inserir, ambos precisam existir e corresponder à tela atual, ignorando caixa e normalizando espaços. A rota e o elemento do editor também precisam continuar válidos. Mudança durante as operações assíncronas bloqueia a inserção/envio.

Divergência produz `CONTEXT_MISMATCH`, mantém a transcrição pronta e solicita abrir o contexto correto. Ao voltar ao paciente/exame original, Reprocessar usa os checkpoints, sem novo upload. Nomes ausentes não são considerados uma correspondência segura.

## Retenção e quota

`AUDIO_RETENTION`, definido uma única vez em `extension/content/config.js`: `SUCCESS_HOURS: 2`, `FAILED_HOURS: 24`, `MAX_ENTRIES: 30`, `MAX_AUTO_RETRIES: 3`.

A limpeza roda na inicialização, no salvamento, ao abrir histórico e depois de sucesso. Remove success expirado, failed com 24 horas desde sua última atualização e success mais antigo para reduzir a quantidade. Em pressão de quota, prioriza success, com log explícito de ID e motivo. Nunca sacrifica failed recente ou pending só para atingir 30: o limite é deliberadamente flexível nesses casos e gera aviso no console.

`navigator.storage.estimate()` registra usage/quota quando disponível. `QuotaExceededError` gera mensagem explícita. O fluxo não transmite um áudio que não pôde salvar. O Blob continua em memória e pode ser ouvido; mantenha a página aberta, libere espaço e clique Transcrever para repetir o salvamento.

A proteção começa na confirmação do commit local. Fechar o navegador antes desse commit, desinstalar a extensão ou apagar os dados do perfil ficam fora dessa garantia. A V1 mantém chunks em memória; o TODO de Fase 2 prevê persistência incremental. O `start(1000)` existente continua apenas coletando chunks, sem gravá-los individualmente no IndexedDB.

## Validação

```sh
npm test --prefix backend
npm run test:browser --prefix backend
npm run test:audio --prefix backend
```

O teste de extensão instalada usa Chromium do Playwright (`npx playwright install chromium`); os testes existentes de microfone/TipTap usam Chrome. Não chamam o provedor de transcrição real.

Os testes cobrem persistência antes de upload, falhas HTTP/rede, áudio vazio, retry com mesmo Blob/ID, success após inserção, checkpoints de texto, retry sem API, F5, recuperação de estados interrompidos, limite/backoff, online/offline, concorrência, contexto divergente, playback/revogação, exclusão, retenção, quota, timeout, contexto invalidado, fallback de comandos e o canal real da extensão.
