# Iron Crown File Desk Landing Page

This folder contains the self-contained Iron Crown File Desk acquisition landing page.

It is intentionally isolated from the Phase 0-2 app: it does not depend on `src/`, Netlify Functions, the app build, or app package scripts.

Deploy `landing/file-desk/` as the static source root for the Iron Crown marketing site. The route content lives in `file-desk/`, so it serves at `/file-desk/` while the referenced image assets live in `images/`. This keeps the File Desk landing page deployable without touching any existing ICC pages.
