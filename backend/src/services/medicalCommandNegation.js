import { NEGATION_TERMS, NEGATION_WINDOW } from '../config/medicalCommandDetection.js';
import { normalizeClinical } from '../config/clinicalDictation.js';
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const terms = [...new Set(NEGATION_TERMS.map(normalizeClinical))].map(escapeRegex).join('|');
const negation = new RegExp(`\\b(?:${terms})\\b`, 'u');
export function isMedicalCommandNegated(text, start, end, command) {
  // Sentence/contrast boundaries end the scope; commas do not ("não, não tem...").
  const clause = normalizeClinical(text.slice(0, start)).split(/[.!?;\n]|\b(?:mas|porem|entretanto)\b/u).at(-1);
  const before = clause.slice(-NEGATION_WINDOW.maxCharacters).split(/\s+/u).slice(-NEGATION_WINDOW.maxWords).join(' ');
  // The exception permits negation INSIDE a reserved alias, never an external denial.
  return negation.test(before) || (!command.allowNegatedContext && negation.test(normalizeClinical(text.slice(start, end))));
}
