import crypto from "node:crypto";
import { env } from "./env";

interface PartnerAgreementEnvelopeInput {
  email: string;
  fullName: string;
  firmName?: string | null;
  partnerId: string;
  referralToken: string;
}

interface DocusignToken {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export async function createPartnerAgreementEnvelope(input: PartnerAgreementEnvelopeInput) {
  const accountId = env("DOCUSIGN_ACCOUNT_ID");
  const templateId = env("DOCUSIGN_ISO_TEMPLATE_ID");
  const integrationKey = env("DOCUSIGN_INTEGRATION_KEY");
  const impersonatedUserId = env("DOCUSIGN_USER_ID");
  const privateKey = env("DOCUSIGN_PRIVATE_KEY");

  if (!accountId || !templateId || !integrationKey || !impersonatedUserId || !privateKey) {
    return {
      envelopeId: `stub_${input.referralToken}`,
      signingUrl: `https://docusign.example.com/stub/${input.referralToken}`,
      provider: "docusign",
      stubbed: true
    };
  }

  const accessToken = await requestDocusignJwtToken({
    integrationKey,
    impersonatedUserId,
    privateKey
  });
  const basePath = env("DOCUSIGN_BASE_PATH", "https://demo.docusign.net/restapi").replace(/\/$/, "");
  const roleName = env("DOCUSIGN_TEMPLATE_ROLE_NAME", "Signer1");

  const envelope = await docusignFetch<{ envelopeId: string }>(
    `${basePath}/v2.1/accounts/${encodeURIComponent(accountId)}/envelopes`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        emailSubject: "ICC Amazon File Desk ISO Partner Agreement",
        templateId,
        templateRoles: [
          {
            roleName,
            name: input.fullName,
            email: input.email,
            clientUserId: input.partnerId,
            tabs: buildTemplateTabs(input)
          }
        ],
        customFields: {
          textCustomFields: [
            { name: "partner_id", value: input.partnerId, show: "false" },
            { name: "referral_token", value: input.referralToken, show: "false" }
          ]
        },
        status: "sent"
      })
    }
  );

  const view = await docusignFetch<{ url: string }>(
    `${basePath}/v2.1/accounts/${encodeURIComponent(accountId)}/envelopes/${encodeURIComponent(
      envelope.envelopeId
    )}/views/recipient`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        returnUrl: env("DOCUSIGN_RETURN_URL", "https://partners.ironcrowncapital.com/#portal"),
        authenticationMethod: "email",
        email: input.email,
        userName: input.fullName,
        clientUserId: input.partnerId
      })
    }
  );

  return {
    envelopeId: envelope.envelopeId,
    signingUrl: view.url,
    provider: "docusign",
    stubbed: false
  };
}

async function requestDocusignJwtToken({
  integrationKey,
  impersonatedUserId,
  privateKey
}: {
  integrationKey: string;
  impersonatedUserId: string;
  privateKey: string;
}) {
  const authServer = env("DOCUSIGN_AUTH_SERVER", "account-d.docusign.com");
  const now = Math.floor(Date.now() / 1000);
  const jwt = signJwt(
    {
      alg: "RS256",
      typ: "JWT"
    },
    {
      iss: integrationKey,
      sub: impersonatedUserId,
      aud: authServer,
      iat: now,
      exp: now + 3600,
      scope: "signature impersonation"
    },
    normalizePrivateKey(privateKey)
  );

  const response = await fetch(`https://${authServer}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DocuSign JWT token request failed: ${text}`);
  }

  const body = (await response.json()) as DocusignToken;
  return body.access_token;
}

async function docusignFetch<T>(url: string, accessToken: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DocuSign API request failed: ${text}`);
  }

  return (await response.json()) as T;
}

function buildTemplateTabs(input: PartnerAgreementEnvelopeInput) {
  const raw = env("DOCUSIGN_FIELD_MAP_JSON", "{}");
  const fieldMap = JSON.parse(raw || "{}");

  if (fieldMap.tabs) {
    return fieldMap.tabs;
  }

  const values: Record<string, string> = {
    email: input.email,
    fullName: input.fullName,
    firmName: input.firmName || "",
    partnerId: input.partnerId,
    referralToken: input.referralToken
  };

  const textTabs = Object.entries(fieldMap).map(([tabLabel, source]) => ({
    tabLabel,
    value: typeof source === "string" && values[source] !== undefined ? values[source] : String(source ?? "")
  }));

  return textTabs.length ? { textTabs } : undefined;
}

function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKey: string) {
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(data);
  signer.end();
  return `${data}.${base64Url(signer.sign(privateKey))}`;
}

function normalizePrivateKey(privateKey: string) {
  return privateKey.replace(/\\n/g, "\n");
}

function base64Url(value: string | Buffer) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
