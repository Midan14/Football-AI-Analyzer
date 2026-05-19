/**
 * Email service — supports Resend (preferred), SendGrid, and SMTP via nodemailer.
 * Configure via environment variables:
 *
 *   RESEND_API_KEY        → uses Resend (https://resend.com)
 *   SENDGRID_API_KEY      → uses SendGrid
 *   SMTP_HOST + SMTP_USER + SMTP_PASS → uses nodemailer SMTP
 *
 * Falls back to console logging in development when no provider is configured.
 */

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

type SendResult = { ok: true } | { ok: false; error: string };

// ─── Resend ───────────────────────────────────────────────────────────────────

async function sendViaResend(payload: EmailPayload): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY!;
  const from = process.env.EMAIL_FROM ?? "Football AI <noreply@footballai.app>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Resend error ${res.status}: ${body}` };
  }
  return { ok: true };
}

// ─── SendGrid ─────────────────────────────────────────────────────────────────

async function sendViaSendGrid(payload: EmailPayload): Promise<SendResult> {
  const apiKey = process.env.SENDGRID_API_KEY!;
  const from = process.env.EMAIL_FROM ?? "noreply@footballai.app";

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: payload.to }] }],
      from: { email: from },
      subject: payload.subject,
      content: [
        { type: "text/html", value: payload.html },
        ...(payload.text ? [{ type: "text/plain", value: payload.text }] : []),
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `SendGrid error ${res.status}: ${body}` };
  }
  return { ok: true };
}

// ─── Dev fallback ─────────────────────────────────────────────────────────────

function logEmailToConsole(payload: EmailPayload): SendResult {
  console.info("─────────────────────────────────────────");
  console.info("[email] DEV MODE — email not sent");
  console.info(`  To:      ${payload.to}`);
  console.info(`  Subject: ${payload.subject}`);
  console.info(`  Body:    ${payload.text ?? "(html only)"}`);
  console.info("─────────────────────────────────────────");
  return { ok: true };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendEmail(payload: EmailPayload): Promise<SendResult> {
  try {
    if (process.env.RESEND_API_KEY) {
      return await sendViaResend(payload);
    }
    if (process.env.SENDGRID_API_KEY) {
      return await sendViaSendGrid(payload);
    }
    // No provider configured — log in dev, warn in prod
    if (process.env.NODE_ENV === "production") {
      console.error("[email] No email provider configured. Set RESEND_API_KEY or SENDGRID_API_KEY.");
      return { ok: false, error: "No email provider configured" };
    }
    return logEmailToConsole(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] Unexpected error:", message);
    return { ok: false, error: message };
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────

export function buildPasswordResetEmail(resetUrl: string): Pick<EmailPayload, "subject" | "html" | "text"> {
  const appName = "Football AI Analyzer";
  const expiryHours = 1;

  return {
    subject: `Restablecer contraseña — ${appName}`,
    text: `Hola,\n\nRecibimos una solicitud para restablecer tu contraseña en ${appName}.\n\nHaz clic en el siguiente enlace (válido por ${expiryHours} hora):\n${resetUrl}\n\nSi no solicitaste esto, ignora este correo.\n\n— El equipo de ${appName}`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Restablecer contraseña</title>
</head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:12px;overflow:hidden;border:1px solid #2a2a2a;">
          <!-- Header -->
          <tr>
            <td style="background:#16a34a;padding:28px 32px;text-align:center;">
              <span style="font-size:28px;">⚽</span>
              <h1 style="margin:8px 0 0;color:#fff;font-size:20px;font-weight:700;">${appName}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;">
              <h2 style="margin:0 0 16px;color:#f4f4f5;font-size:18px;">Restablecer contraseña</h2>
              <p style="margin:0 0 24px;color:#a1a1aa;font-size:15px;line-height:1.6;">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta.
                El enlace es válido por <strong style="color:#f4f4f5;">${expiryHours} hora</strong>.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#16a34a;border-radius:8px;">
                    <a href="${resetUrl}"
                       style="display:inline-block;padding:14px 28px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
                      Restablecer contraseña
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;color:#71717a;font-size:13px;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:
              </p>
              <p style="margin:0;word-break:break-all;">
                <a href="${resetUrl}" style="color:#4ade80;font-size:13px;">${resetUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #2a2a2a;">
              <p style="margin:0;color:#52525b;font-size:12px;text-align:center;">
                Si no solicitaste este cambio, ignora este correo. Tu contraseña no será modificada.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}

export function buildWelcomeEmail(name: string): Pick<EmailPayload, "subject" | "html" | "text"> {
  const appName = "Football AI Analyzer";
  return {
    subject: `Bienvenido a ${appName}`,
    text: `Hola ${name},\n\nTu cuenta en ${appName} ha sido creada exitosamente.\n\nEmpieza analizando partidos en: ${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}\n\n— El equipo de ${appName}`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8" /><title>Bienvenido</title></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:12px;border:1px solid #2a2a2a;">
        <tr>
          <td style="background:#16a34a;padding:28px 32px;text-align:center;">
            <span style="font-size:28px;">⚽</span>
            <h1 style="margin:8px 0 0;color:#fff;font-size:20px;">${appName}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px;">
            <h2 style="margin:0 0 16px;color:#f4f4f5;">¡Bienvenido, ${name}!</h2>
            <p style="margin:0 0 24px;color:#a1a1aa;font-size:15px;line-height:1.6;">
              Tu cuenta ha sido creada. Ahora puedes analizar partidos con IA, gestionar predicciones y recibir alertas de valor.
            </p>
            <a href="${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}"
               style="display:inline-block;padding:14px 28px;background:#16a34a;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">
              Ir al dashboard
            </a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
