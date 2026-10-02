const MEDICAL_COMMANDS = [
  {
    id: "chammas-1",
    aliases: [
      "chammas 1",
      "chamas 1",
      "chammas um",
      "chamas um",
      "chammas i",
    ],
    replacement: "sem vascularização (Chammas I).",
  },
  {
    id: "chammas-2",
    aliases: [
      "chammas 2",
      "chamas 2",
      "chammas dois",
      "chamas dois",
      "chammas ii",
    ],
    replacement: "nódulo apenas com vascularização periférica (Chammas II).",
  },
  {
    id: "chammas-3",
    aliases: [
      "chammas 3",
      "chamas 3",
      "chammas três",
      "chamas três",
      "chammas tres",
      "chamas tres",
      "chammas iii",
    ],
    replacement:
      "nódulo com vascularização periférica e central. Periférica maior ou igual a central (Chammas III).",
  },
  {
    id: "chammas-4",
    aliases: [
      "chammas 4",
      "chamas 4",
      "chammas quatro",
      "chamas quatro",
      "chammas iv",
    ],
    replacement:
      "nódulo com vascularização central e periférica. Predomínio da central (Chammas IV).",
  },
  {
    id: "chammas-5",
    aliases: [
      "chammas 5",
      "chamas 5",
      "chammas cinco",
      "chamas cinco",
      "chammas v",
    ],
    replacement: "nódulo apenas com vascularização central (Chammas V).",
  },
];
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Retorna texto; o objeto opcional recebe a contagem para a interface.
export function processMedicalCommands(
  text,
  details = {},
  logger = console,
) {
  logger.info("[Eden Voice] Processando comandos médicos");
  const aliases = new Map();
  for (const command of MEDICAL_COMMANDS) {
    for (const alias of command.aliases)
      aliases.set(alias.toLowerCase(), command);
  }
  const alternatives = [...aliases.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);
  // Limites Unicode impedem matches dentro de palavras, números ou identificadores.
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}\\p{M}_])(${alternatives.join("|")})(?![\\p{L}\\p{N}\\p{M}_])(\\.)?`,
    "giu",
  );
  let count = 0;
  // Uma única passagem: frases inseridas não são processadas novamente.
  const processedText = text.replace(pattern, (match, alias, period) => {
    const command = aliases.get(alias.toLowerCase());
    count++;
    logger.info(`[Eden Voice] Comando detectado: ${command.id}`);
    logger.info(`[Eden Voice] Alias detectado: "${alias}"`);
    return (
      command.replacement +
      (period && !command.replacement.endsWith(".") ? period : "")
    );
  });
  details.count = count;
  logger.info(
    count
      ? `[Eden Voice] Comandos aplicados: ${count}`
      : "[Eden Voice] Nenhum comando médico detectado",
  );
  return processedText;
}
