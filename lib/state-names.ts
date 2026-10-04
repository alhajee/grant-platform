const stateNames: Record<string, string> = {
  AB: "Abia", AD: "Adamawa", AK: "Akwa Ibom", AN: "Anambra", BA: "Bauchi",
  BE: "Benue", BO: "Borno", BY: "Bayelsa", CR: "Cross River", DE: "Delta",
  EB: "Ebonyi", ED: "Edo", EK: "Ekiti", EN: "Enugu", GO: "Gombe",
  IM: "Imo", JI: "Jigawa", KD: "Kaduna", KE: "Kebbi", KN: "Kano",
  KO: "Kogi", KT: "Katsina", KW: "Kwara", LA: "Lagos", NA: "Nasarawa",
  NI: "Niger", OG: "Ogun", ON: "Ondo", OS: "Osun", OY: "Oyo",
  PL: "Plateau", RI: "Rivers", SO: "Sokoto", TA: "Taraba", YO: "Yobe", ZA: "Zamfara",
};

export function stateDisplayName(stateCode: string) {
  const code = stateCode.trim().toUpperCase().replace(/^NG-/, "");
  if (code === "FC" || code === "FCT") return "Federal Capital Territory";
  return stateNames[code] ? `${stateNames[code]} State` : stateCode;
}

export function subebDisplayName(stateCode: string) {
  const value = stateCode.trim();
  const code = value.toUpperCase().replace(/^NG-/, "");
  if (code === "FC" || code === "FCT" || code === "FEDERAL CAPITAL TERRITORY") return "FCT UBEB";
  return `${(stateNames[code] ?? value.replace(/\s+State$/i, '')).toUpperCase()} SUBEB`;
}

/** State codes whose display name contains the search text, e.g. "kano" -> ["KN"]. */
export function stateCodesMatching(search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return [];
  return [...Object.keys(stateNames), "FC"].filter(code => stateDisplayName(code).toLowerCase().includes(needle));
}

/** Every SUBEB/UBEB state code (36 states plus FCT as "FC"), as stored on users and schools. */
export const stateCodes: readonly string[] = [...Object.keys(stateNames), "FC"];
export const isStateCode = (value: unknown): value is string => typeof value === "string" && stateCodes.includes(value);
