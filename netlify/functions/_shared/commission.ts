export interface CommissionInput {
  fundedAmount: number;
  commissionBpsNew: number;
  commissionBpsRenewal: number;
  isRenewal: boolean;
}

export function calculateCommission(input: CommissionInput) {
  const bps = input.isRenewal ? input.commissionBpsRenewal : input.commissionBpsNew;
  const payoutOwed = Math.round(((input.fundedAmount * bps) / 10000) * 100) / 100;

  return {
    bps,
    payoutOwed,
    clawbackEligible: input.fundedAmount > 10000
  };
}

