import {
  ArrowRight,
  BadgeCheck,
  Crown,
  DollarSign,
  FileCheck2,
  Landmark,
  LockKeyhole,
  MailWarning,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  UploadCloud
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import {
  adminAction,
  certifyPartner,
  getAdminData,
  getPortalData,
  submitRescue,
  useDemoMode
} from "./lib/api";
import { applyDemoAdminAction } from "./lib/admin-demo";
import { getSupabaseBrowserClient, hasSupabaseBrowserConfig, type BrowserSession } from "./lib/supabase";
import type { AdminData, CertificationResult, IntakeResult, PortalData, RoutingState } from "./types";

type Route = "rescue" | "certify" | "portal" | "admin" | "content";

const routes: Array<{ key: Route; label: string }> = [
  { key: "rescue", label: "Rescue" },
  { key: "certify", label: "Certify" },
  { key: "portal", label: "Portal" },
  { key: "admin", label: "Admin" },
  { key: "content", label: "Amazon niches" }
];

const routeFromHash = (): Route => {
  const hash = window.location.hash.replace("#", "") as Route;
  return routes.some((route) => route.key === hash) ? hash : "rescue";
};

function App() {
  const [route, setRouteState] = useState<Route>(routeFromHash);

  useEffect(() => {
    const onHashChange = () => setRouteState(routeFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const setRoute = (next: Route) => {
    window.location.hash = next;
    setRouteState(next);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-lockup" onClick={() => setRoute("rescue")} type="button">
          <span className="brand-mark" aria-hidden="true">
            <Crown size={18} />
          </span>
          <span>
            <strong>Iron Crown Capital</strong>
            <small>Amazon File Desk</small>
          </span>
        </button>
        <nav aria-label="Primary navigation">
          {routes.map((item) => (
            <button
              className={route === item.key ? "nav-item active" : "nav-item"}
              key={item.key}
              onClick={() => setRoute(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {route === "rescue" && <RescueChallenge onCertify={() => setRoute("certify")} />}
        {route === "certify" && <CertificationFunnel onPortal={() => setRoute("portal")} />}
        {route === "portal" && <PartnerPortal />}
        {route === "admin" && <AdminDashboard />}
        {route === "content" && <NichePages />}
      </main>
    </div>
  );
}

function RescueChallenge({ onCertify }: { onCertify: () => void }) {
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);

    try {
      const form = new FormData(event.currentTarget);
      const response = await submitRescue(form);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file could not be submitted.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Deal Rescue Challenge</p>
          <h1>Have an Amazon deal nobody could place? Give it a home.</h1>
          <p className="hero-subcopy">
            Upload the statement. If Amazon pays the merchant, the File Desk routes it to a
            specialist review path built for sellers, Relay carriers, and DSP operators.
          </p>
          <div className="trust-row" aria-label="Partner trust signals">
            <span>10-12% paid on funded</span>
            <span>Fast clear yes/no</span>
            <span>Protected commission</span>
          </div>
        </div>

        <form className="upload-tool" onSubmit={onSubmit}>
          <div className="tool-heading">
            <UploadCloud size={22} />
            <div>
              <h2>Drop the file</h2>
              <p>CSV, PDF, or XLSX bank statement up to 15 MB.</p>
            </div>
          </div>

          <label className="file-drop">
            <input
              accept=".csv,.pdf,.xlsx,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              name="statement"
              onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name || "")}
              required
              type="file"
            />
            <span>{fileName || "Choose bank statement"}</span>
          </label>

          <div className="form-grid two">
            <label>
              Partner email
              <input name="email" placeholder="you@firm.com" required type="email" />
            </label>
            <label>
              Merchant
              <input name="merchantName" placeholder="Merchant legal name" required />
            </label>
            <label>
              Full name
              <input name="fullName" placeholder="Your name" required />
            </label>
            <label>
              Firm
              <input name="firmName" placeholder="Brokerage or agency" />
            </label>
          </div>

          <label>
            Partner type
            <select defaultValue="broker_mca" name="referrerType">
              <option value="broker_mca">MCA broker / ISO</option>
              <option value="amazon_agency">Amazon agency / consultant</option>
              <option value="accountant">Accountant / bookkeeper</option>
            </select>
          </label>

          <button className="primary-action" disabled={loading} type="submit">
            {loading ? "Checking file..." : "Run the checker"}
            <ArrowRight size={18} />
          </button>
          {error && <p className="form-error">{error}</p>}
        </form>
      </section>

      {result && <CheckerResult result={result} onCertify={onCertify} />}
      <section className="proof-band">
        <ProofItem icon={<ShieldCheck />} label="Merchant and commission protected" />
        <ProofItem icon={<FileCheck2 />} label="Rules-only checker, no hard rejection" />
        <ProofItem icon={<Landmark />} label="Routes into operator-owned underwriting" />
      </section>
    </>
  );
}

function CheckerResult({ result, onCertify }: { result: IntakeResult; onCertify: () => void }) {
  const tone = result.checkerDecision === "likely_fundable" ? "success" : result.checkerDecision === "needs_review" ? "watch" : "soft";
  const title =
    result.checkerDecision === "likely_fundable"
      ? "Likely fundable. This one's worth submitting."
      : result.checkerDecision === "needs_review"
        ? "Needs review. Still worth a human look."
        : "Out of box. Keep the relationship warm.";

  return (
    <section className={`result-panel ${tone}`} aria-live="polite">
      <div>
        <p className="eyebrow">Instant checker</p>
        <h2>{title}</h2>
        <p>{result.message}</p>
        {result.detectedDescriptor && (
          <p className="mono-line">Detected descriptor: {result.detectedDescriptor}</p>
        )}
      </div>
      <div className="result-actions">
        <button className="primary-action" onClick={onCertify} type="button">
          Certify partner
          <BadgeCheck size={18} />
        </button>
        <p>{result.nextAction}</p>
      </div>
    </section>
  );
}

function CertificationFunnel({ onPortal }: { onPortal: () => void }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CertificationResult | null>(null);
  const [error, setError] = useState("");
  const progress = `${Math.min(step, 3) * 33.333}%`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const formData = new FormData(event.currentTarget);
      const payload = Object.fromEntries(formData.entries());
      const response = await certifyPartner(payload);
      setResult(response);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Certification signup failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page-grid">
      <div className="ceremony">
        <p className="eyebrow">ICC Certified Amazon Deal Partner</p>
        <h1>A credential brokers can actually show.</h1>
        <p>
          The certification path is short by design: learn the Amazon file rule, confirm the
          protected-commission terms, sign the ISO agreement, then submit files through the desk.
        </p>
        <div className="progress-track">
          <span style={{ width: progress }} />
        </div>
        <div className="badge-preview">
          <Crown size={38} />
          <strong>ICC Certified</strong>
          <span>Amazon Deal Partner</span>
        </div>
      </div>

      <div className="workflow-panel">
        {step === 1 && (
          <div className="stack">
            <h2>Rule one</h2>
            <p className="big-copy">Does Amazon pay them? Send the file.</p>
            <p>
              FBA, FBM, Relay, and DSP files often fail generic funding desks because the payment
              stream is misunderstood. This desk exists for those files.
            </p>
            <button className="primary-action" onClick={() => setStep(2)} type="button">
              Take the quiz
              <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <h2>Quick check</h2>
            <label className="choice">
              <input name="quiz" type="radio" defaultChecked />
              If Amazon is the inflow, the file belongs here.
            </label>
            <label className="choice">
              <input name="quiz" type="radio" />
              Reject every file without scoring it.
            </label>
            <button className="primary-action" onClick={() => setStep(3)} type="button">
              Start signup
              <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step === 3 && (
          <form className="stack" onSubmit={onSubmit}>
            <h2>Partner signup</h2>
            <div className="form-grid two">
              <label>
                Full name
                <input name="fullName" required />
              </label>
              <label>
                Firm
                <input name="firmName" />
              </label>
              <label>
                Email
                <input name="email" required type="email" />
              </label>
              <label>
                Verification URL
                <input name="verificationUrl" placeholder="https://firm.com" />
              </label>
            </div>
            <label>
              Partner type
              <select defaultValue="broker_mca" name="referrerType">
                <option value="broker_mca">MCA broker / ISO</option>
                <option value="amazon_agency">Amazon agency / consultant</option>
                <option value="accountant">Accountant / bookkeeper</option>
              </select>
            </label>
            <button className="primary-action" disabled={loading} type="submit">
              {loading ? "Creating envelope..." : "Create DocuSign envelope"}
              <Send size={18} />
            </button>
            {error && <p className="form-error">{error}</p>}
          </form>
        )}

        {result && (
          <div className="signed-state">
            <BadgeCheck size={34} />
            <h2>Envelope ready</h2>
            <p>{result.message}</p>
            <p className="mono-line">Referral token: {result.referralToken}</p>
            <a className="secondary-action" href={result.signingUrl}>
              Open DocuSign
            </a>
            <button className="primary-action" onClick={onPortal} type="button">
              View portal
              <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function PartnerPortal() {
  return (
    <AuthGate
      description="Sign in with the email tied to your ICC partner account."
      render={(session) => <PartnerPortalContent accessToken={session?.access_token} />}
      title="Partner portal"
    />
  );
}

function PartnerPortalContent({ accessToken }: { accessToken?: string }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    setError("");
    void getPortalData(accessToken).then(setData).catch((err) => {
      setError(err instanceof Error ? err.message : "Could not load portal data.");
    });
  }, [accessToken]);

  if (error) {
    return <ErrorPanel title="Portal unavailable" message={error} />;
  }

  if (!data) {
    return <LoadingPanel label="Opening partner portal" />;
  }

  const totalOwed = data.commissions.reduce((sum, row) => sum + row.payoutOwed, 0);

  return (
    <section className="dashboard">
      <div className="dashboard-hero">
        <div>
          <p className="eyebrow">Partner portal</p>
          <h1>{data.partner.fullName}</h1>
          <p>{data.partner.firmName || "Certified Amazon Deal Partner"}</p>
        </div>
        <div className="metric-strip">
          <Metric label="Private rank" value={`#${data.partner.rank}`} />
          <Metric label="Accrued" value={formatMoney(totalOwed)} />
          <Metric label="Renewal rate" value={`${data.partner.commissionBpsRenewal / 100}%`} />
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-title">
            <BadgeCheck size={20} />
            <h2>Credential</h2>
          </div>
          <div className="portal-badge">
            <Crown size={28} />
            <strong>ICC Certified Amazon Deal Partner</strong>
            <span className="mono-line">{data.partner.referralToken}</span>
          </div>
        </section>

        <section className="panel wide">
          <div className="panel-title">
            <FileCheck2 size={20} />
            <h2>Submissions</h2>
          </div>
          <DataTable
            columns={["Merchant", "Descriptor", "Decision", "Status"]}
            rows={data.submissions.map((row) => [
              row.merchantName,
              row.detectedDescriptor,
              decisionLabel(row.checkerDecision),
              <StatusPill key={row.id} state={row.routingState} />
            ])}
          />
        </section>

        <section className="panel wide">
          <div className="panel-title">
            <DollarSign size={20} />
            <h2>Commission ledger</h2>
          </div>
          <DataTable
            columns={["Funded", "Type", "Payout owed", "State"]}
            rows={data.commissions.map((row) => [
              formatMoney(row.fundedAmount),
              row.isRenewal ? "Renewal" : "New",
              formatMoney(row.payoutOwed),
              row.payoutState
            ])}
          />
        </section>
      </div>
    </section>
  );
}

function AdminDashboard() {
  return (
    <AuthGate
      description="Admin access is restricted to the operator and VA allowlist."
      render={(session) => <AdminDashboardContent accessToken={session?.access_token} />}
      title="Admin path"
    />
  );
}

function AdminDashboardContent({ accessToken }: { accessToken?: string }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [fundingDrafts, setFundingDrafts] = useState<Record<string, { fundedAmount: string; isRenewal: boolean }>>({});

  useEffect(() => {
    setData(null);
    setError("");
    setActionError("");
    void getAdminData(accessToken).then(setData).catch((err) => {
      setError(err instanceof Error ? err.message : "Could not load admin data.");
    });
  }, [accessToken]);

  async function run(action: string, payload: Record<string, unknown>) {
    setActionError("");
    try {
      const response = await adminAction(action, payload, accessToken);
      setNotice(response.message);
      if (useDemoMode()) {
        setData((current) => applyDemoAdminAction(current, action, payload));
        return;
      }
      setData(await getAdminData(accessToken));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Admin action failed.");
    }
  }

  function updateFundingDraft(submissionId: string, patch: Partial<{ fundedAmount: string; isRenewal: boolean }>) {
    setFundingDrafts((current) => ({
      ...current,
      [submissionId]: {
        fundedAmount: current[submissionId]?.fundedAmount || "42000",
        isRenewal: current[submissionId]?.isRenewal || false,
        ...patch
      }
    }));
  }

  if (error) {
    return <ErrorPanel title="Admin unavailable" message={error} />;
  }

  if (!data) {
    return <LoadingPanel label="Opening admin dashboard" />;
  }

  return (
    <section className="dashboard admin">
      <div className="dashboard-hero">
        <div>
          <p className="eyebrow">Admin path</p>
          <h1>VA queue and operator actions</h1>
          <p>Allowlisted Supabase Auth users only in deployment.</p>
        </div>
        <LockKeyhole size={42} />
      </div>
      {notice && <p className="success-note">{notice}</p>}
      {actionError && <p className="form-error">{actionError}</p>}
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-title">
            <ShieldCheck size={20} />
            <h2>Manual vetting</h2>
          </div>
          {data.pendingPartners.map((partner) => (
            <div className="action-row" key={partner.id}>
              <span>
                <strong>{partner.fullName}</strong>
                <small>{partner.email}</small>
              </span>
              <button onClick={() => run("approve_partner", { partnerId: partner.id })} type="button">
                Approve
              </button>
            </div>
          ))}
        </section>

        <section className="panel">
          <div className="panel-title">
            <BadgeCheck size={20} />
            <h2>Certified emails</h2>
          </div>
          {data.certifiedPartners.map((partner) => (
            <div className="action-row" key={partner.id}>
              <span>
                <strong>{partner.fullName}</strong>
                <small>{partner.email}</small>
              </span>
              <button onClick={() => run("resend_certified_email", { partnerId: partner.id })} type="button">
                Resend
              </button>
            </div>
          ))}
        </section>

        <section className="panel wide">
          <div className="panel-title">
            <Send size={20} />
            <h2>VA queue</h2>
          </div>
          {data.queue.map((submission) => (
            <div className="queue-row" key={submission.id}>
              <div>
                <strong>{submission.merchantName}</strong>
                <small>
                  {submission.partnerName} · {submission.detectedDescriptor}
                </small>
              </div>
              <StatusPill state={submission.routingState} />
              <button
                disabled={submission.routingState === "underwriting"}
                onClick={() => run("send_to_underwriting", { submissionId: submission.id })}
                type="button"
              >
                Send to underwriting
              </button>
              <div className="funding-controls">
                <label>
                  Funded
                  <input
                    inputMode="decimal"
                    min="1"
                    onChange={(event) =>
                      updateFundingDraft(submission.id, { fundedAmount: event.currentTarget.value })
                    }
                    type="number"
                    value={fundingDrafts[submission.id]?.fundedAmount || "42000"}
                  />
                </label>
                <label className="toggle-line">
                  <input
                    checked={fundingDrafts[submission.id]?.isRenewal || false}
                    onChange={(event) => updateFundingDraft(submission.id, { isRenewal: event.currentTarget.checked })}
                    type="checkbox"
                  />
                  Renewal
                </label>
              </div>
              <button
                onClick={() =>
                  run("mark_funded", {
                    submissionId: submission.id,
                    fundedAmount: Number(fundingDrafts[submission.id]?.fundedAmount || 42000),
                    isRenewal: fundingDrafts[submission.id]?.isRenewal || false
                  })
                }
                type="button"
              >
                Mark funded
              </button>
            </div>
          ))}
        </section>

        <section className="panel wide">
          <div className="panel-title">
            <DollarSign size={20} />
            <h2>Payout review</h2>
          </div>
          <DataTable
            columns={["Partner", "Payout", "State", "Review"]}
            rows={data.commissions.map((row) => [
              row.partnerEmail,
              formatMoney(row.payoutOwed),
              row.payoutState,
              row.requiresFirstDealReview ? "First funded deal" : "Standard"
            ])}
          />
        </section>

        <section className="panel wide">
          <div className="panel-title">
            <MailWarning size={20} />
            <h2>Email outbox</h2>
          </div>
          {data.outboxEvents.length ? (
            <DataTable
              columns={["Template", "Recipient", "State", "Retry"]}
              rows={data.outboxEvents.map((event) => [
                event.template,
                event.toEmail,
                `${event.status} · ${event.attempts}/${event.maxAttempts}`,
                <button
                  className="table-action"
                  disabled={event.status === "dead"}
                  onClick={() => run("retry_outbox_event", { outboxEventId: event.id })}
                  type="button"
                >
                  <RefreshCw size={14} />
                  Retry
                </button>
              ])}
            />
          ) : (
            <p className="empty-note">No stuck transactional emails.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function NichePages() {
  const niches = [
    {
      title: "Amazon sellers",
      copy: "FBA and FBM merchants with Amazon as the dominant inflow.",
      icon: <Landmark />
    },
    {
      title: "Relay carriers",
      copy: "Amazon Relay carriers whose cash flow needs a funder that understands the descriptor.",
      icon: <FileCheck2 />
    },
    {
      title: "DSP operators",
      copy: "Delivery service partners with Amazon-linked revenue that generic desks misread.",
      icon: <Sparkles />
    }
  ];

  return (
    <section className="page-grid">
      <div>
        <p className="eyebrow">SEO/content seed</p>
        <h1>Amazon economy files belong in one focused desk.</h1>
        <p>
          These pages are intentionally basic in Phase 0-2. The owned content loop expands only
          after the first funded deal proves the desk.
        </p>
      </div>
      <div className="niche-grid">
        {niches.map((niche) => (
          <article className="niche-card" key={niche.title}>
            {niche.icon}
            <h2>{niche.title}</h2>
            <p>{niche.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProofItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="proof-item">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusPill({ state }: { state: RoutingState }) {
  return <span className={`status-pill ${state}`}>{state.replace("_", " ")}</span>;
}

function DataTable({ columns, rows }: { columns: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuthGate({
  title,
  description,
  render
}: {
  title: string;
  description: string;
  render: (session: BrowserSession | null) => React.ReactNode;
}) {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [loading, setLoading] = useState(!useDemoMode());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (useDemoMode() || !hasSupabaseBrowserConfig()) {
      setLoading(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  if (useDemoMode()) {
    return <>{render(null)}</>;
  }

  if (!hasSupabaseBrowserConfig()) {
    return (
      <ErrorPanel
        title={`${title} needs Supabase`}
        message="Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or leave demo mode enabled for local review."
      />
    );
  }

  if (loading) {
    return <LoadingPanel label={`Checking ${title} session`} />;
  }

  if (session) {
    return (
      <>
        <div className="session-bar">
          <span>{session.user.email}</span>
          <button
            onClick={() => {
              void getSupabaseBrowserClient().auth.signOut();
            }}
            type="button"
          >
            Sign out
          </button>
        </div>
        {render(session)}
      </>
    );
  }

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const supabase = getSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
    }
  }

  async function sendMagicLink() {
    setError("");
    setNotice("");
    if (!email) {
      setError("Enter an email address first.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href }
    });
    if (otpError) {
      setError(otpError.message);
      return;
    }
    setNotice("Magic link sent. Open it in this browser to continue.");
  }

  return (
    <section className="auth-page">
      <div className="auth-panel">
        <p className="eyebrow">{title}</p>
        <h1>Sign in to continue.</h1>
        <p>{description}</p>
        <form className="stack" onSubmit={signInWithPassword}>
          <label>
            Email
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.currentTarget.value)}
              placeholder="you@firm.com"
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.currentTarget.value)}
              placeholder="Optional if using magic link"
              type="password"
              value={password}
            />
          </label>
          <div className="auth-actions">
            <button className="primary-action" disabled={!password} type="submit">
              Sign in
              <LockKeyhole size={18} />
            </button>
            <button className="secondary-action" onClick={sendMagicLink} type="button">
              Send magic link
            </button>
          </div>
        </form>
        {notice && <p className="success-note">{notice}</p>}
        {error && <p className="form-error">{error}</p>}
      </div>
    </section>
  );
}

function ErrorPanel({ title, message }: { title: string; message: string }) {
  return (
    <section className="loading-panel">
      <div className="error-panel">
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
    </section>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <section className="loading-panel">
      <span className="loader" />
      <p>{label}</p>
    </section>
  );
}

function decisionLabel(decision: string) {
  return decision.replace("_", " ");
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(amount);
}

export default App;
