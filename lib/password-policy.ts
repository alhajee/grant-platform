import { z } from 'zod';

export const minPasswordLength = 10;
export const maxPasswordLength = 128;

/** Passwords people choose themselves (reset link, change password): at least 10 characters with a letter and a number. */
export const newPasswordSchema = z.string()
  .min(minPasswordLength, `Use at least ${minPasswordLength} characters`)
  .max(maxPasswordLength, `Use at most ${maxPasswordLength} characters`)
  .refine(value => /[A-Za-z]/.test(value) && /\d/.test(value), 'Include at least one letter and one number');

/** The first problem with a new password, or null; the email is refused as a password. */
export function newPasswordProblem(password: string, email?: string): string | null {
  const parsed = newPasswordSchema.safeParse(password);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Choose a stronger password';
  if (email && password.trim().toLowerCase() === email.trim().toLowerCase()) return 'Do not use your email address as your password';
  return null;
}
