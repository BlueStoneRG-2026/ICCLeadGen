const base = (process.env.LOCAL_FUNCTION_BASE || "http://127.0.0.1:8888/.netlify/functions").replace(/\/$/, "");

if (!isLocalUrl(base) && process.env.ALLOW_NONLOCAL_FLOW !== "true") {
  throw new Error(
    `Refusing to run local flow against non-local URL: ${base}. Set ALLOW_NONLOCAL_FLOW=true only for an intentional staging test.`
  );
}

const runId = Date.now();
const email = `pilot-${runId}@examplebroker.test`;
const csv = [
  "Date,Description,Amount,Balance",
  "2026-06-01,AMZN settlement deposit credit payout gross revenue,18400,62000",
  "2026-06-03,Amazon Seller Central ACH credit,9600,71600"
].join("\n");

const intakeForm = new FormData();
intakeForm.set("email", email);
intakeForm.set("fullName", "Local Flow Broker");
intakeForm.set("firmName", "Local File Desk Test");
intakeForm.set("merchantName", "Local Amazon Seller");
intakeForm.set("referrerType", "broker_mca");
intakeForm.set("statement", new Blob([csv], { type: "text/csv" }), `local-amazon-${runId}.csv`);

const intake = await request("intake", {
  method: "POST",
  body: intakeForm
});

await request("admin-action", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    action: "send_to_underwriting",
    submissionId: intake.submissionId
  })
});

const funded = await request("admin-action", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    action: "mark_funded",
    submissionId: intake.submissionId,
    fundedAmount: 25000,
    isRenewal: false
  })
});

console.log(
  JSON.stringify(
    {
      ok: true,
      base,
      email,
      submissionId: intake.submissionId,
      checkerDecision: intake.checkerDecision,
      routingState: intake.routingState,
      fundedMessage: funded.message
    },
    null,
    2
  )
);

async function request(path, init) {
  const response = await fetch(`${base}/${path}`, init);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("json") ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function isLocalUrl(value) {
  const url = new URL(value);
  return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
}
