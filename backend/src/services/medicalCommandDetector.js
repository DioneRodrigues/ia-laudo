import { MEDICAL_COMMANDS, findMedicalCommandCandidates } from './commandProcessor.js';
import { resolveExamContext } from '../config/examCatalog.js';
import { isMedicalCommandNegated } from './medicalCommandNegation.js';
export function detectMedicalCommands(text, context = {}) {
  // An actual exam name is authoritative, including when unresolved.
  const exam = context.examName != null ? resolveExamContext(context.examName).id
    : resolveExamContext(typeof context.examContext === 'string' ? context.examContext : context.examContext?.id).id;
  const allowed = MEDICAL_COMMANDS.filter((command) => command.exams?.includes('global') || (exam && command.exams?.includes(exam)));
  const commands = findMedicalCommandCandidates(text, allowed, { info() {}, warn() {} }).map(({ start, end, command, alias }) => ({
    id: command.id, label: command.label || command.id, alias, detectedText: text.slice(start, end), start, end,
    negated: isMedicalCommandNegated(text, start, end, command),
  }));
  return { count: commands.length, commands };
}
