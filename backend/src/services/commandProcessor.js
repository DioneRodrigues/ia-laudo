import {
  resolveExamContext,
  resolveExamMetadata,
} from "../config/examCatalog.js";

export const MEDICAL_COMMANDS = [
  // =========================================================
  // TIREOIDE
  // =========================================================
  {
    id: "tireoide-nodulo-padrao",
    exams: ["tireoide"],
    label: "Tireoide - Nódulo sólido padrão",
    aliases: [
      "nódulo texto padrão",
      "nódulo texto padrão tireoide",
      "nódulo sólido tireoide",
      "imagem nodular sólida tireoide",
      "nodulo texto padrao",
      "nodulo texto padrao tireoide",
      "nodulo solido tireoide",
      "nodulo hipoecoico",
      "nodulo hipoicoico",
    ],
    replacement:
      "Observa-se no @, uma imagem nodular sólida hipoecogênica, textura heterogênea, contendo fino halo anecóico periférico, contornos regulares, limites bem definidos, discreto reforço acústico posterior,",
  },
  {
    id: "tireoide-lesao-solido-cistica",
    exams: ["tireoide"],
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
    exams: ["tireoide"],
    label: "Tireoide - Nódulo espongiforme",
    aliases: [
      "nódulo espongiforme",
      "nodulo espongiforme",
      "imagem com aspecto espongiforme",
      "espongiforme",
    ],
    replacement:
      "Observa-se no @, uma imagem nodular sólida hipoecogênica, aspecto espongiforme, textura heterogênea , contendo fino halo anecóico periférico, contornos regulares, limites bem definidos, discreto reforço acústico posterior, ",
  },
  {
    id: "tireoide-cistos-plural",
    exams: ["tireoide"],
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
    exams: ["tireoide"],
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
    exams: ["tireoide"],
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
    id: "chammas-1",
    exams: ["tireoide"],
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
  {
    id: "chammas-2",
    exams: ["tireoide"],
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
    id: "chammas-3",
    exams: ["tireoide"],
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
    id: "chammas-4",
    exams: ["tireoide"],
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
    id: "chammas-5",
    exams: ["tireoide"],
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
  // MAMA — FRASES DRA. FERNANDA
  // =========================================================
  {
    id: "mama-nodulo-solido",
    exams: ["mama"],
    label: "Mama - Nódulo sólido",
    aliases: ["nódulo sólido", "nodulo solido", "nódulo mama", "nodulo mama"],
    replacement:
      "Tecido glandular: Textura Heterogênea\nNódulo (s): Presença de imagem ovalada, hipoecogênica, circunscrita, homogênea, orientação paralela à pele, sem fenômenos acústicos posteriores, localizada:\n- @, às @ horas, distando @ cm do mamilo, medindo @ cm.",
  },
  {
    id: "mama-cisto-simples",
    exams: ["mama"],
    label: "Mama - Cisto simples",
    aliases: [
      "cisto simples",
      "cisto mama",
      "imagem cística mama",
      "imagem cistica mama",
    ],
    replacement:
      "Tecido glandular: Textura Heterogênea\nCisto (s): Presença de imagens anecóicas, contornos regulares de limites bem definidos, sugestivas de cistos simples, assim localizadas:",
  },
  {
    id: "mama-linfonodo-intramamario",
    exams: ["mama"],
    label: "Mama - Linfonodo intramamário",
    aliases: [
      "linfonodo intramamário",
      "linfonodo intramamario",
      "linfonodo intra-mamário",
      "linfonodo intra mamário",
      "linfonodo mama",
    ],
    replacement:
      "Linfonodo intramamário (s): Nota-se no QSL, imagem nodular, hipoecóica, com o centro ecogênico, contornos regulares e limites precisos, medindo @@@ cm, sugestiva de linfonodo intramamário.",
  },
  {
    id: "mama-ectasia-ductal",
    exams: ["mama"],
    label: "Mama - Ectasia ductal",
    aliases: ["ectasia ductal", "ducto dilatado", "ectasia ductal bilateral"],
    replacement:
      "Descrições Anexas:\nPresença de imagem anecóica, retroareolar bilateral, sugestiva de ectasia ductal.\n\nHipótese diagnóstica:\n- Ectasia ductal retroareolar bilateral.\n- Achados ultrassonográficos benignos. (BI-RADS 2).\n\nSugere- se controle ultrassonográfico anual ou bianual, a critério clínico.",
  },
  {
    id: "mama-esteatonecrose",
    exams: ["mama"],
    label: "Mama - Esteatonecrose",
    aliases: ["esteatonecrose"],
    replacement:
      "Esteatonecrose (s): - Presença de imagem heterogênea, com distorção arquitetural, com sombra acústica posterior em leito de cirurgia prévia, localizada no QSE às 2 horas, distando 5,0 cm do mamilo, medindo @@@ cm.",
  },
  {
    id: "mama-siliconoma",
    exams: ["mama"],
    label: "Mama - Siliconoma",
    aliases: ["siliconoma"],
    replacement:
      "- Imagem hiperecóica, contornos bem definidos, sem fenômeno acústico posterior, podendo corresponder a siliconoma.",
  },
  {
    id: "mama-aglomerado-cistico",
    exams: ["mama"],
    label: "Mama - Aglomerado Cístico",
    aliases: [
      "aglomerado cístico",
      "aglomerado cistico",
      "aglomerado de microcistos",
    ],
    replacement:
      "Cisto (s): Presença de aglomerado de microcístos de conteúdo anecóico, contornos regulares, localizado em:\n- @, medindo @ cm.",
  },
  {
    id: "mama-nodulo-irregular",
    exams: ["mama"],
    label: "Mama - Nódulo irregular",
    aliases: [
      "nódulo irregular",
      "nodulo irregular",
      "nódulo suspeito",
      "nodulo suspeito",
    ],
    replacement:
      "Tecido glandular: Textura Heterogênea\nNódulo (s): Presença de imagem hipoecogênica, contornos irregulares, limites bem definidos, com sombra acústica posterior, assim localizada:\n- @@@, às @@@ horas, distando @@@ cm do mamilo, medindo @@@ cm.",
  },
  {
    id: "mama-nodulo-solido-cistico",
    exams: ["mama"],
    label: "Mama - Nódulo sólido-cístico",
    aliases: [
      "nódulo sólido-cístico",
      "nódulo sólido cístico",
      "nodulo solido-cistico",
      "nodulo solido cistico",
    ],
    replacement:
      "Tecido glandular: Textura Heterogênea\nNódulo (s): Presença de imagem sólida cística ovalada, circunscrita, heterogênea, orientação paralela à pele, sem fenômenos acústicos posteriores, localizada:\n- @@@, às @@@ horas, distando @@@ cm do mamilo, medindo @@@ cm.",
  },
  {
    id: "mama-lesao-nao-nodular",
    exams: ["mama"],
    label: "Mama - Lesão não nodular",
    aliases: ["lesão não nodular", "lesao nao nodular"],
    replacement:
      "Tecido glandular: Textura Heterogênea\nNódulo (s): Presença de imagem não nodular, hipoecogênica, não circunscrita, heterogênea, orientação paralela à pele, sem fenômenos acústicos posteriores, localizada:\n- @@@, às @@@ horas, distando @@@ cm do mamilo, medindo @@@ cm.",
  },
  {
    id: "mama-birads-1",
    exams: ["mama"],
    label: "Mama - BI-RADS 1",
    aliases: ["birads 1", "bi-rads 1", "bi rads 1", "birads um"],
    replacement:
      "- Achados ultrassonográficos negativos. (BI-RADS 1).\n\nSugere- se controle ultrassonográfico anual ou bianual, a critério clínico.",
  },
  {
    id: "mama-birads-2",
    exams: ["mama"],
    label: "Mama - BI-RADS 2",
    aliases: ["birads 2", "bi-rads 2", "bi rads 2", "birads dois"],
    replacement:
      "- Achados ultrassonográficos benignos. (BI-RADS 2).\n\nSugere- se controle ultrassonográfico anual ou bianual, a critério clínico.",
  },
  {
    id: "mama-birads-3",
    exams: ["mama"],
    label: "Mama - BI-RADS 3",
    aliases: [
      "birads 3",
      "bi-rads 3",
      "bi rads 3",
      "birads três",
      "birads tres",
    ],
    replacement:
      "- Achados ultrassonográficos provavelmente benignos. (BI-RADS 3).\n\nSugere- se controle ultrassonográfico semestral, a critério clínico.",
  },
  {
    id: "mama-birads-4a",
    exams: ["mama"],
    label: "Mama - BI-RADS US 4-A",
    aliases: ["birads 4 a", "birads 4a", "bi-rads 4-a", "bi rads 4 a"],
    replacement:
      "- BI-RADS US 4-A.\nObs.: Recomenda-se à critério clínico prosseguir investigação histológica do nódulo da mama direita.",
  },

  // Regras adicionais de mama já existentes e sem colisão com as frases da Dra. Fernanda.
  {
    id: "mama-cistos-simples-plural",
    exams: ["mama"],
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
    id: "mama-assimetria-focal",
    exams: ["mama"],
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
    exams: ["mama"],
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

  // =========================================================
  // TRANSVAGINAL
  // =========================================================
  {
    id: "transvaginal-mioma",
    exams: ["transvaginal"],
    label: "Transvaginal - Mioma",
    aliases: ["mioma", "mioma uterino"],
    replacement:
      "Miométrio: Heterogêneo pela presença de nódulos miomatosos, sendo:\n- Intramural, localizado na parede corporal @, medindo @ cm, FIGO",
  },
  {
    id: "transvaginal-corpo-luteo",
    exams: ["transvaginal"],
    label: "Transvaginal - Corpo lúteo",
    aliases: [
      "corpo lúteo",
      "corpo luteo",
      "imagem sugestiva de corpo lúteo",
      "imagem sugestiva de corpo luteo",
    ],
    replacement:
      "Textura: Mista, imagem arredondada, heterogênea com fluxo de vascularização periférica, medindo @ cm, podendo corresponder á corpo lúteo.",
  },
  {
    id: "transvaginal-polipo-endometrial-endocervical",
    exams: ["transvaginal"],
    label: "Transvaginal - Pólipo endometrial / endocervical",
    aliases: [
      "pólipo endometrial",
      "polipo endometrial",
      "pólipo endocervical",
      "polipo endocervical",
      "pólipo endometrial pólipo endocervical",
      "polipo endometrial polipo endocervical",
    ],
    replacement:
      "Colo Uterino: Cavidade endocervical ocupada por imagem hiperecogênica, arredondada, medindo @ cm, podendo corresponder a pólipo endocervical.\n\nEndométrio: Regular, com @97@ mm de espessura. Cavidade endometrial ocupada por imagem hiperecogênica, arredondada, medindo @@@ cm, podendo corresponder a pólipo endometrial.",
  },
  {
    id: "transvaginal-foliculo",
    exams: ["transvaginal"],
    label: "Transvaginal - Folículo",
    aliases: [
      "folículo",
      "foliculo",
      "imagem com aspecto folicular",
      "folículo ovariano",
      "foliculo ovariano",
    ],
    replacement:
      "Textura: Mista, apresentando em seu interior imagem anecóide, compatível com folículo, medindo @@@ cm.",
  },
  {
    id: "transvaginal-cisto-unilocular",
    exams: ["transvaginal"],
    label: "Transvaginal - Cisto unilocular",
    aliases: ["cisto unilocular"],
    replacement:
      "Textura: Mista, presença de imagem cística unilocular de conteúdo anecóide em seu interior, medindo @ cm.",
  },
  {
    id: "transvaginal-adenomiose",
    exams: ["transvaginal"],
    label: "Transvaginal - Adenomiose",
    aliases: ["adenomiose"],
    replacement:
      "Miométrio: Heterogêneo difusamente, com ilhas e estrias hiperecogênicas, achados sugestivos de adenomiose.",
  },
  {
    id: "transvaginal-diu",
    exams: ["transvaginal"],
    label: "Transvaginal - DIU",
    aliases: [
      "diu",
      "diu bem posicionado",
      "diu em posição normal",
      "diu em posicao normal",
    ],
    replacement:
      "- Presença de DIU bem posicionado, distando @ cm da serosa fúndica e acima do orifício interno do colo. ",
  },
  {
    id: "transvaginal-hidrossalpinge",
    exams: ["transvaginal"],
    label: "Transvaginal - Hidrossalpinge",
    aliases: ["hidrossalpinge"],
    replacement:
      "Descrições Anexas:\n- Em topografia anexial direita, observa-se imagem cística, anecóica e alongada, medindo 2,3 x 1,4 cm, podendo corresponder a hidrossalpinge",
  },
  {
    id: "transvaginal-ovarios-nao-visualizados",
    exams: ["transvaginal"],
    label: "Transvaginal - Ovários não visualizados",
    aliases: ["ovários não visualizados", "ovarios nao visualizados"],
    replacement:
      "Ovário direito: Não visualizado\n \n \nOvário esquerdo: Não visualizado",
  },
  {
    id: "transvaginal-cisto-hemorragico",
    exams: ["transvaginal"],
    label: "Transvaginal - Cisto hemorrágico",
    aliases: ["cisto hemorrágico", "cisto hemorragico", "cisto de sangue"],
    replacement:
      "Mista pela presença de imagem cística, contendo traves em seu interior, contornos regulares e limites precisos, sugestiva de cisto hemorrágico, medindo @@@ cm.",
  },
  {
    id: "transvaginal-endometrioma",
    exams: ["transvaginal"],
    label: "Transvaginal - Endometrioma",
    aliases: ["endometrioma"],
    replacement:
      "Textura: Mista, Cisto unilocular, conteúdo em vidro fosco, sem fluxo ao Doppler colorido, medindo @@@ cm.",
  },
  {
    id: "transvaginal-teratoma",
    exams: ["transvaginal"],
    label: "Transvaginal - Teratoma",
    aliases: ["teratoma", "cisto dermoide"],
    replacement:
      "Mista pela presença de imagem cística heterogênea contornos regulares, sem vascularização ao Doppler, sugestiva de cisto dermoide medindo @@@ cm",
  },
  {
    id: "transvaginal-ovarios-micropolicisticos",
    exams: ["transvaginal"],
    label: "Transvaginal - Ovários micropolicísticos",
    aliases: [
      "ovários micropolicísticos",
      "ovarios micropolicisticos",
      "aspecto micropolicístico",
      "aspecto micropolicistico",
    ],
    replacement:
      "Textura: Mista pela presença de múltiplos folículos na periferia.",
  },
  {
    id: "transvaginal-istmocele",
    exams: ["transvaginal"],
    label: "Transvaginal - Istmocele",
    aliases: [
      "istmocele",
      "deiscência de cicatriz de histerorrafia",
      "deiscencia de cicatriz de histerorrafia",
    ],
    replacement:
      "Miométrio de textura heterogênea em região segmentar anterior, onde se observa área anecóica, bem delimitada, medindo @@@cm; correspondendo a deiscência de cicatriz de histerorrafia e sua porção anterior dista @@@ cm da serosa uterina (hérnia de segmento).",
  },
  {
    id: "transvaginal-utero-bicorno",
    exams: ["transvaginal"],
    label: "Transvaginal - Útero bicorno",
    aliases: ["útero bicorno", "utero bicorno"],
    replacement:
      "Observa-se a nítida separação em duas cavidades endometriais que se duplica até o colo uterino. Sugere-se a hipótese diagnóstica de útero bicorno.",
  },

  // Regras transvaginais já existentes e ainda úteis.
  {
    id: "transvaginal-cisto-ovario",
    exams: ["transvaginal"],
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
    id: "transvaginal-liquido-cavidade",
    exams: ["transvaginal"],
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
    exams: ["transvaginal"],
    label: "Transvaginal - Cisto endocervical",
    aliases: ["cisto no colo", "cisto endocervical"],
    replacement:
      "Colo uterino: Observa-se em região cervical imagem anecóica  contornos regulares, medindo @ cm. Compatível com cisto endocervical.",
  },
  {
    id: "transvaginal-mucometrio",
    exams: ["transvaginal"],
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
    exams: ["transvaginal"],
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
    id: "transvaginal-histerectomia",
    exams: ["transvaginal"],
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

  // =========================================================
  // ABDOME
  // =========================================================
  {
    id: "abdome-colecistectomia",
    exams: ["abdome"],
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
    id: "abdome-polipo-vesicula",
    exams: ["abdome"],
    label: "Abdome - Pólipo na vesícula",
    aliases: [
      "pólipo na vesícula",
      "polipo na vesicula",
      "pólipo em vesícula biliar",
      "polipo em vesicula biliar",
    ],
    replacement:
      "Descrição: Formação polipóide ecogênica aderida as paredes internas da vesícula biliar, medindo @@@ cm.",
  },
  {
    id: "abdome-esteatose-leve",
    exams: ["abdome"],
    label: "Abdome - Esteatose leve",
    aliases: ["esteatose leve", "esteatose grau leve"],
    replacement:
      "Textura: A ecogenicidade está aumentada difusamente em grau leve",
  },
  {
    id: "abdome-esteatose-moderada",
    exams: ["abdome"],
    label: "Abdome - Esteatose moderada",
    aliases: [
      "esteatose moderada",
      "esteatose grau moderado",
      "esteatose grau moderada",
    ],
    replacement:
      "Textura: A ecogenicidade está aumentada difusamente em grau moderada",
  },
  {
    id: "abdome-esteatose-acentuada",
    exams: ["abdome"],
    label: "Abdome - Esteatose acentuada",
    aliases: [
      "esteatose acentuada",
      "esteatose grau acentuado",
      "esteatose grau acentuada",
    ],
    replacement:
      "Textura: A ecogenicidade está aumentada difusamente em grau acentuada",
  },
  {
    id: "abdome-cisto-hepatico",
    exams: ["abdome"],
    label: "Abdome - Cisto hepático",
    aliases: [
      "cisto hepático",
      "cisto hepatico",
      "cisto no fígado",
      "cisto no figado",
    ],
    replacement:
      "Presença de cisto simples de conteúdo anecóico e contornos regulares, medindo @@@ cm, localizado no segmento @@@.",
  },
  {
    id: "abdome-hemangioma",
    exams: ["abdome"],
    label: "Abdome - Hemangioma",
    aliases: ["hemangioma", "hemangioma no fígado", "hemangioma no figado"],
    replacement:
      "Presença de nódulo sólido hiperecóico, com contornos regulares, localizado no segmento @@@, do lobo hepático @@@, medindo @@@ cm.",
  },
  {
    id: "abdome-calculo-renal",
    exams: ["abdome"],
    label: "Abdome - Cálculo no rim",
    aliases: [
      "cálculo no rim",
      "calculo no rim",
      "cálculo renal",
      "calculo renal",
    ],
    replacement:
      "Descricões: Presença de cálculo ecogênico, com sombra acústica posterior, medindo @@@ cm, localizado no grupo calicinal @@@. ",
  },
  {
    id: "abdome-cisto-renal",
    exams: ["abdome"],
    label: "Abdome - Cisto renal",
    aliases: ["cisto no rim", "cisto renal"],
    replacement:
      "Cisto simples de conteúdo anécoico e margens regulares, localizado no @@@, medindo @@@ cm",
  },
  {
    id: "abdome-angiomiolipoma",
    exams: ["abdome"],
    label: "Abdome - Angiomiolipoma",
    aliases: [
      "angiomiolipoma",
      "angiomiolipoma renal",
      "nódulo no rim",
      "nodulo no rim",
    ],
    replacement:
      "Formação hiperecóica em projeção cortical, sem sombra acústica posterior, medindo @@@ cm, sugestivo de angiomiolipoma.",
  },
  {
    id: "abdome-calculo-vesicula",
    exams: ["abdome"],
    label: "Abdome - Cálculo na vesícula",
    aliases: [
      "cálculo na vesícula",
      "calculo na vesicula",
      "pedra na vesícula",
      "pedra na vesicula",
      "cálculo biliar",
      "calculo biliar",
    ],
    replacement:
      "Presença de imagem ecogênica com sombra acústica posterior, sugestiva de cálculo, medindo 0,5 cm.",
  },

  // Regras adicionais de abdome já existentes.
  {
    id: "abdome-ateromatose-aorta",
    exams: ["abdome"],
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
    id: "abdome-hemangiomas-plural",
    exams: ["abdome"],
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
    id: "abdome-cistos-hepaticos",
    exams: ["abdome"],
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
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const fold = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

const separators = /[\s.,;:!?()[\]{}\-–—"'“”‘’]+/gu;
const separatorSource = separators.source;

export function normalizeForMatch(value = "") {
  return fold(value)
    .replace(separators, " ")
    .split(/\s+/u)
    .filter((word) => word && !/^(?:da|de|do|das|dos)$/u.test(word))
    .join(" ");
}

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

function comparisonWithOffsets(text) {
  let comparison = "";
  const starts = [];
  const ends = [];

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

export function createMedicalCommandProcessor(commands) {
  return function processMedicalCommands(
    text,
    details = {},
    logger = console,
    context = {},
  ) {
    details.count = 0;
    details.commands = [];

    const examContext = resolveExamContext(context.examName);
    details.exam = resolveExamMetadata(context.examName);
    details.examResolution = { source: "automatic" };

    const allowedCommands = commands.filter(
      (command) =>
        command.exams?.includes("global") ||
        (examContext.id !== null && command.exams?.includes(examContext.id)),
    );

    logger.info(
      `[Eden Voice] Exame no Eden: ${JSON.stringify(examContext.originalName)}`,
    );

    if (examContext.id) {
      logger.info(`[Eden Voice] Contexto identificado: ${examContext.id}`);
    } else {
      (logger.warn || logger.info).call(
        logger,
        `[Eden Voice] WARN: Exame não reconhecido: ${JSON.stringify(examContext.originalName)}`,
      );
      (logger.warn || logger.info).call(
        logger,
        "[Eden Voice] Comandos específicos desabilitados por segurança",
      );
    }

    logger.info(
      `[Eden Voice] Comandos disponíveis para o exame: ${allowedCommands.length}`,
    );
    logger.info("[Eden Voice] Processando comandos médicos");

    const { comparison, starts, ends } = comparisonWithOffsets(text);
    const owners = new Map();
    const candidates = [];

    for (const command of allowedCommands) {
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
          continue;
        }

        owners.set(key, command);
        const regex = aliasToFlexibleRegex(alias);
        if (!regex) continue;

        for (const match of comparison.matchAll(regex)) {
          const start = starts[match.index];
          const end = ends[match.index + match[0].length - 1];

          if (Number.isInteger(start) && Number.isInteger(end)) {
            candidates.push({ start, end, command, alias });
          }
        }
      }
    }

    // Esquerda para direita; em empate, o maior trecho vence.
    candidates.sort((a, b) => a.start - b.start || b.end - a.end);

    let cursor = 0;
    const pieces = [];
    const applied = [];

    for (const { start, end, command, alias } of candidates) {
      if (start < cursor) continue;

      const detectedText = text.slice(start, end);
      pieces.push(text.slice(cursor, start), command.replacement);
      cursor = end;

      if (text[cursor] === "." && command.replacement.endsWith(".")) {
        cursor++;
      }

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

export function getMedicalCommandCatalog() {
  return structuredClone(MEDICAL_COMMANDS).map((command) => ({
    ...command,
    category: command.label.split(" - ")[0],
  }));
}
