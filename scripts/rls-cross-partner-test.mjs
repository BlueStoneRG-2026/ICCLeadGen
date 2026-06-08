import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = requireEnv("SUPABASE_URL");
const anonKey = requireEnv("SUPABASE_ANON_KEY");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const password = `Rls-local-${randomUUID()}!`;
const marker = randomUUID().slice(0, 8);
const partnerA = {
  email: `rls-a-${marker}@filedesk.local`,
  fullName: "RLS Partner A",
  token: `ICC-RLS-A-${marker.toUpperCase()}`
};
const partnerB = {
  email: `rls-b-${marker}@filedesk.local`,
  fullName: "RLS Partner B",
  token: `ICC-RLS-B-${marker.toUpperCase()}`
};

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const createdUserIds = [];
const createdSubmissionIds = [];

try {
  const userA = await createConfirmedUser(partnerA.email, partnerA.fullName);
  const userB = await createConfirmedUser(partnerB.email, partnerB.fullName);

  await insertPartner(userA.id, partnerA);
  await insertPartner(userB.id, partnerB);

  const submissionA = await insertSubmission(userA.id, partnerA.token, "RLS Seller A");
  const submissionB = await insertSubmission(userB.id, partnerB.token, "RLS Seller B");
  await insertCommission(userA.id, submissionA.id, 11000);
  await insertCommission(userB.id, submissionB.id, 22000);

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const signIn = await anon.auth.signInWithPassword({ email: partnerA.email, password });
  if (signIn.error || !signIn.data.session?.access_token) {
    throw new Error(`Could not sign in partner A through anon client: ${signIn.error?.message || "missing session"}`);
  }

  const partnerAClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        authorization: `Bearer ${signIn.data.session.access_token}`
      }
    }
  });

  await assertVisible("own partner", partnerAClient.from("partners").select("id").eq("id", userA.id), 1);
  await assertVisible("own submission", partnerAClient.from("submissions").select("id").eq("id", submissionA.id), 1);
  await assertVisible("own commission", partnerAClient.from("commissions").select("id").eq("partner_id", userA.id), 1);

  await assertDenied("partner B partner", partnerAClient.from("partners").select("id").eq("id", userB.id));
  await assertDenied("partner B submission", partnerAClient.from("submissions").select("id").eq("id", submissionB.id));
  await assertDenied("partner B commissions", partnerAClient.from("commissions").select("id").eq("partner_id", userB.id));

  console.log("RLS cross-partner read test passed: partner A cannot read partner B rows.");
} finally {
  await cleanup();
}

async function createConfirmedUser(email, fullName) {
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName }
  });
  if (result.error || !result.data.user) {
    throw new Error(`Could not create ${email}: ${result.error?.message || "missing user"}`);
  }
  createdUserIds.push(result.data.user.id);
  return result.data.user;
}

async function insertPartner(id, partner) {
  const { error } = await admin.from("partners").insert({
    id,
    email: partner.email,
    full_name: partner.fullName,
    firm_name: "RLS Integration Desk",
    referrer_type: "broker_mca",
    status: "certified",
    quiz_completed: true,
    referral_token: partner.token,
    commission_bps_new: 1100,
    commission_bps_renewal: 1100,
    pays_on_renewals: true
  });
  if (error) {
    throw new Error(`Could not insert partner ${partner.email}: ${error.message}`);
  }
}

async function insertSubmission(partnerId, referralToken, merchantName) {
  const { data, error } = await admin
    .from("submissions")
    .insert({
      partner_id: partnerId,
      referral_token: referralToken,
      merchant_name: merchantName,
      detected_descriptor: "AMAZON.COM",
      is_dominant_inflow: true,
      checker_decision: "likely_fundable",
      file_path: `rls/${randomUUID()}.csv`,
      routing_state: "funded"
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Could not insert submission for ${partnerId}: ${error?.message || "missing row"}`);
  }
  createdSubmissionIds.push(data.id);
  return data;
}

async function insertCommission(partnerId, submissionId, fundedAmount) {
  const { error } = await admin.from("commissions").insert({
    partner_id: partnerId,
    submission_id: submissionId,
    funded_amount: fundedAmount,
    is_renewal: false,
    payout_owed: Math.round(fundedAmount * 0.11 * 100) / 100,
    clawback_eligible: fundedAmount > 10000,
    payout_state: "accrued"
  });
  if (error) {
    throw new Error(`Could not insert commission for ${submissionId}: ${error.message}`);
  }
}

async function assertVisible(label, query, expectedRows) {
  const { data, error } = await query;
  if (error) {
    throw new Error(`${label} read errored: ${error.message}`);
  }
  if ((data || []).length !== expectedRows) {
    throw new Error(`${label} visibility check failed: expected ${expectedRows}, saw ${(data || []).length}`);
  }
}

async function assertDenied(label, query) {
  const { data, error } = await query;
  if (error) {
    throw new Error(`${label} read errored instead of returning zero rows: ${error.message}`);
  }
  if ((data || []).length > 0) {
    throw new Error(`RLS breach: ${label} returned ${(data || []).length} row(s) to partner A.`);
  }
}

async function cleanup() {
  if (createdSubmissionIds.length) {
    await admin.from("commissions").delete().in("submission_id", createdSubmissionIds);
    await admin.from("submissions").delete().in("id", createdSubmissionIds);
  }
  if (createdUserIds.length) {
    await admin.from("partners").delete().in("id", createdUserIds);
    await Promise.all(createdUserIds.map((id) => admin.auth.admin.deleteUser(id)));
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Start Supabase local and export its ${name} value first.`);
  }
  return value;
}
