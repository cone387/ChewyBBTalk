# Native contract cleanup implementation plan

> Execution: superpowers:executing-plans, with independent client/authentication work delegated under superpowers:dispatching-parallel-agents.

**Goal:** Remove the remaining former-framework runtime contracts and naming while preserving accounts, content, and recovery evidence.

**Architecture:** FastAPI serves canonical routes and typed input only. All clients adopt an explicit page envelope. A new Alembic revision converts password encodings without needing plaintext passwords; historical migrations remain frozen.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, React/TypeScript, React Native, Electron.

**Spec:** User-authorized cleanup following the repository audit in this conversation; current contract is recorded below.

## Global constraints

- Preserve business data, credentials, backup files and historical work records. Never run destructive cleanup against backend/var.
- Old migration support stays isolated under database/migrations and migration fixtures. Do not rewrite previous validation results.
- Canonical slashless API paths only; no format suffixes, action aliases, double-underscore filters or post_tags body field.
- Pages: items, total, page, page_size, has_more; feeds also total_count; comments also revision. Out-of-range pages return an empty page.
- Comments always paginate. Tags remain a complete array. Current date and ordering query semantics stay intact.
- Password encodings convert losslessly in revision 0004; runtime accepts native encoding only. Tokens use sub/purpose; cookies cb_session/cb_csrf and header X-CSRF-Token. Upgrade requires login again.
- API documentation: /docs, /redoc, /openapi.json. Refresh revocation: /auth/token/revoke.
- No deployment, production writes or deletion of backups is implied. Workspace edits are reviewable before release.

## Review focus

- Persisted pending submissions must resolve their receipt before retrying converted payloads.
- Existing password salts, algorithms and digest bytes survive conversion; malformed and disabled credentials remain unusable.
- Pagination reaches all records/comments without loops, duplicates or response-shape fallback.
- Old attachment paths embedded in data must produce usable canonical links without changing remote signed URLs.
- All removed inputs fail explicitly rather than silently broadening filtered requests.

## Tasks

- [x] HTTP contract: tests reject removed inputs and paths; implement native routing, strict query/body schemas, pagination and comments; update server tests and benchmark.
- [x] Authentication: rename token models, migrate password encoding/column and revocation timestamp; update token claims, cookies, CSRF and authentication tests.
- [x] Clients: migrate Web/mobile page types and consumers; remove protocol fallbacks; verify module tests and type checks.
- [x] Desktop and operations: migrate saved draft payloads and pending retry flow; update proxy, probes and current documentation; verify tests.
- [x] Integration: run full backend and client suites, schema migration checks and review; build current backend artifact; inspect diff/root layout and report retained historical scope.

## Validation

Run backend pytest using the existing virtual environment; client npm test/type checks using each module's existing scripts. Use temporary databases only until migration validation passes. Root layout and git diff --check must pass at completion. Record actual results in docs/native-contract-cleanup.md.
