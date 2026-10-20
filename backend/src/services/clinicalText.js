// Decimal dots remain inside a sentence; offsets always refer to the original transcript.
export const splitDictation = (text) => String(text).match(/(?:\d[.,]\d|[^.!?\n;])+(?:[.!?;]+|$)/gu)?.map((s) => s.trim()).filter(Boolean) || [];
export function stripTrailingFillers(text) {
  return String(text).replace(/(?:[,\s]+(?:tá|ta|né|ne|ok|certo)[\s,.!?]*)+$/iu, '').trim();
}
