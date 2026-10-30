# AEON Cabinet Intelligence · SNRG Labs

This repository contains the existing Next.js frontend. Customer documents, catalog prices, supplier purchase factors, credentials, original workbooks and runtime records remain in the separately operated backend and must never be committed here.

## Internal operation

Install existing dependencies, then run `pnpm exec next build --webpack`. The build enforces TypeScript checks.

Configure these server-side variables through the approved secret-management mechanism:

- `CABINET_INTERNAL_BRIDGE=1` and `CABINET_API_ORIGIN`: the allowlisted loopback backend origin.
- `CABINET_INTERNAL_USERNAME`, `CABINET_INTERNAL_PASSWORD`, `CABINET_SESSION_SECRET`: existing internal login; session secret must be at least 32 characters.
- `CABINET_PRINCIPAL_SECRET`: shared with the trusted backend principal verifier.
- `CABINET_ORGANIZATION_ID`, `CABINET_INTERNAL_ROLE`: organization and an explicitly assigned platform role (admin, estimator, reviewer or viewer).

The backend must enable authenticated mode and explicitly assign its supplier catalogs and any retained legacy source-review inventory to the intended organization. No credential values belong in shell examples or source control.

Start the internal Next.js server on loopback. Use an authenticated tunnel for remote review. The bridge is disabled without its opt-in flag, rejects public Host headers and requires sign-in. This frontend does not independently authorize a public customer deployment.

## Connected workflow

The private bridge connects project creation, PDF upload, checkpointed drawing reading, evidence rendering, exact-version item review, actual manufacturer matching, an independent pricing ledger, original-workbook population, forced formula recalculation, reconciliation and retained artifact history. Supplier pricing policy is retrieved from the authorized backend instead of embedded in this public source.

The original native workbook and its recalculated version are separate retained artifacts. Missing scope, unresolved tax, unsupported products or a pricing discrepancy remain visible blockers. A populated or reconciled partial workbook is not a complete customer bid.

The source-index query uses actual retained sheet, unit and status records. It is deterministic retrieval, not autonomous architectural AI. Unanswered questions remain unanswered.

Professional proposal generation, complete source interpretation, commercial release, submission and archival require their verified backend stages. This frontend has no email, order or customer-release action.

Keep PDF plans, supplier spreadsheets, quote exports, environment files, OAuth tokens, logs, databases, screenshots and runtime output outside this public repository.
