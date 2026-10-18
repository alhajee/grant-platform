/**
 * The UBEC-branded email shell: logo header in the portal's green with a gold rule, a white card, one button and a
 * plain link under it, and a footer. Tables and inline styles only, so Gmail, Outlook and phone mail apps show it
 * the same way. The logo is the PNG at `${baseUrl}/email/ubec-logo.png` (email apps block SVG and data URIs).
 */
export type BrandedEmail = {
  baseUrl: string;
  /** Inbox preview line, hidden in the message itself. */
  preheader: string;
  heading: string;
  greeting: string;
  paragraphs: string[];
  button: { label: string; href: string };
  /** Smaller notes under the button (expiry, "ignore if this was not you"). */
  notes: string[];
};

const brand = { green: '#004540', deep: '#00302c', gold: '#f4c85f', ink: '#1f2a28', muted: '#5d6b68', line: '#e3e9e7', page: '#f2f5f3' };
const font = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function brandedEmailHtml(email: BrandedEmail) {
  const year = new Date().getFullYear(), href = escapeHtml(email.button.href);
  const paragraph = (text: string) => `<p style="margin:0 0 16px;font:15px/1.6 ${font};color:${brand.ink};">${escapeHtml(text)}</p>`;
  const note = (text: string) => `<p style="margin:0 0 8px;font:13px/1.55 ${font};color:${brand.muted};">${escapeHtml(text)}</p>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(email.heading)}</title></head>
<body style="margin:0;padding:0;background:${brand.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(email.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.page};"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="background:${brand.green};border-radius:16px 16px 0 0;padding:22px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:14px;vertical-align:middle;"><img src="${escapeHtml(email.baseUrl)}/email/ubec-logo.png" width="52" height="52" alt="UBEC" style="display:block;border:0;border-radius:50%;background:#ffffff;"></td>
        <td style="vertical-align:middle;">
          <div style="font:600 15px/1.3 ${font};color:#ffffff;">Universal Basic Education Commission</div>
          <div style="font:12px/1.4 ${font};color:#cfe1dd;">Basic Education Action Plan Management System (BEAPMS)</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="height:4px;background:${brand.gold};font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${brand.line};border-top:0;border-radius:0 0 16px 16px;padding:32px 28px 28px;">
      <h1 style="margin:0 0 20px;font:600 22px/1.3 ${font};color:${brand.deep};">${escapeHtml(email.heading)}</h1>
      ${paragraph(email.greeting)}
      ${email.paragraphs.map(paragraph).join('\n      ')}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:999px;background:${brand.green};">
        <a href="${href}" style="display:inline-block;padding:13px 28px;font:600 15px/1 ${font};color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(email.button.label)}</a>
      </td></tr></table>
      ${email.notes.map(note).join('\n      ')}
      <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid ${brand.line};font:12px/1.55 ${font};color:${brand.muted};">If the button does not work, copy this link into your browser:<br><a href="${href}" style="color:${brand.green};word-break:break-all;">${href}</a></p>
    </td></tr>
    <tr><td align="center" style="padding:20px 12px 0;font:12px/1.6 ${font};color:${brand.muted};">
      © ${year} Universal Basic Education Commission · Federal Republic of Nigeria<br>This is an automatic message from BEAPMS; replies are not read.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/** The plain-text part, for mail apps that do not show HTML. */
export function brandedEmailText(email: BrandedEmail) {
  return [email.greeting, ...email.paragraphs, `${email.button.label}: ${email.button.href}`, ...email.notes, '—', 'Universal Basic Education Commission · BEAPMS', 'This is an automatic message; replies are not read.'].join('\n\n');
}
