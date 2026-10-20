# Classificação clínica por segmentos — pipeline v4

O caminho principal usa IA para **classificar**, nunca para redigir. As regras determinísticas anteriores continuam disponíveis como fallback, sem aumentar o catálogo de heurísticas para decidir a intenção no caminho normal.

## Fluxo

Transcrição original → segmentação local → detecção de comandos → classificação IA no backend → proteção determinística de comandos → reconstrução pelos segmentos originais → parser de medidas → cálculo determinístico → processador de comandos → editor Eden.

- `clinicalSegmenter.js`: IDs sequenciais e spans no texto original. Preserva decimais, repetições, acentos e frases curtas; separa frases/linhas, não cada vírgula.
- `clinicalSegmentClassifier.js`: Responses API com JSON Schema estrito. A única resposta aceita contém `segments: [{ id, include, reason }]`. Não recebe ferramentas ou capacidade de alterar o laudo.
- `aiClinicalPipeline.js`: deadline, validação da resposta e seleção do fallback. A chamada foi integrada a `/transcribe`, sem endpoint adicional.
- `clinicalPipeline.js`: aplica a proteção determinística e reconstrói `filteredText` exclusivamente por `originalSegments[id].text`, na ordem original. Mantém medidas/cálculos no fluxo existente.

## Validação e proteção

São rejeitados IDs inexistentes, duplicados ou ausentes, booleanos em formato de texto, razões fora do enum, JSON inválido, campos extras (incluindo texto reescrito), respostas incompletas e recusas. Nenhum texto vindo da IA é inserido.

Comandos não negados, válidos para o exame e detectados no catálogo único `MEDICAL_COMMANDS`, forçam inclusão com `medical_command`, mesmo se a IA os excluir. O detector não expande texto.

Incluir um segmento e executar um comando são decisões distintas. Se a IA incluir “Não tem nódulo sólido.”, o segmento original entra e o candidato fica `negated: true, execute: false`. O processador verifica novamente a negação antes de substituir. A IA não calcula volumes; as regras anatômicas/exame e fatores existentes continuam determinísticos.

A segmentação não identifica falantes. A precisão da decisão semântica depende do modelo; proteção por catálogo e validação estrutural não comprovam intenção de fala. A classificação de conversa e ditado deve ser avaliada com casos representativos antes de uma liberação ampla.

## Configuração do backend

Defaults em `backend/src/config/clinicalFilter.js`:

```dotenv
ENABLE_AI_FILTER=true
USE_DETERMINISTIC_FALLBACK=true
CLINICAL_FILTER_TIMEOUT_MS=8000
CLINICAL_FILTER_MODEL=gpt-4o-mini
```

`CLINICAL_FILTER_TIMEOUT_MS` aceita 1000–10000 ms. A chave existente `OPENAI_API_KEY` continua exclusivamente no backend. Não foi alterado nenhum segredo ou arquivo `.env` local.

Há uma tentativa por classificação, sem retries do SDK. Um deadline também encerra a espera caso o cliente ignore o cancelamento. Timeout, erro HTTP, resposta inválida, indisponibilidade de chave/modelo ou limite de entrada acionam `deterministic_fallback`. O limite da chamada é 500 segmentos/60000 caracteres. `ENABLE_AI_FILTER=false` usa diretamente as regras atuais. Com fallback desabilitado e falha de IA, o original permanece salvo e a inserção é bloqueada.

O fallback mantém seu comportamento conservador anterior, inclusive podendo omitir frases negativas ou telegráficas que a IA incluiria. O histórico deixa o modo explícito.

## Privacidade e logs

O payload do provedor contém apenas contexto canônico do exame (`name`, `id`) e segmentos com `id` e `text`. Não inclui campos de paciente, CPF, prontuário, áudio, replacements ou dados administrativos do registro. O texto ditado é enviado como conteúdo necessário à classificação; não há promessa de anonimização de identificadores que tenham sido falados dentro da própria transcrição. A chamada usa `store: false`; isso não representa garantia sobre políticas gerais de retenção do provedor. Nenhum analytics foi adicionado.

Logs registram modo, totais incluídos/excluídos e número de comandos protegidos. Não registram prompt, resposta bruta, transcrição integral ou mensagens do provedor que possam reproduzi-los.

## Persistência e recuperação

O registro existente salva:

- `transcription.originalText`, `filteredText`, `measurementText` e `processedText`;
- `clinicalFilter.mode` (`ai` ou `deterministic_fallback`) e decisões `{ id, include, reason }`;
- `filterDetails.segments`, com texto original, motivos e candidatos/negação/execução;
- `measurements`, comandos executados e `pipelineVersion: 4`.

Falha no editor reutiliza o resultado processado. Falha no processador de comandos reutiliza `measurementText` e a classificação persistida. Nenhum desses retries envia áudio ou classifica novamente. Gravações antigas ainda pendentes podem usar fallback local; não foi criado endpoint de reclassificação. Gravações já concluídas não são reinseridas automaticamente. Retenção segue a política existente.

O histórico local mostra o modo, original, incluídos, ignorados, motivos, candidatos de comando e medidas. Os dados também são preservados no log do backend.

## Testes e ativação

```sh
npm test --prefix backend
npm run build:extension --prefix backend
npm run test:audio --prefix backend
```

Os testes de classificação usam respostas controladas: verificam o contrato, os seis exemplos, a reconstrução fiel, negação, proteção, falhas, privacidade de campos e timeout. Não são uma avaliação de precisão do modelo real. Testes de navegador verificam persistência e ausência de nova chamada nos retries.

Para ativar, publicar o backend atualizado e recarregar a extensão/página. O bundle compartilhado contém apenas lógica determinística; o SDK e a chave não entram nele.

Referência de implementação: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).


## Diagnóstico de produção e fallback de medidas

O diagnóstico do classificador persiste `clinicalFilter.mode`, `fallbackReason` e `aiStatus` (chamado, status HTTP, código, motivo estático e URL do provedor sem credenciais/query). Motivos cobrem IA desabilitada/não chamada, timeout, rede, HTTP, JSON inválido, schema, resposta vazia e erro inesperado. A exceção bruta e a resposta/texto clínico nunca são usados como motivo de log.

Antes da chamada, o backend registra `examName` e `examContextId`. Contexto não resolvido já não elimina estruturas inequívocas de tireoide associadas a três números. O parser também reconhece listas `N, N, N` após lobo direito/esquerdo e istmo. Não atribui volume nem unidade às medidas da tireoide.

Schema da classificação: todos os IDs de entrada, exatamente uma decisão por ID; IDs são limitados pelo próprio schema. Inclusão exige `reason: report`; exclusão aceita apenas os motivos de conversa/pergunta/instrução/desconhecido. Esta restrição foi reforçada após o modelo real devolver só três de quatro IDs e marcar todos os três segmentos de medidas como `instruction`; a validação anterior escondia esse motivo atrás de um fallback genérico. O schema corrigido foi verificado com o modelo e retornou os quatro IDs esperados.

`POST /classify-clinical-segments` está registrado no backend atual e usa o mesmo classificador e schema do caminho principal `/transcribe`. `backend/scripts/checkClinicalClassifier.js` executa um smoke check sintético, mostra só os IDs e decisões enumeradas (com `--schema-diagnostics`) e reporta o total de medidas, sem imprimir as frases. `npm run diagnostics:clinical --prefix backend` usa a chave já existente no ambiente.

A extensão direciona a rota por `EdenVoice.CONFIG.API_BASE_URL`, configurada no workspace como `http://0.0.0.0:3009`; o destino provider confirmado é `https://api.openai.com/v1/responses`. Em 20/10/2026, o processo que já escutava a porta 3009 respondeu 404 para a rota nova, portanto ele precisa ser reiniciado/reimplantado com este código. O fluxo atual dentro de `/transcribe` já envia o classificador diretamente ao provedor e não depende dessa rota auxiliar; não reiniciei o processo ativo automaticamente.
