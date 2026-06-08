import sgMail from "@sendgrid/mail";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

export interface TransactionalEmail {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  preheader?: string;
}

const brand = {
  oxblood: "#4b1217",
  maroon: "#6d1d25",
  forge: "#c86b2d",
  cream: "#fffaf0",
  bone: "#f6efe2",
  charcoal: "#211b18",
  muted: "#75655d"
};

export async function sendTransactionalEmail(email: TransactionalEmail) {
  const apiKey = env("SENDGRID_API_KEY");
  const sendingDomain = env("SENDING_DOMAIN", "partners.ironcrowncapital.com");
  const from = env("TRANSACTIONAL_FROM", `Iron Crown File Desk <desk@${sendingDomain}>`);
  const replyTo = env("REPLY_TO_EMAIL", `desk@${sendingDomain}`);
  const firstRecipient = Array.isArray(email.to) ? email.to[0] : email.to;
  const recipients = Array.isArray(email.to) ? email.to : [email.to];
  const deliverableRecipients = await filterSuppressed(recipients);

  if (!deliverableRecipients.length) {
    console.info("All recipients suppressed; email skipped.", { subject: email.subject });
    return { skipped: true, suppressed: true };
  }

  const unsubscribeUrl = env(
    "UNSUBSCRIBE_URL",
    `https://${sendingDomain}/.netlify/functions/unsubscribe?email=${encodeURIComponent(firstRecipient)}`
  );
  const listUnsubscribe = `<mailto:unsubscribe@${sendingDomain}>, <${unsubscribeUrl}>`;

  if (!apiKey) {
    console.info("SENDGRID_API_KEY missing; email logged only.", {
      to: deliverableRecipients,
      subject: email.subject
    });
    return { skipped: true };
  }

  sgMail.setApiKey(apiKey);
  await sgMail.send({
    to: deliverableRecipients,
    from,
    replyTo,
    subject: email.subject,
    text: email.text,
    html: renderTransactionalEmailHtml(email, unsubscribeUrl),
    headers: {
      "List-Unsubscribe": listUnsubscribe,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    },
    trackingSettings: {
      clickTracking: { enable: false, enableText: false },
      openTracking: { enable: false }
    }
  });

  return { skipped: false };
}

async function filterSuppressed(recipients: string[]) {
  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return recipients;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await supabase
    .from("suppression")
    .select("email")
    .in(
      "email",
      recipients.map((recipient) => recipient.toLowerCase())
    );

  if (error) {
    console.warn("Suppression check failed; proceeding with send.", error.message);
    return recipients;
  }

  const suppressed = new Set((data || []).map((row) => row.email.toLowerCase()));
  return recipients.filter((recipient) => !suppressed.has(recipient.toLowerCase()));
}

export function statusEmail(state: string, merchantName: string) {
  const readable = state.replace("_", " ");
  const statusCopy = statusCopyFor(state, merchantName);
  return {
    subject: `ICC File Desk: ${merchantName} is ${readable}`,
    preheader: statusCopy.preheader,
    text: `${merchantName} moved to ${readable}. ${statusCopy.text}`,
    html: `
      <h1>${escapeHtml(statusCopy.headline)}</h1>
      <p>${escapeHtml(statusCopy.text)}</p>
      <div class="status-card">
        <span>Status</span>
        <strong>${escapeHtml(readable)}</strong>
      </div>
    `
  };
}

export function isoReadyEmail(signingUrl: string): Omit<TransactionalEmail, "to"> {
  return {
    subject: "ICC Amazon File Desk: ISO agreement ready",
    preheader: "Your DocuSign signing session is ready inside the File Desk funnel.",
    text: `Your ICC Amazon File Desk ISO agreement is ready: ${signingUrl}`,
    html: `
      <h1>Your ISO agreement is ready.</h1>
      <p>The ICC Amazon File Desk created your DocuSign envelope. Open the embedded signing session and keep the certification path moving.</p>
      <p><a class="button" href="${escapeAttribute(signingUrl)}">Open DocuSign</a></p>
    `
  };
}

export function certifiedPartnerEmail(fullName: string, referralToken: string): Omit<TransactionalEmail, "to"> {
  return {
    subject: "ICC Certified Amazon Deal Partner",
    preheader: "Your credential is active and your referral token is ready.",
    text: `${fullName}, your ICC Certified Amazon Deal Partner credential is active. Referral token: ${referralToken}`,
    html: `
      <h1>Your ICC credential is active.</h1>
      <p>${escapeHtml(fullName)}, you are now an ICC Certified Amazon Deal Partner.</p>
      <div class="credential-badge">
        <span>ICC Certified</span>
        <strong>Amazon Deal Partner</strong>
        <code>${escapeHtml(referralToken)}</code>
      </div>
      <p>Use the File Desk for Amazon sellers, Relay carriers, and DSP operators where the Amazon inflow is the reason the file deserves a fast look.</p>
    `
  };
}

export function unsubscribeConfirmationEmail(): Omit<TransactionalEmail, "to"> {
  return {
    subject: "ICC File Desk: unsubscribe confirmed",
    preheader: "You have been removed from File Desk transactional updates.",
    text: "Your unsubscribe request has been recorded.",
    html: `
      <h1>Unsubscribe confirmed.</h1>
      <p>Your email has been added to the File Desk suppression list. You will not receive further File Desk status notices at this address unless an operator manually clears the suppression.</p>
    `
  };
}

export function renderTransactionalEmailHtml(email: Omit<TransactionalEmail, "to">, unsubscribeUrl: string) {
  return renderBrandedEmail({
    subject: email.subject,
    preheader: email.preheader || email.text,
    bodyHtml: email.html,
    unsubscribeUrl
  });
}

function statusCopyFor(state: string, merchantName: string) {
  switch (state) {
    case "received":
      return {
        headline: `${merchantName} is in the desk.`,
        preheader: "The file landed. The checker and VA queue can take it from here.",
        text: "The file landed. The checker and VA queue can take it from here."
      };
    case "va_check":
      return {
        headline: `${merchantName} is worth a human look.`,
        preheader: "The file is queued for VA review before it routes to underwriting.",
        text: "The file is queued for VA review before it routes to underwriting."
      };
    case "underwriting":
      return {
        headline: `${merchantName} moved to underwriting.`,
        preheader: "The submission package has been routed into Iron Crown's existing funding process.",
        text: "The submission package has been routed into Iron Crown's existing funding process."
      };
    case "funded":
      return {
        headline: `${merchantName} funded.`,
        preheader: "Commission accrual is now visible in the partner portal.",
        text: "Commission accrual is now visible in the partner portal."
      };
    default:
      return {
        headline: `${merchantName} moved forward.`,
        preheader: "The File Desk will keep sending updates as the file moves.",
        text: "The File Desk will keep sending updates as the file moves."
      };
  }
}

function renderBrandedEmail({
  subject,
  preheader,
  bodyHtml,
  unsubscribeUrl
}: {
  subject: string;
  preheader: string;
  bodyHtml: string;
  unsubscribeUrl: string;
}) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
    <style>
      @media (max-width: 620px) {
        .shell { width: 100% !important; }
        .pad { padding: 24px !important; }
        h1 { font-size: 34px !important; }
      }
      h1, h2 {
        font-family: "Cormorant Garamond", Georgia, serif;
        letter-spacing: 0;
      }
      p, a, span, strong, td {
        font-family: "DM Sans", Arial, sans-serif;
      }
      .status-card {
        background: ${brand.bone};
        border: 1px solid rgba(75,18,23,.16);
        border-radius: 8px;
        margin: 24px 0;
        padding: 16px;
      }
      .status-card span {
        color: ${brand.muted};
        display: block;
        font-size: 12px;
        text-transform: uppercase;
      }
      .status-card strong {
        color: ${brand.oxblood};
        display: block;
        font-size: 22px;
        margin-top: 4px;
        text-transform: capitalize;
      }
      .credential-badge {
        background: ${brand.oxblood};
        border-radius: 8px;
        color: ${brand.cream};
        margin: 24px 0;
        padding: 18px;
      }
      .credential-badge span {
        color: ${brand.forge};
        display: block;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .credential-badge strong {
        color: ${brand.cream};
        display: block;
        font-family: "Cormorant Garamond", Georgia, serif;
        font-size: 28px;
        line-height: 1.05;
        margin: 4px 0 10px;
      }
      .credential-badge code {
        color: rgba(255,250,240,.82);
        font-family: "DM Mono", ui-monospace, monospace;
      }
      .button {
        background: ${brand.oxblood};
        border-radius: 8px;
        color: ${brand.cream};
        display: inline-block;
        font-weight: 700;
        padding: 13px 18px;
        text-decoration: none;
      }
    </style>
  </head>
  <body style="margin:0;background:${brand.bone};color:${brand.charcoal};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader).slice(0, 180)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${brand.bone};padding:28px 12px;">
      <tr>
        <td align="center">
          <table class="shell" role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:${brand.cream};border:1px solid rgba(75,18,23,.16);border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:${brand.oxblood};padding:22px 28px;color:${brand.cream};">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="width:48px;">
                      <div style="border:1px solid rgba(255,250,240,.35);border-radius:8px;height:38px;line-height:38px;text-align:center;color:${brand.forge};font-size:20px;">♕</div>
                    </td>
                    <td>
                      <div style="font-size:16px;font-weight:700;">Iron Crown Capital</div>
                      <div style="color:rgba(255,250,240,.72);font-size:13px;">Amazon File Desk</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="pad" style="padding:34px 34px 28px;">
                ${bodyHtml}
                <p style="color:${brand.muted};font-size:13px;line-height:1.6;margin-top:30px;">
                  ICC Certified Amazon Deal Partner updates are transactional File Desk notices.
                  <a href="${escapeAttribute(unsubscribeUrl)}" style="color:${brand.maroon};">Unsubscribe</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="background:${brand.oxblood};color:rgba(255,250,240,.72);font-size:12px;padding:16px 28px;">
                10-12% paid on funded · Fast clear yes/no · Protected commission
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
