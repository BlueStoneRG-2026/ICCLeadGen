# Iron Crown File Desk Landing Page

This folder contains the self-contained Iron Crown File Desk acquisition landing page.

It is intentionally isolated from the Phase 0-2 app: it does not depend on `src/`, Netlify Functions, the app build, or app package scripts.

When packaging for the Iron Crown marketing site, include only the nested `file-desk/` directory as the deployable route folder. The entire deploy footprint lives under `/file-desk/`, and all landing assets resolve below `/file-desk/` without touching any existing ICC pages or the existing site-level `/images/` folder.
