// Catálogo determinístico: aliases são frases inteiras, nunca aproximações fuzzy.
export const EXAM_CATALOG = [
  {
    id: "mama",
    label: "Mama",
    aliases: [
      "ultrassonografia de mama",
      "ultrassonografia das mamas",
      "ultrassonografia mamária",
      "ultrassonografia mamaria",
      "ultrassom de mama",
      "ultrassom das mamas",
      "ultrassom mamário",
      "ultrassom mamario",
      "ecografia mamária",
      "ecografia mamaria",
      "us de mama",
      "us das mamas",
      "us mama",
      "us mamas",
      "usg de mama",
      "usg das mamas",
      "usg mama",
      "usg mamas",
      "usg mamária",
      "usg mamaria",
      "mama bilateral",
      "mamas bilateral",
      "mamas",
      "mama",
      "mamaria",
      "mamária",
    ],
  },
  {
    id: "tireoide",
    label: "Tireoide",
    aliases: [
      "ultrassonografia da tireoide com doppler",
      "ultrassonografia da tireóide com doppler",
      "ultrassonografia de tireoide com doppler",
      "ultrassonografia de tireóide com doppler",
      "ultrassonografia da tireoide",
      "ultrassonografia da tireóide",
      "ultrassonografia de tireoide",
      "ultrassonografia de tireóide",
      "ultrassonografia tireoide",
      "ultrassonografia tireóide",
      "ultrassom da tireoide",
      "ultrassom da tireóide",
      "ultrassom de tireoide",
      "ultrassom de tireóide",
      "ultrassom tireoide",
      "ultrassom tireóide",
      "ecografia da tireoide",
      "ecografia da tireóide",
      "ecografia de tireoide",
      "ecografia de tireóide",
      "us tireoide",
      "us tireóide",
      "usg tireoide",
      "usg tireóide",
      "doppler de tireoide",
      "doppler de tireóide",
      "doppler da tireoide",
      "doppler da tireóide",
      "tireoide com doppler",
      "tireóide com doppler",
      "tireoide",
      "tireóide",
    ],
  },
  {
    id: "transvaginal",
    label: "Transvaginal",
    aliases: [
      "ultrassonografia pélvica transvaginal",
      "ultrassonografia pelvica transvaginal",
      "ultrassonografia transvaginal",
      "ultrassom pélvico transvaginal",
      "ultrassom pelvico transvaginal",
      "ultrassom transvaginal",
      "ecografia pélvica transvaginal",
      "ecografia pelvica transvaginal",
      "ecografia transvaginal",
      "us transvaginal",
      "usg transvaginal",
      "us pélvica transvaginal",
      "us pelvica transvaginal",
      "usg pélvica transvaginal",
      "usg pelvica transvaginal",
      "pelve transvaginal",
      "pélvica transvaginal",
      "pelvica transvaginal",
      "transvaginal",
    ],
  },
  {
    id: "abdome",
    label: "Abdome",
    aliases: [
      "ultrassonografia de abdome total",
      "ultrassonografia do abdome total",
      "ultrassonografia de abdômen total",
      "ultrassonografia do abdômen total",
      "ultrassonografia abdominal total",
      "ultrassonografia de abdome superior",
      "ultrassonografia do abdome superior",
      "ultrassom de abdome total",
      "ultrassom do abdome total",
      "ultrassom de abdômen total",
      "ultrassom do abdômen total",
      "ultrassom abdominal total",
      "ultrassom de abdome superior",
      "ultrassom do abdome superior",
      "ecografia de abdome total",
      "ecografia do abdome total",
      "ecografia abdominal",
      "us abdome total",
      "us abdomen total",
      "usg abdome total",
      "usg abdomen total",
      "us abdome",
      "us abdomen",
      "usg abdome",
      "usg abdomen",
      "abdome total",
      "abdômen total",
      "abdomen total",
      "abdome superior",
      "abdômen superior",
      "abdomen superior",
      "abdome",
      "abdômen",
      "abdomen",
    ],
  },
];

const normalize = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function resolveExamContext(examName) {
  const originalName = typeof examName === "string" ? examName : "";
  const unknown = {
    id: null,
    label: null,
    matchedAlias: null,
    originalName,
  };

  const name = normalize(originalName);
  if (!name) return unknown;

  const matches = EXAM_CATALOG.map((exam) => {
    const alias = exam.aliases
      .filter((candidate) =>
        new RegExp(
          `(?<![\\p{L}\\p{N}_])${escapeRegex(normalize(candidate))}(?![\\p{L}\\p{N}_])`,
          "u",
        ).test(name),
      )
      .sort((a, b) => normalize(b).length - normalize(a).length)[0];

    return alias
      ? {
          id: exam.id,
          label: exam.label,
          matchedAlias: alias,
          originalName,
        }
      : null;
  }).filter(Boolean);

  // Se o mesmo nome combinar com mais de uma especialidade, falha de forma segura.
  return matches.length === 1 ? matches[0] : unknown;
}

export function resolveExamMetadata(examName) {
  const context = resolveExamContext(examName);
  return {
    name: context.originalName,
    contextId: context.id,
    contextLabel: context.label,
    matchedAlias: context.matchedAlias,
    resolution: context.id ? "automatic" : "unresolved",
  };
}
