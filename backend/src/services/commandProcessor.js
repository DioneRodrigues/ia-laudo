const MEDICAL_COMMANDS = [
  // =========================================================
  // TIREOIDE
  // =========================================================

  {
    id: "tireoide-nodulo-padrao",
    label: "Tireoide - Nódulo sólido padrão",
    aliases: [
      "nódulo texto padrão tireoide",
      "nódulo sólido tireoide",
      "imagem nodular sólida tireoide",
      "nodulo texto padrao tireoide",
      "nodulo solido tireoide",
      "nodulo hipoecoico",
    ],
    replacement:
      "Observa-se no @, uma imagem nodular sólida hipoecogênica, textura heterogênea, contendo fino halo anecóico periférico, contornos regulares, limites bem definidos, discreto reforço acústico posterior, medindo @ cm.",
  },

  {
    id: "tireoide-lesao-solido-cistica",
    label: "Tireoide - Lesão sólido-cística",
    aliases: [
      "lesão sólido-cística",
      "lesão sólido cística",
      "lesao solido cistica",
      "nódulo misto",
      "nodulo misto",
      "imagem nodular mista",
    ],
    replacement:
      "Observa-se no @, uma lesão sólido-cística, textura heterogênea, contendo fino halo anecóico periférico, contornos regulares, limites bem definidos, discreto reforço acústico posterior, medindo @ cm.",
  },

  {
    id: "tireoide-nodulo-espongiforme",
    label: "Tireoide - Nódulo espongiforme",
    aliases: [
      "nódulo espongiforme",
      "nodulo espongiforme",
      "imagem com aspecto espongiforme",
      "espongiforme",
    ],
    replacement:
      "Observa-se no @, uma imagem nodular sólida hipoecogênica, aspecto espongiforme, textura heterogênea , contendo fino halo anecóico periférico, contornos regulares, limites bem definidos, discreto reforço acústico posterior, medindo @ cm.",
  },

  {
    id: "tireoide-cistos-plural",
    label: "Tireoide - Cistos coloides",
    aliases: [
      "cisto plural tireoide",
      "cistos tireoide",
      "cisto coloide plural",
      "cistos coloides",
      "imagem cística plural tireoide",
      "imagem cistica plural tireoide",
    ],
    replacement:
      "Observa-se imagens anecóicas, contornos regulares, limites bem definidos, sendo:\n- @@, medindo @@ cm.",
  },

  {
    id: "tireoide-cisto",
    label: "Tireoide - Cisto",
    aliases: [
      "cisto tireoide",
      "cisto coloide",
      "cisto coloide tireoide",
      "imagem cística tireoide",
      "imagem cistica tireoide",
    ],
    replacement:
      "Observa-se uma imagem anecóica, contornos regulares, limites bem definidos, medindo @ cm.",
  },

  {
    id: "tireoide-doppler-fluxo-aumentado",
    label: "Tireoide - Doppler com aumento do fluxo",
    aliases: [
      "doppler com aumento do fluxo",
      "fluxo aumentado",
      "fluxo aumentado tireoide",
      "doppler tireoide fluxo aumentado",
    ],
    replacement:
      "Doppler de tireóide evidência aumento do fluxo em parênquima com IR dentro do limites da normalidade",
  },

  {
    id: "chammas-4",
    label: "Tireoide - Chammas IV",
    aliases: [
      "chammas 4",
      "chamas 4",
      "chammas quatro",
      "chamas quatro",
      "chammas iv",
      "vascularização tipo 4",
      "vascularizacao tipo 4",
    ],
    replacement:
      ", ao efeito Doppler observa-se predomínio da vascularização central sobre a periférica (Tipo IV de Chammas).",
  },

  {
    id: "chammas-3",
    label: "Tireoide - Chammas III",
    aliases: [
      "chammas 3",
      "chamas 3",
      "chammas três",
      "chamas três",
      "chammas tres",
      "chamas tres",
      "chammas iii",
      "vascularização tipo 3",
      "vascularizacao tipo 3",
    ],
    replacement:
      ", ao efeito Doppler observa-se predomínio da vascularização periférica sobre a central (Tipo III de Chammas).",
  },

  {
    id: "chammas-2",
    label: "Tireoide - Chammas II",
    aliases: [
      "chammas 2",
      "chamas 2",
      "chammas dois",
      "chamas dois",
      "chammas ii",
      "vascularização tipo 2",
      "vascularizacao tipo 2",
    ],
    replacement:
      ", ao efeito Doppler observa-se vascularização periférica (tipo II de Chammas)",
  },

  {
    id: "chammas-1",
    label: "Tireoide - Chammas I",
    aliases: [
      "chammas 1",
      "chamas 1",
      "chammas um",
      "chamas um",
      "chammas i",
      "vascularização tipo 1",
      "vascularizacao tipo 1",
      "sem vascularização",
      "sem vascularizacao",
      "vascularização ausente",
      "vascularizacao ausente",
    ],
    replacement: ", avascularizada ao efeito Doppler (Tipo I de Chammas).",
  },

  // Chammas V já existia no projeto, mas NÃO consta no documento enviado.
  // Mantido sem alteração para não remover funcionalidade existente.
  {
    id: "chammas-5",
    label: "Tireoide - Chammas V",
    aliases: [
      "chammas 5",
      "chamas 5",
      "chammas cinco",
      "chamas cinco",
      "chammas v",
    ],
    replacement: "nódulo apenas com vascularização central (Chammas V).",
  },

  // =========================================================
  // MAMA
  // =========================================================

  {
    id: "mama-cisto-simples",
    label: "Mama - Cisto simples",
    aliases: [
      "cisto mama",
      "cisto simples",
      "cisto simples mama",
      "imagem cística mama",
      "imagem cistica mama",
    ],
    replacement:
      "Observa-se no @, uma imagem anecóica, contornos regulares, limites bem definidos, superfície interna lisa, sem septos e/ou vegetações, reforço acústico posterior, medindo @ cm.",
  },

  {
    id: "mama-cistos-simples-plural",
    label: "Mama - Cistos simples",
    aliases: [
      "cistos plural",
      "cistos mama",
      "cistos simples plural",
      "cistos simples mama",
      "imagens císticas mama",
      "imagens cisticas mama",
    ],
    replacement:
      "Observa-se imagens anecóicas, contornos regulares, limites bem definidos,  superfícies internas lisas, sem septos e/ou vegetações, reforço acústico posterior, sendo:\n- @@, medindo @@ cm.\n- @@, medindo @@ cm.",
  },

  {
    id: "mama-nodulo-padrao",
    label: "Mama - Nódulo sólido padrão",
    aliases: [
      "nódulo mama",
      "nodulo mama",
      "nódulo sólido mama",
      "nodulo solido mama",
      "nódulo texto padrão mama",
      "nodulo texto padrao mama",
    ],
    replacement:
      "Observa-se às @ horas, uma imagem nodular solida, hipoecogênica, textura heterogênea, circunscrita e ovalada, contendo fino halo anecóico periférico, contornos regulares, limites bem definidos, avascularizada ao efeito Doppler, reforço acústico posterior, distando +/- @ cm do mamilo, medindo @ cm.",
  },

  {
    id: "mama-nodulos-plural",
    label: "Mama - Nódulos sólidos múltiplos",
    aliases: [
      "nódulos plural",
      "nodulos plural",
      "nódulos sólidos plural",
      "nodulos solidos plural",
      "nódulos texto padrão",
      "nodulos texto padrao",
      "nódulos múltiplos mama",
      "nodulos multiplos mama",
    ],
    replacement:
      "Observa-se imagens nodulares solidas hipoecogênicas, textura heterogênea, contendo fino halo anecóico periférico, circunscritas e ovaladas, avascularizadas ao efeito Doppler, contornos regulares, limites bem definidos, reforço acústico posterior, sendo:\n- @@, medindo @@ cm.\n- @@, medindo @@ cm.",
  },

  {
    id: "mama-nodulo-irregular",
    label: "Mama - Nódulo irregular / suspeito",
    aliases: [
      "nódulo irregular",
      "nodulo irregular",
      "nódulo sólido irregular",
      "nodulo solido irregular",
      "nódulo alterado",
      "nodulo alterado",
      "nódulo suspeito",
      "nodulo suspeito",
    ],
    replacement:
      "Observa-se às @ horas, uma imagem nodular solida, hipoecogênica, textura heterogênea, contornos irregulares, bordos ecogênicos, espessados, limites mal definidos, vascularizada ao efeito Doppler, atenuação acústica posterior, distando +/- @ cm do mamilo, medindo @ cm.",
  },

  {
    id: "mama-assimetria-focal",
    label: "Mama - Área de densidade assimétrica",
    aliases: [
      "área de densidade assimétrica",
      "area de densidade assimetrica",
      "assimetria focal",
    ],
    replacement:
      "Observa-se às @ horas, uma área de densidade assimétrica, textura heterogênea, avascularizada ao efeito Doppler, contornos regulares, limites bem ou mal definidos, atenuação acústica posterior, distando +/- @ cm do mamilo, medindo @ cm.",
  },

  {
    id: "mama-tecido-ectopico",
    label: "Mama - Tecido mamário ectópico",
    aliases: [
      "tecido mamário",
      "tecido mamario",
      "tecido mamário ectópico",
      "tecido mamario ectopico",
    ],
    replacement:
      "Axila @: Observa-se em região axilar, imagem heterogênea, medindo @ cm, compativel com tecido mamário ectópico.",
  },

  {
    id: "mama-linfonodo-intramamario",
    label: "Mama - Linfonodo intra-mamário",
    aliases: [
      "linfonodo",
      "linfonodo mama",
      "linfonodo intra-mamário",
      "linfonodo intra mamário",
      "linfonodo intramamário",
      "linfonodo intramamario",
    ],
    replacement:
      "Observa-se às @ horas, uma imagem nodular sólida hipoecogênica, área central ecogênica, vaso nutridor marginal, contornos regulares, limites bem definidos, sem artefato acústico posterior, distando +/- @ cm do mamilo, medindo @ cm, podendo corresponder a linfonodo intra-mamário.",
  },

  {
    id: "mama-ectasia-ductal",
    label: "Mama - Ectasia ductal",
    aliases: ["ectasia ductal", "ducto dilatado"],
    replacement:
      "Tecido glandular: Textura Heterogênea observando- se dilatação dos ductos retro-areolares,.",
  },

  // =========================================================
  // TRANSVAGINAL
  // =========================================================

  {
    id: "transvaginal-foliculo",
    label: "Transvaginal - Folículo",
    aliases: [
      "folículo",
      "foliculo",
      "imagem com aspecto folicular",
      "folículo ovariano",
      "foliculo ovariano",
    ],
    replacement:
      "Textura: Mista, observando-se imagem anecóica com aspecto folicular, medindo @ cm.",
  },

  {
    id: "transvaginal-ovario-micropolicistico",
    label: "Transvaginal - Ovário com aspecto micropolicístico",
    aliases: [
      "ovário com aspecto micropolicistico",
      "ovario com aspecto micropolicistico",
      "ovário micropolicístico",
      "ovario micropolicistico",
      "aspecto micropolicístico",
      "aspecto micropolicistico",
    ],
    replacement:
      "Textura: Mista, observando˗se múltiplos folículos periféricos com aspecto micropolicístico.",
  },

  {
    id: "transvaginal-cisto-ovario",
    label: "Transvaginal - Cisto simples no ovário",
    aliases: [
      "cisto no ovário",
      "cisto no ovario",
      "cisto simples no ovário",
      "cisto simples no ovario",
    ],
    replacement:
      "Textura: Mista, observando-se uma imagem anecóica, contornos regulares, limites bem definidas, Avascularizada ao efeito Doppler, superfície interna lisa sem septos ou vegetações, reforço acústico posterior, com aspecto folicular, medindo @ m.",
  },

  {
    id: "transvaginal-mioma",
    label: "Transvaginal - Mioma uterino",
    aliases: ["mioma", "mioma uterino"],
    replacement:
      "Miométrio: Heterogêneo, observando˗se em parede @@@, nódulo sólido hipoecogênico, contornos regulares, medindo @@@ cm.",
  },

  {
    id: "transvaginal-miomas",
    label: "Transvaginal - Miomas uterinos",
    aliases: ["miomas", "miomas uterinos", "mioma uterinos"],
    replacement:
      "Miométrio: Heterogêneo, observa˗se nódulos sólidos hipoecogênicos, contornos regulares, sendo:\n- Um em parede @, medindo @ cm.\n- Um em parede @, medindo @ cm.\n- Um em parede @, medindo @ cm.",
  },

  {
    id: "transvaginal-adenomiose",
    label: "Transvaginal - Adenomiose",
    aliases: ["adenomiose"],
    replacement:
      "Miométrio: Heterogêneo com assimetria de parede, contendo áreas anecóicas de permeio em parede @, com fluxo ao efeito Doppler, sugestiva de adenomiose.",
  },

  {
    id: "transvaginal-polipo-endometrial",
    label: "Transvaginal - Pólipo endometrial",
    aliases: [
      "pólipo",
      "polipo",
      "pólipo no endométrio",
      "polipo no endometrio",
      "pólipo endometrial",
      "polipo endometrial",
    ],
    replacement:
      ", contendo imagem ecogênica, contornos regulares, sugestiva de pólipo endometrial, medindo @ mm.",
  },

  {
    id: "transvaginal-hidrossalpinge",
    label: "Transvaginal - Hidrossalpinge",
    aliases: ["hidrossalpinge"],
    replacement:
      "Descrições: Observa se em região anexial direita, medialmente posicionada em relação ao ovário, uma imagem anecóica, alongada com aspecto fusiforme, Avascularizada ao efeito Doppler, superfície interna lisa, medindo cm, sugerindo hidrossalpinge.",
  },

  {
    id: "transvaginal-diu-normal",
    label: "Transvaginal - DIU em posição normal",
    aliases: [
      "diu",
      "diu em posição normal",
      "diu em posicao normal",
      "diu bem posicionado",
    ],
    replacement:
      "Observa-se DIU em cavidade endometrial, distando 3,8 mm do seu fundo situado acima do orifício interno do colo.",
  },

  {
    id: "transvaginal-cisto-hemorragico",
    label: "Transvaginal - Cisto hemorrágico",
    aliases: ["cisto hemorrágico", "cisto hemorragico", "cisto de sangue"],
    replacement:
      "Textura: Mista, observando-se uma imagem anecóica, contendo ecos em seu interior, contornos regulares, limites bem definidas, avascularizada ao efeito Doppler, superfície interna lisa sem septos ou vegetações, reforço acústico posterior, medindo cm, compatível com cisto de conteúdo hemático ",
  },

  {
    id: "transvaginal-liquido-cavidade",
    label: "Transvaginal - Pequena quantidade de líquido",
    aliases: [
      "líquido na cavidade",
      "liquido na cavidade",
      "pequena quantidade de líquido",
      "pequena quantidade de liquido",
    ],
    replacement:
      "Observa se pequena quantidade de líquido livre, com fino debris em cavidade medindo @ cm.",
  },

  {
    id: "transvaginal-cisto-endocervical",
    label: "Transvaginal - Cisto endocervical",
    aliases: ["cisto no colo", "cisto endocervical"],
    replacement:
      "Colo uterino: Observa-se em região cervical imagem anecóica  contornos regulares, medindo @ cm. Compatível com cisto endocervical.",
  },

  {
    id: "transvaginal-mucometrio",
    label: "Transvaginal - Discreto mucométrio",
    aliases: [
      "mucométrio",
      "mucometrio",
      "discreto mucométrio",
      "discreto mucometrio",
    ],
    replacement:
      "Observando-se imagem anecóico com aspecto laminar, compatível com discreto mucométrio.",
  },

  {
    id: "transvaginal-varizes-pelvicas",
    label: "Transvaginal - Varizes pélvicas",
    aliases: [
      "varizes pélvicas",
      "varizes pelvicas",
      "discretas varizes",
      "discretas varizes pélvicas",
      "discretas varizes pelvicas",
    ],
    replacement:
      "Observa-se em região anexial dilatação dos vasos para-uterinos com fluxo ao efeito Doppler, sugerindo varizes pélvicas ",
  },

  {
    id: "transvaginal-corpo-luteo",
    label: "Transvaginal - Corpo lúteo",
    aliases: [
      "corpo lúteo",
      "corpo luteo",
      "imagem sugestiva de corpo lúteo",
      "imagem sugestiva de corpo luteo",
    ],
    replacement:
      "Mista, observando-se imagem anecóica contendo finos ecos em seu interior e aspecto de corpo lúteo, medindo @ cm.",
  },

  {
    id: "transvaginal-histerectomia",
    label: "Transvaginal - Histerectomia",
    aliases: [
      "histerectomia",
      "ausência do útero",
      "ausencia do utero",
      "ausência ecográfica do útero",
      "ausencia ecografica do utero",
    ],
    replacement: "Útero: Ausência ecográfica.",
  },

  {
    id: "transvaginal-ovario-nao-visualizado",
    label: "Transvaginal - Ovário não visualizado",
    aliases: ["ovário não visualizado", "ovario nao visualizado"],
    replacement: "Ovário Direito: Não visualizado.",
  },

  // =========================================================
  // ABDOME TOTAL
  // =========================================================

  {
    id: "abdome-colecistectomia",
    label: "Abdome - Colecistectomia prévia",
    aliases: [
      "colecistectomia prévia",
      "colecistectomia previa",
      "ausência ecográfica da vesícula biliar",
      "ausencia ecografica da vesicula biliar",
      "sem vesícula",
      "sem vesicula",
    ],
    replacement: "Vesíocula:Ausência ecográfica da vesícula biliar.",
  },

  {
    id: "abdome-esteatose",
    label: "Abdome - Esteatose hepática",
    aliases: [
      "esteatose",
      "esteatose hepática",
      "esteatose hepatica",
      "gordura no fígado",
      "gordura no figado",
    ],
    replacement: "Textura:Hiperecogênica",
  },

  {
    id: "abdome-polipo-vesicula",
    label: "Abdome - Pólipo da vesícula biliar",
    aliases: [
      "pólipo na vesícula",
      "polipo na vesicula",
      "pólipo em vesícula biliar",
      "polipo em vesicula biliar",
    ],
    replacement:
      "Conteúdo: Anecóico, observando-se imagem sólida ecogênica, contornos regulares, sem artefato acústico posterior, medindo @@@ cm, compatível com pólipo.",
  },

  {
    id: "abdome-ateromatose-aorta",
    label: "Abdome - Ateromatose da aorta abdominal",
    aliases: [
      "ateromatose da aorta abdominal",
      "ateroma de aorta",
      "ateromatose da aorta",
    ],
    replacement:
      "Trajeto e calibre habituais, diâmetro @ cm, observando-se algumas placas de ateroma.",
  },

  {
    id: "abdome-hemangioma",
    label: "Abdome - Hemangioma hepático",
    aliases: [
      "hemangioma",
      "hemangioma no fígado",
      "hemangioma no figado",
      "imagem ecogênica no fígado",
      "imagem ecogenica no figado",
    ],
    replacement:
      "Descrição: Observa-se no lobo , imagem sólida ecogênica, contornos regulares, limites bem definidos, medindo @ cm, sugerindo hemangioma.",
  },

  {
    id: "abdome-hemangiomas-plural",
    label: "Abdome - Hemangiomas hepáticos",
    aliases: [
      "hemangiomas plural",
      "hemangioma no fígado plural",
      "hemangioma no figado plural",
      "imagens ecogênicas no fígado plural",
      "imagens ecogenicas no figado plural",
    ],
    replacement:
      "Descrição:  Observa-se imagens sólidas ecogênicas, contornos regulares, limites bem definidos, sugerindo hemangiomas, sendo:",
  },

  {
    id: "abdome-cisto-hepatico",
    label: "Abdome - Cisto hepático",
    aliases: [
      "cisto hepático",
      "cisto hepatico",
      "cisto no fígado",
      "cisto no figado",
    ],
    replacement:
      "Observa-se no lobo @, segmento @ imagem anecóica, contornos regulares, limites bem definidos, medindo @ cm.",
  },

  {
    id: "abdome-cistos-hepaticos",
    label: "Abdome - Cistos hepáticos",
    aliases: [
      "cistos hepático plural",
      "cistos hepatico plural",
      "cistos hepáticos",
      "cistos hepaticos",
      "cistos no fígado plural",
      "cistos no figado plural",
    ],
    replacement:
      "Observa-se imagens anecóicas, contornos regulares, limites bem definidos, sendo:",
  },

  {
    id: "abdome-angiomiolipoma",
    label: "Abdome - Angiomiolipoma renal",
    aliases: [
      "nódulo no rim",
      "nodulo no rim",
      "angiomiolipoma",
      "angiomiolipoma renal",
    ],
    replacement:
      "Observa-se imagem nodular sólida ecogênica, contornos regulares, limites bem definidos, sem artefato acústico posterior, medindo @ cm, podendo corresponder a angíomíolipoma.",
  },

  {
    id: "abdome-calculo-renal",
    label: "Abdome - Cálculo renal",
    aliases: [
      "cálculo no rim",
      "calculo no rim",
      "cálculo renal",
      "calculo renal",
    ],
    replacement:
      "Observa-se uma imagem solida hiperecogênica, contornos regulares, limites bem definidos, medindo cm.",
  },

  {
    id: "abdome-cisto-renal",
    label: "Abdome - Cisto renal",
    aliases: ["cisto no rim", "cisto renal"],
    replacement:
      "Observa-se uma imagem anecóica com contornos regulares, limites bem definidos, medindo @ cm.",
  },

  {
    id: "abdome-calculo-vesicula",
    label: "Abdome - Cálculo na vesícula",
    aliases: [
      "pedra na vesícula",
      "pedra na vesicula",
      "cálculo biliar",
      "calculo biliar",
      "cálculo na vesícula",
      "calculo na vesicula",
    ],
    replacement:
      "Conteúdo: Anecóico, observando-se imagem sólida hiperecogênica, contornos regulares limites bem definidos, sombra acústica posterior, medindo @@@ cm.",
  },

  {
    id: "abdome-pedra-rim",
    label: "Abdome - Pedra no rim",
    aliases: ["pedra no rim"],
    replacement:
      "Descrições: Observa-se no polo superior, uma imagem sólida ecogênica, contornos regulares, limites bem definidos, medindo  cm.",
  },
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fold = (value) =>
  value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
// Lista fechada: não atravessa palavras clínicas, barras, sinais matemáticos ou símbolos.
const separators = /[\s.,;:!?()[\]{}\-–—"'“”‘’]+/gu;
const separatorSource = separators.source;

export function normalizeForMatch(value = "") {
  return fold(value)
    .replace(separators, " ")
    .split(/\s+/u)
    .filter((word) => word && !/^(?:da|de|do|das|dos)$/u.test(word))
    .join(" ");
}

// Este regex é executado na CÓPIA sem acentos, nunca no texto que será devolvido.
// No máximo uma ligação entre termos. Todas as demais palavras precisam ser exatas.
export function aliasToFlexibleRegex(alias) {
  const normalized = normalizeForMatch(alias);
  if (!normalized) return null;
  const terms = normalized.split(" ");
  const gap = `${separatorSource}(?:(?:das|dos|da|de|do)${separatorSource})?`;
  const numericBoundary = /^\p{N}+$/u.test(terms.at(-1))
    ? "(?![.,]\\p{N})"
    : "";
  return new RegExp(
    `(?<![\\p{L}\\p{N}\\p{M}_])${terms.map(escapeRegex).join(gap)}(?![\\p{L}\\p{N}\\p{M}_])${numericBoundary}`,
    "gu",
  );
}

// Índices UTF-16 da cópia apontam para o trecho original, inclusive acentos decompostos.
function comparisonWithOffsets(text) {
  let comparison = "";
  const starts = [],
    ends = [];
  for (const part of text.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const normalized = fold(part[0]);
    comparison += normalized;
    for (let i = 0; i < normalized.length; i++) {
      starts.push(part.index);
      ends.push(part.index + part[0].length);
    }
  }
  return { comparison, starts, ends };
}

// A factory permite testar o mesmo motor com catálogos pequenos, sem alterar as regras reais.
export function createMedicalCommandProcessor(commands) {
  return function processMedicalCommands(text, details = {}, logger = console) {
    details.count = 0;
    details.commands = [];
    logger.info("[Eden Voice] Processando comandos médicos");
    const { comparison, starts, ends } = comparisonWithOffsets(text);
    const owners = new Map();
    const candidates = [];
    for (const command of commands) {
      for (const alias of command.aliases) {
        const key = normalizeForMatch(alias);
        if (!key) continue;
        const owner = owners.get(key);
        if (owner) {
          if (owner !== command) {
            (logger.warn || logger.info).call(
              logger,
              `[Eden Voice] WARN: Alias duplicado ${JSON.stringify(alias)} entre ${owner.id} e ${command.id}`,
            );
          }
          continue; // Inclusive colisões por acentos/pontuação/ligações: primeira regra vence.
        }
        owners.set(key, command);
        const regex = aliasToFlexibleRegex(alias);
        for (const match of comparison.matchAll(regex)) {
          const start = starts[match.index];
          const end = ends[match.index + match[0].length - 1];
          candidates.push({ start, end, command, alias });
        }
      }
    }
    // Esquerda para direita, maior trecho primeiro; empate mantém a ordem do catálogo.
    candidates.sort((a, b) => a.start - b.start || b.end - a.end);
    let cursor = 0;
    const pieces = [],
      applied = [];
    for (const { start, end, command, alias } of candidates) {
      if (start < cursor) continue;
      const detectedText = text.slice(start, end);
      pieces.push(text.slice(cursor, start), command.replacement);
      cursor = end;
      // Aproveita apenas o ponto imediatamente seguinte; não reescreve o replacement.
      if (text[cursor] === "." && command.replacement.endsWith(".")) cursor++;
      applied.push({
        id: command.id,
        label: command.label || command.id,
        alias,
        detectedText,
        replacement: command.replacement,
      });
      logger.info(`[Eden Voice] Comando detectado: ${command.id}`);
      logger.info(
        `[Eden Voice] Alias correspondente: ${JSON.stringify(alias)}`,
      );
      logger.info(
        `[Eden Voice] Texto reconhecido: ${JSON.stringify(detectedText)}`,
      );
    }
    pieces.push(text.slice(cursor));
    details.count = applied.length;
    details.commands = applied;
    logger.info(
      applied.length
        ? `[Eden Voice] Comandos aplicados: ${applied.length}`
        : "[Eden Voice] Nenhum comando médico detectado",
    );
    return pieces.join("");
  };
}

export const processMedicalCommands =
  createMedicalCommandProcessor(MEDICAL_COMMANDS);
