import { describe, expect, it } from "vitest";
import {
  certifiedPartnerEmail,
  isoReadyEmail,
  renderTransactionalEmailHtml,
  statusEmail,
  unsubscribeConfirmationEmail
} from "../netlify/functions/_shared/email";

const unsubscribeUrl = "https://icc-file-desk.netlify.app/.netlify/functions/unsubscribe?email=broker%40example.com";

describe("branded transactional emails", () => {
  it("renders every File Desk template inside the Iron Crown shell", () => {
    const templates = [
      isoReadyEmail("https://docusign.example.com/signing"),
      statusEmail("received", "Northstar FBA"),
      statusEmail("va_check", "Northstar FBA"),
      statusEmail("underwriting", "Northstar FBA"),
      statusEmail("funded", "Northstar FBA"),
      certifiedPartnerEmail("Avery Stone", "ICC-STONE-42A9"),
      unsubscribeConfirmationEmail()
    ];

    templates.forEach((template) => {
      const html = renderTransactionalEmailHtml(template, unsubscribeUrl);
      expect(html).toContain("<!doctype html>");
      expect(html).toContain("Iron Crown Capital");
      expect(html).toContain("Amazon File Desk");
      expect(html).toContain("#4b1217");
      expect(html).toContain("#c86b2d");
      expect(html).toContain("#fffaf0");
      expect(html).toContain("Cormorant Garamond");
      expect(html).toContain("DM Sans");
      expect(html).toContain(unsubscribeUrl);
      expect(html).not.toMatch(/<script|onerror=|onclick=/i);
    });
  });

  it("renders status emails for the second-file loop states", () => {
    const states = ["received", "va_check", "underwriting", "funded"];
    states.forEach((state) => {
      const template = statusEmail(state, "Prime Lane Relay");
      const html = renderTransactionalEmailHtml(template, unsubscribeUrl);
      expect(template.subject).toContain("Prime Lane Relay");
      expect(html).toContain("status-card");
      expect(html).toContain(state.replace("_", " "));
    });
  });

  it("renders the certified badge with referral token", () => {
    const html = renderTransactionalEmailHtml(certifiedPartnerEmail("Avery Stone", "ICC-STONE-42A9"), unsubscribeUrl);
    expect(html).toContain("credential-badge");
    expect(html).toContain("ICC Certified");
    expect(html).toContain("ICC-STONE-42A9");
  });
});
