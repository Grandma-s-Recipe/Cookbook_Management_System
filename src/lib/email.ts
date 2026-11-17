// Sends verification and password-reset emails through Brevo's free plan
// (300 emails a day, no domain needed: only the sender address is verified). See decisions.md.
//
// Environment variables:
//   BREVO_API_KEY   from Brevo → Settings → SMTP & API → API keys
//   EMAIL_FROM      the sender address you verified in Brevo → Senders
//   EMAIL_FROM_NAME optional, defaults to "Forkful"
//
// Local development: if BREVO_API_KEY is not set, emails are printed to the terminal
// instead of sent, so you can click the link without a real inbox.

export type Email = { to: string; subject: string; text: string; html: string }

export async function sendEmail(email: Email): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY
  const from = process.env.EMAIL_FROM

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Email is not configured: BREVO_API_KEY and EMAIL_FROM must be set.')
    }
    console.log(
      `\n----- EMAIL (not sent: BREVO_API_KEY or EMAIL_FROM missing) -----\n` +
        `To: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n` +
        `-----------------------------------------------------------------\n`,
    )
    return
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: from, name: process.env.EMAIL_FROM_NAME || 'Forkful' },
      to: [{ email: email.to }],
      subject: email.subject,
      textContent: email.text,
      htmlContent: email.html,
    }),
  })

  if (!res.ok) {
    // Log the provider's reason for us, but never the email body (it contains a login link).
    const reason = await res.text().catch(() => '')
    throw new Error(`Brevo rejected the email (HTTP ${res.status}): ${reason.slice(0, 300)}`)
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A plain email with one button. Text and HTML versions say the same thing. */
export function linkEmail(opts: {
  to: string
  subject: string
  intro: string
  buttonText: string
  url: string
  outro: string
}): Email {
  const text = `${opts.intro}\n\n${opts.buttonText}: ${opts.url}\n\n${opts.outro}\n\n— Forkful`
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#222">
<p>${escapeHtml(opts.intro)}</p>
<p><a href="${escapeHtml(opts.url)}" style="display:inline-block;padding:10px 18px;background:#b4532a;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(opts.buttonText)}</a></p>
<p style="font-size:14px;color:#555">If the button doesn’t work, copy this link into your browser:<br>${escapeHtml(opts.url)}</p>
<p style="font-size:14px;color:#555">${escapeHtml(opts.outro)}</p>
<p>— Forkful</p></body></html>`
  return { to: opts.to, subject: opts.subject, text, html }
}
