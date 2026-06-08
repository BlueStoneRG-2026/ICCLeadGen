export const rateLimitPolicies = {
  certSignupIp: {
    keyPrefix: "cert-ip",
    limit: 1,
    windowMs: 60 * 60 * 1000
  },
  certSignupDomain: {
    keyPrefix: "cert-domain",
    limit: 1,
    windowMs: 24 * 60 * 60 * 1000
  },
  intakeIpHourly: {
    keyPrefix: "intake-ip-hour",
    limit: 5,
    windowMs: 60 * 60 * 1000
  },
  intakeIpDaily: {
    keyPrefix: "intake-ip-day",
    limit: 10,
    windowMs: 24 * 60 * 60 * 1000
  },
  submissionsPerDay: {
    limit: 3,
    windowMs: 24 * 60 * 60 * 1000
  },
  provisionalSubmissionCap: 1
} as const;

