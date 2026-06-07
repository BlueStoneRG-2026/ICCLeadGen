import { env } from "./env";

interface DocuSealEnvelopeInput {
  email: string;
  fullName: string;
  partnerId: string;
  referralToken: string;
}

export async function createDocuSealEnvelope(input: DocuSealEnvelopeInput) {
  const docusealUrl = env("DOCUSEAL_URL");
  const apiToken = env("DOCUSEAL_API_TOKEN");
  const templateId = env("DOCUSEAL_TEMPLATE_ID");
  const fieldMap = env("DOCUSEAL_FIELD_MAP_JSON", "{}");

  if (!docusealUrl || !apiToken || !templateId) {
    return {
      envelopeId: `stub_${input.referralToken}`,
      signingUrl: `https://docuseal.example.com/stub/${input.referralToken}`,
      stubbed: true
    };
  }

  const response = await fetch(`${docusealUrl.replace(/\/$/, "")}/api/submissions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Auth-Token": apiToken
    },
    body: JSON.stringify({
      template_id: Number(templateId),
      send_email: false,
      submitters: [
        {
          email: input.email,
          name: input.fullName,
          metadata: {
            partner_id: input.partnerId,
            referral_token: input.referralToken
          },
          fields: JSON.parse(fieldMap)
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DocuSeal envelope failed: ${text}`);
  }

  const body = await response.json();
  const submitter = body.submitters?.[0] || body.data?.submitters?.[0] || body;
  return {
    envelopeId: String(body.id || body.submission_id || body.data?.id),
    signingUrl: String(submitter.slug ? `${docusealUrl}/s/${submitter.slug}` : submitter.signing_url),
    stubbed: false
  };
}
