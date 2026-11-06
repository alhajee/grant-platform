/**
 * UBEC233: a line reference code as shown, without the quarters that codes made before migration 091 carried
 * ("UBEC/SUBEB/SPORT/066/2026 · Q1–Q4" reads "UBEC/SUBEB/SPORT/066/2026"; the Timeline shows the quarters).
 */
export const lineCodeLabel = (code: string | null | undefined) => (code ?? '').replace(/\s*·\s*Q.*$/, '');
