export const duplicateNonRenewalMessages = {
  alreadyFunded: "This submission is already marked funded. No duplicate commission was accrued.",
  commissionExists: "A non-renewal commission already exists for this submission. No duplicate was accrued."
};

export async function nonRenewalDuplicateMessage(
  supabase: any,
  submissionRow: { routing_state?: string },
  submissionId: string
) {
  if (submissionRow.routing_state === "funded") {
    return duplicateNonRenewalMessages.alreadyFunded;
  }

  const { count, error } = await supabase
    .from("commissions")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submissionId)
    .eq("is_renewal", false);

  if (error) {
    throw error;
  }

  return (count || 0) > 0 ? duplicateNonRenewalMessages.commissionExists : "";
}

export function isUniqueViolation(error: unknown) {
  return (error as { code?: string } | null)?.code === "23505";
}

