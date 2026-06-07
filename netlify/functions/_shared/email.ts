import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

export interface TransactionalEmail {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
}

export async function sendTransactionalEmail(email: TransactionalEmail) {
  const region = env("SES_REGION", "us-east-1");
  const accessKeyId = env("SES_ACCESS_KEY");
  const secretAccessKey = env("SES_SECRET");
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

  if (!accessKeyId || !secretAccessKey) {
    console.info("SES credentials missing; email logged only.", {
      to: email.to,
      subject: email.subject
    });
    return { skipped: true };
  }

  const client = new SESv2Client({
    region,
    credentials: { accessKeyId, secretAccessKey }
  });

  await client.send(
    new SendEmailCommand({
      FromEmailAddress: from,
      Destination: {
        ToAddresses: deliverableRecipients
      },
      ReplyToAddresses: [replyTo],
      Content: {
        Simple: {
          Headers: [
            { Name: "List-Unsubscribe", Value: listUnsubscribe },
            { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" }
          ],
          Subject: { Data: email.subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: email.text, Charset: "UTF-8" },
            Html: { Data: email.html, Charset: "UTF-8" }
          }
        }
      }
    })
  );

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
  return {
    subject: `ICC File Desk: ${merchantName} is ${readable}`,
    text: `${merchantName} moved to ${readable}. The File Desk will continue sending updates as the file moves.`,
    html: `<p><strong>${merchantName}</strong> moved to <strong>${readable}</strong>.</p><p>The File Desk will continue sending updates as the file moves.</p>`
  };
}
