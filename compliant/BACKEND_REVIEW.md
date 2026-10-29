# Compliant backend review — October 29, 2026

Published base: a00a15b91f71ad40919cdc8ab7b32b81159b126e. Existing Stage 3A
investigation files were preserved unchanged. No commits or pushes are part of
this review. Timetable integration facts are in TIMETABLE_BACKEND_CONTRACT.md.

## Confirmed fixes

Academic management now catches session-end failures separately, emits a constant
safe diagnostic, and preserves either the original operation error or acknowledged
success. It does not retry a write or claim rollback based on a cleanup error.
The primary failure remains generic through the service where appropriate.

The academic form invalidates pending reads/submissions on pagehide/pageshow.
After each await, stale submission continuations cannot POST using a newly restored
page, reset a new draft, render old success/errors or re-enable another page's
controls. Repeat submission and date/list paging are blocked while saving. Already
dispatched POSTs cannot be undone by browser navigation; check the list after an
uncertain response. No idempotency key or automatic submission retry was added.

Regression coverage uses a lightweight VM/DOM model, synthetic HTTP repositories
and fake transactions, not a real browser or MongoDB server. Callback-replay tests
check stable generated IDs/timestamps; uncertain-commit tests deliberately model a
persisted record despite a rejected result. They are NOT database atomicity proof.

## Reviewed behavior retained

Identity and roles come from fresh server sessions/repository reads; configured
scope is exact, including null vs named scope. Resource/audit inserts remain
sequential in the same transaction. Only matching resource unique-key violations
become 409; audit/ID collisions stay sanitized failures. Ready checks refuse
missing/incompatible validators/options/indexes without repair. Authenticated
scope revocation is checked per request and inside a create transaction; this
is not a promise to cancel an operation after a concurrent revocation commits.

## Stage 3A remains blocked

No isolated real-MongoDB environment is currently approved for this task. The
uncommitted investigation provides reproducible pinned-driver control-flow tests,
not server ownership evidence. The preparation script remains unchanged and must
not be executed: it can leave one empty collection then refuse indexes. Counts,
UUIDs, markers, client transaction states, resolved abort promises and missing
unknown-commit labels cannot independently establish creation/rollback outcomes.

Minimum next experiment, after explicit approval: one fresh labelled disposable
MongoDB 8.0.34 replica set, loopback port 27029, tmpfs for BOTH DB directories, no
volumes/mounts, a unique new database and independently verified container/server
identity. Test one collection's explicit transactional create plus raw index
command, no-op replies, concurrent creators, lost acknowledgements, actual catalog
rollback and process crash/recovery. Do not use the persistent demo endpoint or
relax its exact guards. Only then review any provisioning implementation/marker.

## Demonstration limits and startup

The authenticated app's startup/readiness path is read-only and requires the
existing nine baseline collections with compatible validators/indexes. Neither
configuration nor live compatibility was inspected here. No .env.demo was read.
From this worktree's compliant/ directory, the authenticated entry point is:

```powershell
npm run start:mongo
```

That command requires separately approved process configuration. npm run start:demo
requires a local .env.demo, which has not been provisioned here. Do not run setup
or copy configuration automatically. A separately approved read-only reference to
the original ignored configuration is possible using Node's --env-file, but
validate its exact local target and startup settings without printing them first.
The database-free npm start serves the shell with auth unavailable, not a demo
identity. Login/logout write sessions/audit; normal authenticated use needs write
authorization. Existing unexpired sessions may support reads, but were not checked.
Stage 3B writes additionally require provisioned academic schema; do not present
those writes or timetable integration as live-verified.

## Verification in this worktree

Baseline: focused investigation/management tests 43 passed; npm test 226 passed.
After fixes: focused management tests 29 passed; npm test 236 passed, zero failures,
skips or cancellations. All 69 authored JavaScript files passed node --check;
git diff --check passed. The historical TypeScript-stripping oracle warning is
expected. These checks used no real database and no interactive browser.
