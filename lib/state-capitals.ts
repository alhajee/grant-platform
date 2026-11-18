// State capitals, for letters addressed to a SUBEB (UBEC268 approval letter: "State Universal Basic Education Board,
// Uyo, Akwa Ibom State.").
const capitals: Record<string, string> = {
  AB: 'Umuahia', AD: 'Yola', AK: 'Uyo', AN: 'Awka', BA: 'Bauchi', BE: 'Makurdi', BO: 'Maiduguri', BY: 'Yenagoa',
  CR: 'Calabar', DE: 'Asaba', EB: 'Abakaliki', ED: 'Benin City', EK: 'Ado-Ekiti', EN: 'Enugu', GO: 'Gombe', IM: 'Owerri',
  JI: 'Dutse', KD: 'Kaduna', KE: 'Birnin Kebbi', KN: 'Kano', KO: 'Lokoja', KT: 'Katsina', KW: 'Ilorin', LA: 'Ikeja',
  NA: 'Lafia', NI: 'Minna', OG: 'Abeokuta', ON: 'Akure', OS: 'Osogbo', OY: 'Ibadan', PL: 'Jos', RI: 'Port Harcourt',
  SO: 'Sokoto', TA: 'Jalingo', YO: 'Damaturu', ZA: 'Gusau', FC: 'Abuja',
};

export const stateCapital = (stateCode: string): string | null => capitals[stateCode.trim().toUpperCase().replace(/^NG-/, '')] ?? null;
