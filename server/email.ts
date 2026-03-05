import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export function getAppUrl(): string {
  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    const domain = replitDomains.split(",")[0].trim();
    return `https://${domain}`;
  }
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain) {
    return `https://${devDomain}`;
  }
  return `http://localhost:${process.env.PORT || 5000}`;
}

export async function sendVerificationEmail(
  to: string,
  token: string
): Promise<{ success: boolean; error?: string }> {
  const appUrl = getAppUrl();
  const verificationLink = `${appUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const fromAddress = process.env.EMAIL_FROM || "noreply@example.com";

  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to,
    subject: "Confirm your email — Watchloom",
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#1e3a5f;padding:32px 40px;text-align:center;">
              <span style="font-size:24px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">Watchloom</span>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#1a1a1a;line-height:1.3;">
                Confirm your email to access your workspace
              </h1>
              <p style="margin:0 0 32px;font-size:15px;color:#555555;line-height:1.6;">
                Thanks for signing up. Click the button below to verify your email address and get started with your personal intelligence workspace.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="background-color:#1e3a5f;border-radius:6px;">
                    <a href="${verificationLink}" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Confirm Email
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#888888;line-height:1.5;word-break:break-all;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${verificationLink}" style="color:#1e3a5f;">${verificationLink}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #eee;text-align:center;">
              <p style="margin:0;font-size:12px;color:#aaaaaa;">
                You received this email because you signed up for Watchloom.<br>
                If you didn't create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    text: `Watchloom\n\nConfirm your email to access your workspace\n\nThanks for signing up. Visit the link below to verify your email address:\n\n${verificationLink}\n\nIf you didn't create an account, you can safely ignore this email.`,
  });

  if (error) {
    console.error("Resend email error:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
