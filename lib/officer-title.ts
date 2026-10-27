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

/** The role name a new officer starts with: the next number in the department. */
export const suggestedRoleTitle = (number: number, department: string) => `UBEC Assessment Officer ${number} - ${department}`;
