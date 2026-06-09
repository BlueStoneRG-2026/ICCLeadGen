# Deploy Checklist

`docs/DEPLOY_RUNBOOK.md` is the single source of truth for production deploy.

Use this file only as a pointer for older review links:

- Authoritative ordered runbook: `docs/DEPLOY_RUNBOOK.md`
- Production env template: `.env.production.template`
- Day-1 operator guide: `docs/OPERATOR_GUIDE.md`
- Production readiness gate: `npm run readiness:prod -- --env-file .env.production`

Do not deploy from this checklist alone.
