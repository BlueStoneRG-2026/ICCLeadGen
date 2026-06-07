import type { CheckerDecision } from "../../../src/types";

export interface CheckerInput {
  merchantName?: string;
  fileName?: string;
  text?: string;
}

export function runRulesOnlyChecker(input: CheckerInput): {
  checkerDecision: CheckerDecision;
  detectedDescriptor: string;
  isDominantInflow: boolean;
} {
  const haystack = `${input.merchantName || ""} ${input.fileName || ""} ${input.text || ""}`.toLowerCase();
  const amazonHits = count(haystack, /amazon|amzn|seller central|fba|fbm/g);
  const relayHits = count(haystack, /relay|amazon relay/g);
  const dspHits = count(haystack, /dsp|delivery service partner/g);
  const descriptor = relayHits
    ? "AMAZON RELAY"
    : dspHits
      ? "AMAZON DSP"
      : amazonHits
        ? "AMAZON.COM"
        : "UNKNOWN";
  const totalDescriptorHits = amazonHits + relayHits + dspHits;
  const inflowHints = count(haystack, /deposit|credit|ach|payout|settlement|gross|revenue/g);
  const isDominantInflow = totalDescriptorHits >= 2 || (totalDescriptorHits >= 1 && inflowHints >= 2);

  if (descriptor !== "UNKNOWN" && isDominantInflow) {
    return { checkerDecision: "likely_fundable", detectedDescriptor: descriptor, isDominantInflow };
  }

  if (descriptor !== "UNKNOWN") {
    return { checkerDecision: "needs_review", detectedDescriptor: descriptor, isDominantInflow };
  }

  return { checkerDecision: "out_of_box", detectedDescriptor: descriptor, isDominantInflow: false };
}

function count(value: string, pattern: RegExp) {
  return value.match(pattern)?.length || 0;
}
