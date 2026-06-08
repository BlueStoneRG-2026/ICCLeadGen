import { rateLimitPolicies } from "./abuse-policy";

export async function enforceSubmissionCaps(
  supabase: any,
  partnerId: string,
  status: string,
  now = new Date()
) {
  const dayAgo = new Date(now.getTime() - rateLimitPolicies.submissionsPerDay.windowMs).toISOString();
  const daily = await supabase
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)
    .gte("created_at", dayAgo);

  if (daily.error) {
    throw daily.error;
  }

  if ((daily.count || 0) >= rateLimitPolicies.submissionsPerDay.limit) {
    throw Object.assign(new Error("New partners can upload at most 3 files per day."), { statusCode: 429 });
  }

  if (status !== "certified") {
    const total = await supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId);

    if (total.error) {
      throw total.error;
    }

    if ((total.count || 0) >= rateLimitPolicies.provisionalSubmissionCap) {
      throw Object.assign(new Error("Provisional partners can submit one file before certification."), {
        statusCode: 403
      });
    }
  }
}

