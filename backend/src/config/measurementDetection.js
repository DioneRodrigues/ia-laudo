export const MEASUREMENT_STRUCTURES = {
  tireoide: [
    { pattern: /\blobo direito\b/u, structure: 'lobo_direito_tireoide' },
    { pattern: /\blobo esquerdo\b/u, structure: 'lobo_esquerdo_tireoide' },
    { pattern: /\bistmo\b/u, structure: 'istmo_tireoide' },
  ],
  abdome: [
    { pattern: /\brim direito\b/u, structure: 'rim_direito' },
    { pattern: /\brim esquerdo\b/u, structure: 'rim_esquerdo' },
    { pattern: /\bcoledoco\b/u, structure: 'coledoco' },
    { pattern: /\bfigado\b/u, structure: 'figado' },
  ],
  transvaginal: [
    { pattern: /\bendometrio\b/u, structure: 'endometrio' },
    { pattern: /\butero\b/u, structure: 'utero' },
    { pattern: /\bovario direito\b/u, structure: 'ovario_direito' },
    { pattern: /\bovario esquerdo\b/u, structure: 'ovario_esquerdo' },
  ],
};
export const MEASUREMENT_SIGNALS = {
  clinical: /\b(dimensao|dimensoes|longitudinal|antero[ -]?posterior|transversal|transverso|mede|medindo)\b/u,
  axes: /\b(longitudinal|antero[ -]?posterior|ap|transversal|transverso)\b/gu,
  weights: { anatomy: 3, clinical: 2, numericPattern: 3 },
  reportThreshold: 5,
  // Review heuristic only; no physiological interpretation or value correction.
  unitlessThyroidReviewThreshold: 50,
};
