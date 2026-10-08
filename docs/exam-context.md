# Comandos médicos por exame

O catálogo de exames fica em `backend/src/config/examCatalog.js`, junto ao backend que executa os comandos. O processor permanece em `backend/src/services/commandProcessor.js`. Não há dependência da extensão para executar ou empacotar o backend.

Fluxo: snapshot do nome capturado no Eden → `resolveExamContext` → filtro por `exams` → matching existente → inserção. O servidor resolve o nome; não aceita um `contextId` enviado pelo cliente como autorização para usar um catálogo.

A comparação ignora caixa, acentos e espaços repetidos. Busca frases exatas com limites de palavras, preferindo o alias mais longo dentro de uma especialidade. Se encontrar mais de uma especialidade no mesmo nome, retorna contexto desconhecido. Não usa fuzzy matching nem IA.

## Catálogo inicial

| ID | Nome | Aliases |
| --- | --- | --- |
| mama | Mama | ultrassonografia de mama; ultrassonografia das mamas; ultrassom de mama; ultrassom das mamas; ecografia mamária; ecografia mamaria; mamas; mama; mamaria; mamária |
| tireoide | Tireoide | ultrassonografia da tireoide; ultrassonografia de tireoide; ultrassom da tireoide; ultrassom de tireoide; tireoide com doppler; tireóide com doppler; tireoide; tireóide |
| transvaginal | Transvaginal | ultrassonografia transvaginal; ultrassom transvaginal; ecografia transvaginal; transvaginal; ultrassonografia pélvica transvaginal; ultrassonografia pelvica transvaginal |
| abdome | Abdome | ultrassonografia de abdome total; ultrassonografia do abdome total; ultrassom de abdome total; ultrassom do abdome total; abdome total; abdômen total; abdome; abdômen |

`Mamaria` e `Mamária` resolvem para o ID `mama`. Nas regras, mantenha `exams: ["mama"]`: esse campo recebe IDs de contexto, não nomes alternativos do Eden.

Para cadastrar um novo nome, adicione-o a `aliases` do exame correspondente e um teste de resolução. Para uma nova especialidade, adicione um objeto com `id`, `label` e `aliases`, e use o mesmo ID nas regras.

## Regras

Todas as regras precisam declarar `exams`. Uma regra sem esse campo não participa do matching. Exemplos do catálogo:

```js
{ id: 'mama-cisto-simples', exams: ['mama'], /* aliases e replacement existentes */ }
{ id: 'chammas-3', exams: ['tireoide'], /* aliases e replacement existentes */ }
{ id: 'abdome-hemangioma', exams: ['abdome'], /* aliases e replacement existentes */ }
```

Para permitir uma regra em vários exames, use `exams: ['mama', 'tireoide']`. Só compartilhe uma regra se o mesmo replacement for adequado aos dois contextos. `exams: ['global']` permite a regra em qualquer exame, inclusive desconhecido; nenhuma regra atual foi convertida em global.

```js
processMedicalCommands(text, details, logger, {
  examName: 'Ultrassonografia das Mamas',
});
```

O retorno continua sendo texto. `details` contém contagem, comandos aplicados, `exam` e `examResolution.source`. O endpoint de transcrição recebe o nome pelo `patientContext` que já existia e retorna os mesmos metadados. O histórico local e o painel administrativo mostram nome, contexto, resolução e quantidade de comandos, sem mudar o mecanismo de persistência.

A validação de aliases é feita sobre o subconjunto permitido. Assim, aliases iguais em especialidades separadas não conflitam; regras com contexto em comum (inclusive global) avisam e preservam a precedência atual da primeira regra. Offsets, seleção pelo maior trecho e ausência de cascata permanecem iguais.

## Exame desconhecido

Nomes ausentes, desconhecidos ou ambíguos habilitam somente regras globais. Logs registram o nome não reconhecido e que os comandos específicos foram desabilitados. A UI mostra o aviso quando recebe a resolução do backend; o histórico também destaca o contexto desconhecido.

Se o paciente ou exame mudar entre gravação, transcrição e inserção, a extensão impede usar o resultado no contexto novo. A captura do DOM continua igual.

TODO: oferecer seleção manual antes de enviar a transcrição. Isso exige o estado temporário no painel, transporte explícito, validação do ID no backend e testes do descarte ao iniciar outro ditado. Nesta etapa somente resolução automática está habilitada; nenhuma seleção é persistida.

## Textos novos e pendências do material original

Os dez replacements de Mama presentes na solicitação foram adicionados literalmente. Os anteriores, inclusive alterações locais que já estavam na branch, foram preservados. Quatro novos textos diferem de regras existentes e usam aliases distintos para não disputar o mesmo comando:

| Nova variante | Alias |
| --- | --- |
| mama-cisto-simples-glandular | cisto simples descrição glandular |
| mama-linfonodo-intramamario-qsl | linfonodo intramamário QSL |
| mama-ectasia-ductal-bilateral | ectasia ductal bilateral |
| mama-nodulo-irregular-glandular | nódulo irregular descrição glandular |

Os demais aliases novos são: nódulo sólido, esteatonecrose, siliconoma, aglomerado cístico, nódulo sólido-cístico e lesão não nodular. Foram acrescentados `mioma` e `ovários micropolicísticos` às regras correspondentes já existentes, sem mudar seus textos.

Faltam os replacements originais para BI-RADS 1, 2, 3 e 4-A; cisto unilocular; pólipo endocervical; ovários não visualizados (o texto atual é apenas do ovário direito); endometrioma; teratoma; istmocele; útero bicorno; e esteatose leve, moderada e acentuada. Não foram inventados textos para essas regras. Os outros comandos transvaginais/abdominais já presentes mantêm seus textos até ser possível compará-los com o material original.

A regra antiga de esteatose continua com o texto neutro `Textura:Hiperecogênica`; não foi associada a nenhum grau. As futuras três regras deverão usar aliases explícitos de grau, sem alias genérico `esteatose`.

O teste de múltiplos comandos com BI-RADS usa um catálogo de teste, explicitamente sintético; a validação do replacement real de BI-RADS depende do material faltante. Há também um teste com dois comandos reais de Mama.

## Validação

Execute `npm test` e `npm run test:browser` no diretório `backend`. A suíte de contexto cobre separação entre especialidades, acentos, limites de palavras, ambiguidade, nomes ausentes, regras globais, regras sem escopo, conflitos, múltiplos comandos e múltiplos exames por regra.


## Arquivos desta entrega

Criados:
- `backend/src/config/examCatalog.js`
- `backend/test/examContext.test.js`
- `docs/exam-context.md`

Alterados:
- `backend/src/services/commandProcessor.js`
- `backend/src/routes/transcribe.js`
- `backend/src/services/transcriptionLogStore.js`
- `backend/public/admin.js`
- `backend/package.json`
- `backend/test/admin.test.js`
- `backend/test/backend.test.js`
- `backend/test/browser.test.js`
- `backend/test/commandProcessor.test.js`
- `backend/test/transcriptionService.test.js`
- `extension/content/content.js`
- `extension/content/monitoring.js`
- `extension/content/ui.js`
- `extension/styles/content.css`

Resultados: `npm test` passou com 93 testes; `npm run test:browser` passou com 42 testes. Os testes de navegador exigiram execução fora do sandbox para abrir a porta local e o Chrome. `git diff --check` passou. Uma comparação com o snapshot do início confirmou que todos os 50 replacements anteriores e seus aliases foram preservados.
