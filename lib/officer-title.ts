import { z } from 'zod';

// Assessment Officers (UBEC150): a role name ("UBEC Assessment Officer 1 - Infrastructure") beside the full name, shown
// as "UBEC Assessment Officer 1 - Infrastructure (Full Name)" (users.display_name, migration 077), and a UBEC email.

export const ubecEmailDomain = 'ubec.gov.ng';
export const isUbecEmail = (email: string) => email.trim().toLowerCase().endsWith(`@${ubecEmailDomain}`);
export const ubecEmailError = `Use a UBEC email address (@${ubecEmailDomain})`;
export const maxRoleTitleLength = 120;
export const roleTitleSchema = z.string().trim().min(2).max(maxRoleTitleLength);

/** "UBEC Assessment Officer 1 - Infrastructure (Amina Bello)"; just the name without a role name. */
export const officerLabel = (roleTitle: string | null | undefined, fullName: string) => roleTitle?.trim() ? `${roleTitle.trim()} (${fullName})` : fullName;

/**
 * UBEC237: role names are set automatically, "UBEC Assessment Officer N" (no component: the department says it). N is one
 * more than the highest number already used in the department, or than its number of officers when earlier role names
 * ("UBEC Assessment Officer – Debate") carry no number. Server: lib/officer-title-db.ts; the forms preview the same.
 */
export const officerRoleTitle = (number: number) => `UBEC Assessment Officer ${number}`;
const numberPattern = /^UBEC Assessment Officer\s+(\d+)\b/i;
export const officerNumber = (title: string | null | undefined) => Number(numberPattern.exec(title?.trim() ?? '')?.[1] ?? 0);
export const nextOfficerNumber = (titles: readonly (string | null | undefined)[]) => Math.max(titles.length, ...titles.map(officerNumber)) + 1;
/** The role name the next officer of a department gets, from that department's officers' role names. */
export const suggestedRoleTitle = (titles: readonly (string | null | undefined)[]) => officerRoleTitle(nextOfficerNumber(titles));
