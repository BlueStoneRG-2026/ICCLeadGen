import { describe, expect, it } from "vitest";
import { runRulesOnlyChecker } from "../netlify/functions/_shared/checker";

describe("rules-only checker", () => {
  it("returns likely_fundable for dominant Amazon-economy inflow", () => {
    const result = runRulesOnlyChecker({
      merchantName: "Northstar FBA",
      fileName: "amazon-q2.csv",
      text: "AMZN settlement deposit credit payout gross revenue Amazon Seller Central"
    });

    expect(result).toEqual({
      checkerDecision: "likely_fundable",
      detectedDescriptor: "AMAZON.COM",
      isDominantInflow: true
    });
  });

  it("returns needs_review when a descriptor is present without enough inflow context", () => {
    const result = runRulesOnlyChecker({
      merchantName: "Relay carrier",
      text: "invoice summary"
    });

    expect(result.checkerDecision).toBe("needs_review");
    expect(result.detectedDescriptor).toBe("AMAZON RELAY");
    expect(result.isDominantInflow).toBe(false);
  });

  it("returns out_of_box without hard-rejecting unknown files", () => {
    const result = runRulesOnlyChecker({
      merchantName: "Local bakery",
      fileName: "bank.csv",
      text: "retail sales debit card deposits"
    });

    expect(result.checkerDecision).toBe("out_of_box");
    expect(result.detectedDescriptor).toBe("UNKNOWN");
    expect(result.checkerDecision).not.toMatch(/reject|declin|deny/i);
  });
});
