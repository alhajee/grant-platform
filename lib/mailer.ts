/**
 * Outgoing email. SMTP is configured through the environment (Dokploy) and nothing else needs to change:
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE ("true" for port 465), SMTP_USER, SMTP_PASSWORD, SMTP_FROM.
 * Until SMTP_HOST and SMTP_FROM are set, mail is not sent: the attempt is logged without its contents, and in
 * development the message is printed so links can be followed locally. Credentials are never logged.
 */
export type MailMessage = { to: string; subject: string; text: string; html?: string };
export type MailResult = { sent: true } | { sent: false; reason: 'not_configured' | 'failed' };

type SmtpConfig = { host: string; port: number; secure: boolean; user?: string; password?: string; from: string };

export function smtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim(), from = env.SMTP_FROM?.trim();
  if (!host || !from) return null;
  const port = Number(env.SMTP_PORT || 587);
  return { host, from, port: Number.isInteger(port) && port > 0 ? port : 587, secure: env.SMTP_SECURE === 'true' || port === 465, user: env.SMTP_USER?.trim() || undefined, password: env.SMTP_PASSWORD || undefined };
}

export const mailConfigured = () => smtpConfig() !== null;

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const config = smtpConfig();
  if (!config) {
    if (process.env.NODE_ENV === 'production') console.warn(`Email not sent (SMTP is not configured): "${message.subject}"`);
    else console.info(`[mail: SMTP not configured, printing instead]\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`);
    return { sent: false, reason: 'not_configured' };
  }
  try {
    // Loaded only when SMTP is configured.
    const { createTransport } = await import('nodemailer');
    const transport = createTransport({ host: config.host, port: config.port, secure: config.secure, auth: config.user ? { user: config.user, pass: config.password } : undefined });
    await transport.sendMail({ from: config.from, to: message.to, subject: message.subject, text: message.text, html: message.html });
    return { sent: true };
  } catch (cause) {
    console.error(`Email could not be sent: "${message.subject}"`, cause instanceof Error ? cause.message : cause);
    return { sent: false, reason: 'failed' };
  }
}
