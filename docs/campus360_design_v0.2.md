# Campus360 — Initial Product & Technical Design

**Document version:** 0.2 — consolidated after first independent review round  
**Date:** 23 October 2026  
**Status:** Review-consolidated planning baseline; suitable for Phase 0 decisions and controlled foundation coding, subject to the release gates in §1.3  
**Basis:** User's handwritten feature sketch, `index_v2(2).html` Campus360 prototype, and four independent AI reviews (Gemini 3.1 Pro High, Claude Sonnet 5.5 Low, DeepSeek DeepThink, and GLM 5.3 Max)  
**Intended audience:** Student project team, coding assistants, reviewers, and the instructor

> **How to read this document**  
> **Source requirement** means the item appears in the supplied sketch or HTML prototype. **Recommendation** means a proposed improvement to make the system useful, robust, or secure. **Decision pending** means the team/instructor must confirm it. Other AI reviewers must preserve these distinctions and must not silently turn assumptions into requirements.

---

## 1. Executive summary

Campus360 is a role-aware college operations and student self-service website. Its purpose is to bring student records, academic activity, attendance, assessment, results, achievements, fees/receipts, transport, events, campus communication, and complaints into one coherent system. It should be useful for everyday work—not merely a set of attractive dashboards with simulated figures.

The existing HTML prototype provides a strong visual starting point: a dark navy interface, violet/mint accent colours, glass-like cards, a collapsible side-navigation pattern, dashboard metrics, charts, academic tables, calendar, bus panel, student-connect feed, complaint screen, driver console, and admin console. Keep the visual identity as a design reference, but rebuild the application behavior using reusable components and a real data layer. The prototype is not a backend: its values and many interactions are demonstration content and must not be presented as real institutional data.

### 1.1 Recommended default technical direction

For the first working version, optimize for development speed and low operational burden:

- **Application:** Next.js App Router, React, TypeScript, and a modular-monolith architecture.
- **UI:** Tailwind CSS plus shadcn/ui (Radix primitives), Lucide icons, React Hook Form, and Zod.
- **Data:** Managed PostgreSQL, recommended initially through Supabase; SQL migrations stored in Git.
- **Identity and files:** Supabase Auth and private Supabase Storage buckets, with server-side permission checks and database Row Level Security (RLS).
- **Hosting:** Vercel for a Next.js deployment, with Supabase as the managed data platform. Keep the app portable enough to run in Docker/another Node host if hosting constraints change.
- **Charts/tables/calendar/map:** Recharts, TanStack Table, a maintained calendar package, and Leaflet with a properly licensed/contracted tile provider.
- **AI assistant:** Vercel AI SDK for provider abstraction and streaming, backed by a strict server-side tool registry. Start with read-only navigation/help tools, then add explicitly confirmed draft actions. Test a cloud API and a self-hosted model behind the same interface.
- **Testing:** Vitest, React Testing Library, Playwright, and database/RLS policy tests.

This is a recommendation, not a claim that these are the only suitable technologies. The instructor's required stack, access to hosting, budget, and the team's experience take precedence. The latest vendor docs and plan limits must be checked before implementation and deployment.

### 1.2 Non-negotiable principles

1. A displayed number must come from persisted data or be clearly labelled as a demo/example.
2. UI visibility is not authorization; the backend and database must enforce access.
3. The user account's verified roles determine permissions. A role tile or URL parameter cannot grant privileges.
4. AI can explain, search, prepare, and navigate, but it cannot bypass application permissions or independently execute high-impact changes.
5. Attendance, marks, fees, identity, complaints, chat, and GPS are sensitive; collect only what is required and restrict access by role and context.
6. Implement complete end-to-end workflows in priority order instead of building many disconnected screens.
7. Make key decisions once, document them, and require all coding models to follow the same specification.

### 1.3 Consolidated review decisions and code-generation gate

Four independent reviews converge on the same conclusion: v0.1 is a strong baseline, but too many requirements were left at principle-level detail and the P0/P1 set was too broad to act as an achievable contract. This revision adopts the high-confidence, cross-model findings while preserving the source feature list and marking unresolved policy choices rather than silently inventing answers.

**Accepted in v0.2:**

- Freeze a dependency-ordered MVP with objective exit criteria. Student Connect/chat, predictive analytics, payment gateway work, email/SMS delivery, and a full quiz engine are deferred unless the rubric makes them mandatory.
- Define a concrete Supabase access rule: ordinary server reads/writes use a verified user identity and least-privilege, user-scoped database access where practical; RLS is enabled and tested for every exposed table. A service-role credential, which bypasses RLS, is confined to narrowly named trusted server operations and is never used in browser code or as a shortcut around authorization.
- Make important audit records append-only to application roles, written through controlled server/database paths, with no ordinary application `UPDATE`/`DELETE` rights. Do not call the log absolutely tamper-proof against a database owner.
- Explicitly forbid the prototype's temporary-password toast, fake payment success, fake “AUTO-TRACKED” attendance, random/live-looking bus movement, fabricated AI score predictions/confidence bands, and success messages that do not correspond to persistent records.
- Specify scoped access, immutable/versioned correction paths for attendance and published marks, private file access, CSV limits, backup/restore checks, and audit-able moderation.
- Limit the first AI release to help, fixed-page navigation and role-scoped read-only tools; any side effect is a proposal requiring a separate user confirmation and renewed server authorization.
- Treat transport GPS as a feasibility spike with an honest schedule/stop-check-in fallback; do not let an unreliable mobile-background-GPS assumption block the academic core.
- Add a data-governance gate: use synthetic records by default and do not process real student data until the institution has approved the intended use and the team has verified applicable current privacy obligations.

**Still open:** the assignment's mandated stack and rubric; team/deadline; result/KTU scheme and allowed import source; the exact receipt-verification role; Teacher Connect semantics; the meaning of the handwritten “SAV” item and special-day note; and whether a cloud AI API budget is permitted. Safe working defaults are recorded in the relevant sections. No reviewer can resolve these from the supplied materials alone.

**Code-generation verdict:** It is appropriate to begin *controlled foundation implementation* after the instructor-required stack has been confirmed (or approved as Next.js/TypeScript/PostgreSQL/Supabase) and the MVP cut-line has been recorded. Start with repository/tooling, migrations, synthetic seed data, auth/roles, the row-level authorization matrix, audit baseline, and a single protected vertical slice. Do **not** hand a coding model the instruction to build the whole site, do not enable real personal data, and do not build chat, payment processing, predictive analytics, or AI writes as part of the first coding pass. The remaining module-specific questions can stay open while their modules are deferred.

---

## 2. Source review and current prototype assessment

### 2.1 Features present in the handwritten sketch

The sketch groups functions into student, teacher, staff/driver, and administrator areas.

**Student area — source requirements**

- Student information: name, registration number, course, branch, email ID, and phone.
- Daily attendance information.
- Results: internal assessment (IA), semester results, and credit-related information; the note refers to KTU.
- Achievements: certificate uploads, internship information, and activity-points viewing.
- Fees and receipts.
- Bus live location.
- Complaint box.
- Student Connect with “sell/give” and “post/chat” concepts.
- Calendar with upcoming events.

**Teacher area — source requirements**

- Teacher information/profile.
- Notes uploaded by semester, department, and subject/context.
- Uploading activity points and marks.
- Event calendar.
- Teacher Connect/communication.
- Quizzes/tests with time limits and assignments. The lower part of the handwritten note is unclear, so any extra quiz-related capability beyond timed quiz/test and assignment handling is an open question.

**Staff/driver area — source requirements**

- Live bus location.
- Receipt verification for students (the exact staff role responsible needs confirmation).
- Bus timings for normal class days, examination days, and special campus days/events. A handwritten event name/acronym is unclear and should not be guessed.
- Bus stops.
- Number of students/teachers on the bus.

**Administrator area — source requirements**

- Add/remove staff and student accounts (the note mentions pre-created/sample accounts as well).
- View flagged chats.
- View overall activity log.
- Manage staff passwords.

**Interpretation note:** “Teacher connect,” “receipt verification,” “special campus day,” and a few overwritten words are ambiguous. The implementation plan should preserve the broad intent and ask the team/instructor to clarify the exact workflow before coding those details.

### 2.2 Features present in `index_v2(2).html`

The prototype is titled **Campus360 — Smart Campus Prototype** and has the following navigation/screens:

- Dashboard with attendance, GPA, activity points, bus ETA, academic performance, AI academic insight, and campus pulse.
- Student Directory with search/export/add-student affordances.
- Academics: assignments, quizzes/tests, notes library, and marks upload.
- Semester Results with KTU-related display, credits, SGPA/CGPA, and subject results.
- Subject-wise Attendance and monthly attendance visualization.
- Achievements: activity points, certificates, internships.
- Fees & Receipts with a fee ledger and receipt affordances.
- Bus Tracking with route status, ETA, distance, speed, stops, and timings.
- Calendar and event list.
- Student Connect: posts, sell/give marketplace, and chat.
- Complaint Box with categories, optional anonymous submission, and complaint history.
- Analytics & ML: score trajectory, what-if attendance simulator, and at-risk student table.
- Driver Console: route control, boarding manifest, and fee-receipt verification.
- Admin Console: user management, flagged chats, activity log, and password-related actions.

The prototype also establishes the visual direction: fixed sidebar, role-aware navigation concept, command/search palette, notifications, dashboard cards, tables, toasts, calendar cells, charts, mobile breakpoints, and reduced-motion handling.

### 2.3 What is and is not implemented in the HTML

The supplied file is a single-page HTML/CSS/JavaScript prototype with around 1,560 lines. It contains no `fetch()` calls and no `localStorage` use in its inline script. Several interactions operate on in-memory/sample data; `Math.random()` is used by some demo behavior. There is no production authentication provider, server API, database persistence, trusted audit system, actual AI API integration, real GPS pipeline, or payment integration shown in the file.

Consequences:

- A toast saying an action succeeded is not proof that a record was saved.
- Simulated bus movement must not be described as real-time tracking.
- The role tiles or role selector in the UI must not become the security model.
- Mock grades, fees, attendance, predicted scores, student identities, and “live” labels must be replaced with verified data or clearly marked demo seeds.
- Any AI-generated “prediction,” academic-risk status, or confidence interval must be treated as a placeholder until there is a validated dataset, method, and human review process.

### 2.4 Prototype design to retain and improve

**Forbidden demo behaviours (must not be carried into the real application):** no role switch that grants privileges; no success toast unless the state change is actually persisted; no “Pay now” button that marks a fee paid without an actual verified payment event; no temporary password shown to an admin; no “AUTO-TRACKED” attendance label without a real source; no random route motion or unverified ETA/speed presented as live; no invented result/credit scheme; no random unstable complaint/reference number; no fabricated “AI insights,” predicted-score bands, or confidence intervals presented as validated analytics; and no notification preview that exposes grades or personal data on shared screens. These can appear only in a clearly labelled synthetic prototype/test fixture.

**Retain:** the Campus360 name, dark visual theme, violet/mint accent palette, clear left-side navigation, role-specific home experiences, cards, tables, calendar, activity feed, bus panel, and quick navigation/search concept.

**Improve:** reduce always-on effects and blur for performance; respect reduced-motion settings; ensure readable font size and contrast; use visible field labels; support keyboard-only navigation and screen readers; add strong empty/loading/error states; make mobile navigation usable rather than merely shrinking the sidebar; show actual timestamps and data freshness on attendance, bus, and notification data; make destructive/irreversible actions explicit; and avoid showing unsupported ML numbers as facts.

---

## 3. Product goals, non-goals, and assumptions

### 3.1 Goals

- Provide one dependable entry point for day-to-day student and academic workflows.
- Give each role a dashboard that is useful to that role, not one generic page filled with unrelated statistics.
- Reduce manual duplication of student/course/attendance/marks/receipt information.
- Provide traceability for changes to important academic, financial, and administrative records.
- Make routine actions fast with search, filters, bulk import where appropriate, notifications, clear forms, and receipt/confirmation views.
- Make it straightforward for a user to understand how to do something, including through an optional AI site guide.
- Keep the system modular enough that a different AI model, AI vendor, hosting provider, or developer can continue the work using project documentation.

### 3.2 Non-goals for the first release

- Replacing the institution's official student information system or financial/ERP system unless specifically required.
- Scraping KTU or another official website to infer results without a documented, permitted data source/API.
- Accepting real online payments in the first release. A fee ledger and receipt-verification workflow is sufficient unless payments are explicitly required and approved.
- Building microservices, event streaming infrastructure, a custom machine-learning stack, or a custom chat protocol before the basic workflows need them.
- Letting AI autonomously change grades, mark attendance, approve fees, reset accounts, or make disciplinary decisions.
- Claiming legally compliant operation solely because common security features are present; real deployment needs institutional approval and current legal/privacy review.

### 3.3 Assumptions to confirm

- The first target is a class project/demo, not an immediately production-authorized college deployment.
- The institution uses an academic hierarchy of department/program/course/subject/semester, with sections or class groups as needed.
- Students and staff have accounts linked to institutional records.
- The first version may use seeded demo data, but it will be labelled as demo data and will not be mixed with real records.
- KTU-related result/credit display is required by the source sketch, but the exact scheme, fields, calculation rules, and data import/source method remain to be confirmed.
- The project team can use Git and environment variables, and can deploy a web app with a managed database if allowed.
- **Privacy gate:** development and evaluation use synthetic student/staff data by default. Real identifiable data requires prior institutional approval, a documented purpose and applicable lawful processing basis, a data inventory/retention plan, access controls, and confirmation of the laws/rules that have commenced and apply at deployment time. Show an appropriate privacy notice and record consent where consent is the selected legal basis; do not assume that generic consent is always the only lawful basis or that accepting a notice automatically makes processing lawful. DPDP Act/Rules requirements have a phased commencement/transition; do not treat November 2025 notification as proof that every obligation became operative on that date. Obtain qualified guidance for real deployment; this document is not legal advice.
- **Special-day schedules:** the handwritten event name/acronym is unreadable. Store generic configurable overrides; do not hardcode a guessed event name.
- **Admin “SAV” note:** preserve as illegible/unconfirmed until the owner or instructor clarifies it.

---

## 4. User roles, permissions, and operating model

The app must use **least privilege**: grant only the actions required for a role, and scope those actions to the person's assigned class, department, route, or responsibility.

### 4.1 Student

Can view their own profile, current enrolments, attendance, permitted marks/results, published notes, assignments/quizzes, their own submission receipts, activity points and verified achievements, fees/receipts, events, relevant bus routes, their own complaints, and permitted Student Connect content. Can update limited contact/preferences fields, submit assignments, submit certificate/activity claims, create complaints, and post/chat subject to campus policies.

Must not change their registration number, results, official attendance, fee ledger, verification status, another person's records, or staff-only content.

### 4.2 Faculty/teacher

Can view and manage the course sections assigned to them; publish notes and assignments; create/publish quizzes within policy; record attendance for assigned sessions; enter marks for assigned assessments; view class-level academic summaries; respond to course communications; create campus/course events if authorized; and verify activity claims for assigned advisees/mentees if that process is approved.

Must not access unrelated departments/classes by changing IDs in URLs, edit another teacher's class without authorization, or change published marks/attendance without a traceable correction workflow.

### 4.3 Staff roles

Use distinct permissions rather than one unrestricted “staff” bucket. Potential scopes include transport driver, transport coordinator, finance/receipt verifier, and student-affairs/activity mentor. These specialized roles are recommendations; confirm which exist in the assignment.

**Driver/transport staff:** can view their assigned route/trip, stops, schedule, a minimized boarding manifest, and send location/stop/route status while a trip is active. The sketch explicitly places “receipt verification for each student” in the Staff/Driver area, but its exact meaning is unclear. Safe default: a driver/transport attendant may check a bus-pass/transport-receipt status for boarding only; they cannot edit the fee ledger or declare a bank/payment transaction settled.

**Finance/receipt verifier (recommended distinct permission):** if fee-ledger reconciliation is in scope, an authorized finance/admin user can inspect necessary receipt and payment-reference fields and record a verification result. This is an additional recommendation, not a silent replacement for the Staff/Driver source item. Do not expose unrelated academic records or credentials to this role.

### 4.4 Administrator

Can create/deactivate accounts, assign roles through a controlled workflow, manage academic structures, resolve flagged content, view scoped activity/audit logs, configure events/transport where granted, and review system health. Use separate permissions for high-impact actions. Admin access should require MFA where the chosen identity provider supports it.

The handwritten note says “manage passwords.” **Security decision (supersedes the prototype):** admins may issue invitations or trigger expiring password-reset links, require password reset, or disable an account. They must never view existing passwords or display a generated temporary password in the UI; credentials are handled by the identity provider. The prototype's temporary-password toast is explicitly forbidden in the rebuilt application.

### 4.5 Role model requirements

- The role shown in the frontend is a convenience, not a security boundary. Every Server Action, Route Handler, RPC, database access path, and AI tool execution must check authentication and authorization inside the operation; a middleware or hidden button alone is insufficient.
- Derive requester identity from a verified session/token. Load roles and scope/assignment data from a trusted source; validate inputs with shared schemas (such as Zod); never trust a user ID, role, department, or ownership claim supplied in the request body.
- Scope faculty access to assigned course offerings/sections, transport staff to assigned routes/trips, complaint handlers to assigned cases, and finance staff to approved receipt/ledger responsibilities. A broad role label is not enough by itself.
- Routine signed-in data operations must preserve the verified user's identity and RLS context. Enable RLS on every client-exposed table and keep database grants aligned with policies. A Supabase service-role credential bypasses RLS; it must never be shipped to the browser or used as the ordinary client for domain operations. Any use is server-only, explicitly documented, narrowly scoped, re-authorized in application code, and audited.
- Keep a role × table × operation/action matrix in `docs/security.md`. Test `SELECT`, `INSERT`, `UPDATE`, and `DELETE`/deactivation as appropriate using actual test accounts/JWTs, plus actions such as exporting a directory, viewing a complaint identity, downloading a file, releasing marks, and starting an assigned trip. Both allowed and denied cases are required.
- Support multiple roles only through an explicit, auditable assignment and scope. A user cannot promote themselves by editing a profile, cookie, local storage, request body, or user-editable metadata.
- Important audit events must be written through controlled server/database paths. App roles cannot update/delete audit rows; this reduces ordinary tampering but is not a guarantee against a privileged database owner.

### 4.6 Explicit source deviations and defaults

- **Staff/Driver receipt verification:** preserve it as a source requirement. Until clarified, implement only a transport-fee/bus-pass check for the assigned trip; financial ledger reconciliation remains a separate permission/workflow.
- **Teacher Connect:** safe default is a teacher directory plus course announcements. Direct private messaging is deferred until its scope, moderation, access policy and retention rules are approved.
- **Student Connect:** the sketch contains “sell/give” and “post/chat,” but the complete marketplace and direct-chat module is deferred past the MVP unless the rubric requires it.
- **Attendance “Day info”:** store attendance at session granularity (one class/subject/session) and derive daily/term summaries from those records; confirm institution-specific attendance calculations and duty-leave treatment before showing percentages.
- **Activity points:** the sketch says teachers upload activity points/marks. The claim/verification flow is a recommended control; the assignment of verifier must be confirmed.
- **“SAV” and the event name beside bus timings:** illegible source text, not a requirement until clarified. Use generic configurable special-day schedule overrides in the meantime.

---

## 5. Functional requirements and acceptance criteria

Priorities: **P0** = foundation required before useful features; **P1** = core feature set for the first demonstrable release; **P2** = advanced/optional expansion. Priority is a planning recommendation and can be changed when the assignment rubric is known.

### 5.1 Identity, login, profile, and dashboard (P0)

**FR-AUTH-01 — Sign-in and sign-out.** Users authenticate through the selected identity provider. Expired sessions are handled safely. Sign-out invalidates the app session according to the provider's supported pattern.

**Acceptance criteria:** unauthenticated visitors cannot access protected data; invalid credentials receive non-revealing error messages; session expiry returns the user to a safe login state; secrets/tokens are not written to application logs.

**FR-AUTH-02 — Trusted role and role-scoped navigation.** After sign-in, the app loads the roles actually assigned to that account and displays allowed navigation options.

**Acceptance criteria:** changing the page URL or modifying client state does not grant access; a denied request returns an appropriate 401/403 response; a Student account cannot invoke an Admin API directly.

**FR-PROF-01 — Profile.** Display and edit permitted profile fields. Store registration number, email, phone, program/branch, semester, staff department, and account status in the appropriate records with validation and uniqueness constraints where applicable.

**Acceptance criteria:** duplicate registration numbers are rejected; a student can edit only approved fields; administrative identity fields require authorized staff changes and are audited.

**FR-DASH-01 — Role-specific dashboard.** Provide useful shortcuts and facts for the user's role: student attendance/deadlines/results/transport; teacher classes/attendance/mark-entry tasks; driver current trip/route; administrator operational counts and pending actions.

**Acceptance criteria:** all figures have a defined data source and “as of” timestamp where freshness matters; unavailable data is shown as unavailable, not fabricated as zero; every dashboard item links to the relevant underlying view.

### 5.2 Student directory and academic structure (P0)

**FR-STU-01 — Student directory and records.** Authorized staff can search, filter, view, create, update, and deactivate student records. Search can include name, registration number, program, semester, and status. Export is permission-controlled and logged.

**Acceptance criteria:** student access is limited to self; faculty sees only the records they need for assigned classes; exports are not available to everyone; duplicate identities are detected; deletions use deactivation/archival unless policy permits hard deletion.

**FR-ACAD-01 — Academic hierarchy.** Maintain departments, programs/courses, academic terms/semesters, subjects, class sections/course offerings, faculty assignments, and student enrolments.

**Acceptance criteria:** an enrolment references a valid student and class offering; a teaching assignment references a valid staff member and section; term/semester is explicit; the system prevents duplicate enrolment in the same offering.

**Recommendation:** use a relational database rather than unstructured nested records for this data, because attendance, marks, users, classes, receipts, and routes have relationships and transaction requirements.

### 5.3 Attendance (P1)

**FR-ATT-01 — Session-based attendance.** Faculty opens an attendance session for an assigned class/date and records present/absent plus any institution-approved categories such as late, on-duty, or excused. Store the responsible teacher, timestamp, and class/session.

**FR-ATT-02 — Student view and alerts.** Students view subject-wise and overall attendance for the selected term, the counted sessions, any excluded categories, and configurable thresholds.

**FR-ATT-03 — Corrections.** Attendance corrections after submission require permission and a reason. Model the correction as a separate, attributable record containing original status, proposed status, requester, reason, timestamp, and approval/application state. The original submitted value remains available to authorized auditors; do not silently overwrite it.

**Acceptance criteria:** percentages are calculated from saved records using a documented institution-approved formula; denominator and any duty-leave treatment are visible; students cannot alter records; duplicate submissions are idempotent or rejected; corrections are auditable; a correction does not become effective until an authorized workflow applies it. Whether a second-person approval is mandatory is an institutional policy decision; self-approval should be prohibited for published/high-impact records unless a documented policy explicitly says otherwise.

### 5.4 Notes, assignments, quizzes, and marks (P1)

**FR-TEACH-01 — Notes/material library.** Faculty uploads files tagged by subject/course, department/program, semester/term, title, type, publisher, and publication date. Students can search/filter and download notes only for authorized/relevant courses.

**FR-ASGN-01 — Assignment workflow.** Teachers create assignments with description, attachments, due date, allowed file types, size limit, and enrolment scope. Students submit files/text, can see submission status, and receive a server-generated submission receipt.

**FR-QUIZ-01 — Timed quizzes/tests.** Full quiz functionality is deferred unless required by the rubric. The first version, if built, is limited to basic auto-graded multiple-choice questions, one attempt by default, server-recorded `started_at`/`expires_at`, and a documented submit/auto-submit rule. The client timer is only a display; server time is authoritative. Do not add proctoring, complex question randomization, essay grading, or AI question generation without a separate approved requirement.

**FR-MARK-01 — Marks upload and result display.** Teachers enter marks for assessments assigned to their sections and publish them according to a defined workflow. Students see only their own released results. Maintain IA and semester/end-semester fields if required by the rubric. Store assessment maximums and scheme/year/calculation rules as data/configuration, not hardcoded UI constants. The KTU reference does not authorize scraping; use manually entered records or a supervised, validated CSV import unless an approved integration is documented.

**Correction and publication rule:** draft marks may be edited by the authorized teacher within scope; published marks are not silently overwritten. A correction stores the old value, proposed new value, reason, requester, approval state, approver, and timestamps. The original remains available to authorized auditors, while the student view exposes only the latest approved/released value.

**Acceptance criteria:** uploaded/submitted files are private by default; allowed file types/sizes are enforced server-side; receipt time is server-generated; deadline enforcement uses server time; a student cannot change quiz time or another student's submission by editing the client; maximum marks and assessment ownership are validated; mark corrections are reasoned and audited; draft/unreleased marks remain hidden; a result record includes its source/verification status and is not represented as an official KTU result unless it came through an approved source.

**Decision pending:** whether end-semester results are manually entered/imported or officially integrated, and which KTU scheme/year and calculation rules apply. Do not assume an undocumented formula or scrape a website.

### 5.5 Achievements, activity points, certificates, and internships (P1)

**FR-ACT-01 — Activity points.** Students can view points by approved category (the sketch mentions technical, arts/culture, sports, and social outreach in the prototype). Points and categories are configurable; verified totals come from saved activity records.

**FR-ACT-02 — Certificate/achievement claims.** Students submit certificate documents/details. An authorized mentor/reviewer approves, rejects, or requests clarification with a reason. File and status changes are logged.

**FR-INT-01 — Internship portfolio.** Students can add internship records (organization, role, dates, description, mentor/contact if institution policy permits, supporting evidence, status). Mark verified/completed only through an approved workflow.

**Acceptance criteria:** uploaded evidence is private; the student cannot approve their own claim; totals recalculate from verified approved entries; rejected submissions can be corrected/resubmitted; duplicate claims can be flagged.

### 5.6 Fees and receipts (P1)

**FR-FEE-01 — Fee ledger.** Show fee heads/charges, term, amount, due date, scholarship/waiver adjustment if required, payment or credit entries, balance, and status. A ledger must preserve a history of changes.

**FR-FEE-02 — Receipt view and verification.** Students see/download receipts for their own transactions. The sketch places “receipt verification for each student” in the Staff/Driver area; exact meaning is an **open decision**. Safe default: assigned driver/transport attendant can check an already-recorded bus-pass/transport-receipt status for boarding, but cannot edit a fee ledger or mark a payment as settled. If a separate finance-verification workflow is in scope, an authorized finance/admin user can record verified/unverified/needs-review status and reasons. If receipts are uploaded by students, verify details through an approved method; an uploaded image alone is not proof of payment.

**Acceptance criteria:** the student cannot edit the ledger or verification result; payment/receipt state changes are audited; amount and currency are stored as exact decimal/currency values rather than floating-point display numbers; reconciliation mismatches are visible; receipts are private.

**Scope boundary:** online payment gateway processing is optional and not included in the baseline. If added, use a reputable gateway and never collect/store card PINs, CVVs, banking passwords, or UPI PINs in Campus360.

### 5.7 Transport: routes, schedules, live bus location, stops, manifest (P1; integration-dependent)

**FR-BUS-01 — Transport setup.** Authorized staff manage buses, routes, stops, sequence, schedule, route assignment, assigned driver, normal/exam/special-day schedule overrides, and active trips.

**FR-BUS-02 — Driver console.** A driver sees only their assigned trip/route, can start/end the trip, announce a stop, and mark passengers boarding/alighting if that is part of the approved process.

**FR-BUS-03 — Live location (time-boxed differentiator; integration-dependent).** Before committing to live GPS, run a small feasibility spike on the actual target phone/browser and network. With explicit device permission, the driver's page may send timestamped coordinates while an authorized trip is active and the page remains able to update. Do not promise reliable background tracking when the browser is closed, suspended, or the screen is locked. Default to foreground tracking and a configurable update interval (initial target 10–15 seconds). If continuous tracking is unreliable, use schedule/stop information plus an explicit driver stop-check-in/refresh fallback. If no real authorized source is available, use a deterministic synthetic route simulator labelled persistently **“Simulated route — not live GPS”**; never show a “LIVE” badge or real-looking speed/ETA as verified in simulation.

**FR-BUS-04 — Passenger/manifest counts.** Show counts of students/teachers on the bus only if the institution defines the manifest and the data source. Counts derive from boarding records, not hardcoded sample numbers. Display the minimum identity details necessary to the authorized driver.

**Acceptance criteria:** driver cannot start an unassigned route; location updates are accepted only for the driver's active assignment; stale state appears after a configurable threshold (initial default 45 seconds after the last update); access to location is limited to people with a legitimate trip-related need; location history is short-lived (initial default: purge detailed points after 24 hours unless the institution approves a different period); denied GPS permission/network outages produce an honest fallback without inventing a location. Synthetic mode is visibly labelled on every relevant view.

**Map implementation:** Leaflet is a candidate for map UI. OpenStreetMap data may be used with attribution, but public OSM tile servers are best-effort, have usage requirements, and are not a free unlimited production tile API. For a browser map, respect the current tile policy, including visible attribution, valid referer behavior, caching, and no prefetch/bulk tile downloading. Do not assume client-side JavaScript can set a custom `User-Agent`; browsers manage that header. Choose a suitable commercial or hosted tile provider if the demo's reliability/load needs exceed community tile-server terms.

### 5.8 Calendar and notifications (P1)

**FR-CAL-01 — Calendar/events.** Display academic dates, examinations, deadlines, college events, and transport schedule overrides as applicable. Events have title, start/end, audience/course/department scope, timezone, creator, and publication status.

**FR-NOT-01 — Notifications.** Display in-app notifications for published marks, upcoming deadlines, notes uploaded, attendance warnings, complaint status, route updates, and relevant events. Let users mark read and set non-essential notification preferences.

**Acceptance criteria:** event visibility follows audience/role rules; event edits are attributable; dates/timezones are consistent; notification content avoids leaking marks or personal details on shared screens; failed external email delivery does not silently erase in-app notification state.

### 5.9 Student Connect: posts, marketplace, chat (P2, but shown in prototype)

**FR-CON-01 — Campus posts.** Users can publish and view approved campus posts, with author, timestamp, category, and report/block options.

**FR-CON-02 — Sell/give marketplace.** Students can list items as selling or giving away, including description, price if applicable, category, condition, images, availability/status, and preferred contact method. It is a bulletin board in the baseline, not an integrated payment/escrow service.

**FR-CON-03 — Messaging (deferred).** Direct messaging is not part of the MVP. If enabled later, authenticated users can message only within defined campus rules and approved conversation scopes. Provide reporting, blocking, rate limits, retention rules, and a moderation workflow. Do not grant administrators blanket access to every private conversation.

**FR-MOD-01 — Report-driven content review.** Authorized moderators/admins can review reported posts/messages, record actions and reasons, and prevent a reported item from being repeatedly surfaced while under review. Default design: a report creates a bounded snapshot of the reported content plus only the context needed to investigate it; moderators can access that snapshot, not browse all unreported private conversations. Broader monitoring needs an explicit policy decision and privacy review. The interface must disclose that reported content may be reviewed according to campus policy.

**Acceptance criteria:** posted content is rendered safely; direct message records are not exposed in public API responses; one user cannot impersonate another; reports have status and an audit trail; attachment uploads follow file security controls; every moderator access to a report/snapshot is logged with actor, timestamp, report/message IDs and reason; attempts to access an unreported private conversation are denied by default.

### 5.10 Complaint box (P1)

**FR-COMP-01 — Complaint submission and tracking.** A user submits a categorized complaint (academics, hostel, transport, facilities, other—categories shown in the prototype), description, optional evidence, and receives a reference number/status. Staff can assign, update, and resolve complaints within their scope.

**FR-COMP-02 — Confidentiality/anonymity mode.** Do not label a complaint “anonymous” merely by hiding the author name in the UI. The MVP default is **confidential complaint**: ordinary handlers can process the complaint without seeing the reporter's identity, while a separately designated data-custodian role may access identity only for a documented reason, and that access is audited. If a truly anonymous mode is later offered, specify which account, IP/network, device, and application metadata are retained or not retained and have the institution approve the wording. Never promise absolute anonymity when the system or hosting path cannot guarantee it.

**Acceptance criteria:** keep reporter identity in a separately permissioned mapping/table (for example `complaint_reporter_map`) rather than directly available to ordinary handlers; ordinary complaint queries/exports return no identity; identity reads require the narrow custodian role and create an audit event; complaint ticket IDs are generated server-side and remain stable; status changes and sensitive-case access are audited; users see meaningful updates without internal notes.

### 5.11 Administration, audit, and bulk operations (P0/P1)

**FR-ADM-01 — Account lifecycle.** Authorized admins invite/create, assign roles, deactivate/reactivate, and initiate password reset for students/staff. Do not provide any mechanism to reveal plaintext/current passwords.

**FR-ADM-02 — Activity/audit log.** Record important actions: actor, timestamp, action, affected record identifier, result, and request/correlation ID. Avoid recording passwords, API keys, raw tokens, or unnecessary personal content.

**FR-ADM-03 — Flag review.** Provide queue, filters, status, action reasons, and resolution workflow for flagged chats/posts/complaints as authorized.

**FR-ADM-04 — Import/export.** Authorized staff may import records using CSV templates with preview, validation, duplicate detection, row-level error report, and a deliberate confirmation step. Export is scoped, logged, and limited to minimum necessary columns. For the first release, use conservative configurable caps (initial guideline: 500 input rows per import and 1,000 rows per export), with an explicit UI message when a file exceeds the limit. Process and validate files server-side; avoid sending large CSV bodies through hosting functions whose request-body limits make that unreliable.

**Acceptance criteria:** a failed import does not partially corrupt records; preview summarizes inserts/updates/errors; imports are transactional or staged so partial writes cannot corrupt the dataset; admin-only endpoints are tested independently of UI; destructive bulk operations require confirmation; large exports are capped and audited; audit logs are not editable by normal app users.

### 5.12 Analytics and “AI insights” (P2; not required for baseline correctness)

**FR-AN-01 — Descriptive analytics.** Show attendance distributions, assessment summaries, submission rates, activity-points progress, route utilization, and open complaints only to authorized roles, and identify the period/data behind the figures.

**FR-AN-02 — What-if simulator.** A simulator may show an illustrative scenario but must label its assumptions and not present an unvalidated formula as a reliable predicted grade.

**FR-AN-03 — At-risk signals.** Treat risk indicators as an optional support aid for authorized faculty/academic advisors, not a definitive diagnosis or automatic disciplinary trigger. Show contributing factors, data freshness, limitations, and a path to human review.

**Acceptance criteria:** the system distinguishes descriptive measurements from model predictions; no model result changes official grades or student standing; small/incomplete datasets are handled honestly; access is restricted; evaluation and bias/error review are documented before real use. The prototype's predicted score band (“78–84%”, “90% CI”) and at-risk indicators are illustrative mock calculations, not validated measurements; remove them or label the screen as an explicit synthetic demo until a legitimate dataset and evaluation exist. Never present a hand-coded formula as a confidence interval or model prediction.

### 5.13 In-app AI site guide (P2 feature, architecture should be prepared early)

The assistant should answer “How do I upload notes?”, explain what a page does, find relevant help instructions, summarize the signed-in user's permitted information, and open a page/prepare a draft through controlled tools. It is a site guide, not a replacement for authoritative academic/financial records or human support.

**FR-AI-01 — Explain and navigate.** The assistant searches an approved help catalogue/feature registry and may request navigation to a fixed allow-listed page ID.

**FR-AI-02 — Role-scoped information tools.** It can use only tools enabled for the current role and scope, such as list-my-assignments, get-my-attendance-summary, list-upcoming-events, or get-the-active-assigned-bus-trip-status.

**FR-AI-03 — Two-phase draft/confirmation for side effects.** A draft tool returns a server-generated proposal ID, exact proposed content/action, affected record or scope, expiry, and a requirement for confirmation. The UI shows the exact payload and a genuine user-controlled confirmation button. The button calls the normal protected action or a dedicated confirmation endpoint; the server rechecks the current session, role, scope, the unexpired single-use proposal, and the payload before executing the ordinary domain service. The model cannot submit a `confirmed: true` field and cannot mint or approve the confirmation token. High-impact records (marks, attendance, fee ledger, roles, credentials, account deletion) are never changed by the model; use the ordinary protected UI instead.

**FR-AI-04 — Provider independence.** Use a provider abstraction that can switch between approved cloud APIs and a locally served model. The tool schemas, application authorization, UX confirmation flow, and test suite are provider-independent.

**Acceptance criteria:** tool calls are re-authorized on the server; tool arguments are schema-validated; arbitrary SQL, arbitrary URLs, shell execution, and arbitrary code are unavailable; the model cannot use navigation to bypass a denied page; side effects require explicit confirmation; the UI remains functional if the model provider is unavailable; model/tool calls have timeout, per-user quotas, and a bounded tool-call loop.

---

## 6. Core end-to-end journeys

Implement the flows as coherent units and test them end to end.

### Journey A — Student checks attendance

1. Student signs in.
2. Dashboard shows the latest attendance summary and freshness timestamp.
3. Student opens attendance and chooses term/subject.
4. The system displays attended sessions, total counted sessions, exclusions/categories, and percentage.
5. The system shows a threshold warning only if the institution-configured rule is met.
6. Student cannot alter the official records; correction requests go through the approved process.

### Journey B — Teacher takes attendance

1. Teacher signs in and opens assigned class/section.
2. Teacher selects a valid scheduled/session date and starts an attendance session.
3. Roster is derived from current enrolments.
4. Teacher records attendance and reviews the count before submission.
5. Server validates assignment/scope and saves records transactionally.
6. An audit entry is recorded.
7. Student summaries update after successful persistence, not before.
8. Post-submission changes require a reason and are separately audited.

### Journey C — Teacher uploads notes / student downloads

1. Teacher selects an assigned course/semester.
2. Teacher supplies title, file, metadata, and visibility, then previews and uploads.
3. Server validates file size/type, authorizes the course, and stores the file privately.
4. Metadata record is saved and a notification is sent to the authorized audience.
5. Enrolled student sees the item and requests a short-lived/authorized download URL.
6. An unrelated student cannot download the file by guessing the storage path.

### Journey D — Assignment submission and receipt

1. Teacher publishes assignment and deadline.
2. Student opens it and uploads/enters submission.
3. Server validates the student's enrollment, deadline, type and size, stores the item and creates a stable submission record.
4. The student receives a receipt ID and server timestamp.
5. Retrying the same request does not create unintended duplicates; the student can see submission state and permitted re-submission rules.

### Journey E — Driver trip and bus view

1. Dispatcher/admin assigns a driver and bus to a route/trip.
2. Driver signs in and sees only the assigned trip.
3. Driver starts the trip; GPS permission is requested and a first coordinate is timestamped.
4. Coordinates are sent at a controlled interval while the trip is active; students on that route see the last timestamped position, stops, and status.
5. A poor network or denied permission produces “location unavailable/stale,” not random movement.
6. End trip stops normal GPS transmission and applies retention rules.

### Journey F — AI helps the user

1. Student asks, “Where do I find my semester results?”
2. The assistant retrieves approved help text and calls a `navigate_to_page` tool with an enum such as `results`.
3. Server checks that `results` is allowed for the signed-in role.
4. Client opens that existing page and the assistant explains the relevant controls.
5. If the user asks for another student's marks, the relevant data tool is unavailable or denied; the assistant offers the permitted route to request help instead of exposing data.
6. The same test must pass regardless of whether the provider is cloud-based or local.

---

## 7. UX and design system

### 7.1 Information architecture

A common app shell (navigation, global search, notifications, profile/session menu) wraps role-permitted pages. Don't duplicate whole apps for each role unless the workflows materially differ. Navigation is configuration based on permission, but each page and API independently checks permission.

Recommended top-level areas:

- Home / Dashboard
- People (Student Directory, Staff Directory where allowed)
- Academics (courses/classes, notes, assignments, quizzes, marks, results, attendance)
- Campus (calendar/events, announcements, Student Connect, complaint box)
- Transport (student bus view; driver/dispatcher operations)
- Achievements (activity points, certificates, internships)
- Fees & Receipts (only authorized roles)
- Analytics (scoped by role)
- Administration (role-gated)
- Help / AI guide

### 7.2 Quality-of-life improvements

- Global search with role-filtered results and clear result type.
- Command palette to open common pages and actions without memorizing navigation.
- Saved filters/views for staff who work with the same semester or section.
- Table sort/filter/pagination and mobile-friendly card fallback.
- CSV import/export with downloadable templates and row-level validation reports.
- Consistent form validation, autosave only for safe drafts, unsaved-change warnings, and clear success/error states.
- Confirmation dialogs for destructive or high-impact operations.
- Notification preferences and read/unread state.
- Empty, loading, offline, stale-data, permission-denied, and retry states.
- A help/feature catalogue that powers both tooltips and AI assistance, so explanations remain consistent.
- Clear data provenance labels: live, last updated, manually entered, imported, calculated, or illustrative.

### 7.3 Accessibility and performance

- Support keyboard-only use, visible focus, screen-reader labels, semantic headings, accessible table markup, and sufficient colour contrast.
- Never use colour alone to indicate present/absent, risk, payment status, or urgency.
- Support reduced motion and avoid heavy blur/continuous animation on low-powered devices.
- Use responsive layouts for phones; bus status, attendance, and complaint submission are important mobile workflows.
- Paginate server-side for large directories and logs; avoid loading every student/message at once.
- Use lazy loading for charts and non-critical pages; render clear errors when a chart lacks valid data.
- Use accessible HTML form elements rather than custom controls unless there is a concrete need.

---

## 8. Data model — initial logical schema

This is a starting map for the database, not a final migration. Confirm fields and retention with the instructor/institution. Use UUID primary keys for internal identifiers, meaningful unique keys for institutional numbers, foreign keys, check constraints, and indexes based on real queries.

### 8.1 Identity and organizational structure

- `user_profiles`: auth user ID, name/display name, contact fields, status, created/updated timestamps.
- `user_roles`: user ID, role, scope (where relevant), assigned by, assigned at, optional expiry.
- `students`: user/profile link, registration number, program/cohort, admission year, current status, current term/semester.
- `staff_profiles`: user/profile link, staff identifier, department, designation/status.
- `departments`, `programs`, `academic_terms`, `semesters`, `subjects`, `course_offerings` (subject + section + term), `teaching_assignments`, `enrolments`.

Do not place every field in one universal student JSON object. Keep stable relationships relational and use JSON only for genuinely flexible metadata.

### 8.2 Academic activity

- `class_sessions` or `attendance_sessions`: course offering, session date/time, creator, status.
- `attendance_records`: session ID, student ID, status/category, recorded by, recorded timestamp, correction metadata.
- `assessments`: course offering, assessment type, maximum marks, schedule, status/release state.
- `marks`: assessment, student, score, publication state, updated by, correction reason/history.
- `assignments`, `submissions`, `submission_files` or storage references, immutable receipt identifier, server submission timestamp, version/resubmission links.
- `quizzes`, `quiz_questions`, `quiz_options` as appropriate, `quiz_attempts`, and answer records, with server-authoritative start/end times.
- `learning_materials`: subject/offering, term, metadata, private object-storage key, uploader, visibility/status.
- `semester_results` or imported result records, with source and verification state if needed. Do not conflate official imported results with calculated internal marks.

### 8.3 Achievements, finance, campus, transport

- `activity_categories`, `activity_claims`, `activity_verifications`, `certificates`, `internships`.
- `fee_heads`, `fee_ledger_entries`, `payments`/payment references if applicable, `receipts`, `receipt_verifications`.
- `events`, `event_audiences`, `notifications`, `notification_preferences`.
- `complaints`, `complaint_assignments`, `complaint_status_history`, attachment references, and a separately permissioned `complaint_reporter_map` if confidential identity separation is needed.
- `buses`, `routes`, `route_stops`, `route_schedules`, `trips`, `driver_assignments`, `boarding_records`, `current_bus_locations`, optional short-retention location history.
- `campus_posts`, `marketplace_listings`, `conversations`, `conversation_members`, `messages`, `content_reports` (reported-content snapshot and case metadata), and `moderation_actions` — only when community features are approved.
- `audit_events`: actor, action, entity type/id, timestamp, result, request/correlation ID, carefully selected/redacted metadata. Use database triggers or a single controlled audit-writing path for important state changes. Application roles must not directly update/delete audit rows; keep database-owner administration outside normal app access. Do not claim this alone protects against a privileged database owner.

### 8.4 AI assistant records

- `assistant_sessions` and message metadata only if conversation history is required. Make retention configurable and avoid saving unnecessary sensitive content.
- `assistant_tool_audit`: user ID, provider/model identifier, tool name, allow/deny result, confirmation ID for side effects, duration, and redacted metadata. Don't store secrets or unnecessarily duplicate complete student records.
- A static/versioned help catalogue and role-to-page registry may live in code/Markdown initially; a database is not required for the first handful of help documents.

### 8.5 Data integrity rules

- Store monetary amounts as fixed-precision decimal plus currency, not binary floating point.
- Use server timestamps for submissions, audit events, and verification changes.
- Add unique constraints for registration numbers and relevant combinations: one attendance record per student/session, one enrollment per offering/student, one mark per assessment/student, one quiz attempt per `(quiz_id, student_id, attempt_no)`, and one active assignment per required staff/section scope as appropriate. Use idempotency keys for retriable submissions/imports/action confirmations where duplicate work would matter.
- Validate marks (`0 <= score <= max_score`) and date/term consistency on the server and where possible in the DB; use a valid status/state enum or checked value rather than unvalidated strings.
- Model attendance and published-mark corrections as separate linked records with previous/new values, reason, requester, approver where required, and timestamps; published data must not be silently overwritten.
- Store fee amounts as `NUMERIC(12,2)` (or an explicitly justified fixed-precision equivalent) plus ISO currency code; never use binary floating-point for money. Corrections to fee ledger entries should be represented as new adjustments/reversal rows, not destructive edits. Receipt verification history must be separately recorded with verifier, decision, reason, timestamp and evidence reference; never treat an uploaded receipt image alone as proof of settlement.
- GPS points need a recorded-at timestamp and explicit automatic retention; default to removing detailed points older than 24 hours unless a documented requirement justifies a different period.
- Use transactions for related writes and reliable audit history for high-impact changes. Attendance submission + audit event + session status must be committed consistently.
- Index common join/filter columns; check query plans when real data size grows. Consider idempotency keys for operations that may be retried (assignment submissions, imports, confirmation actions).
- Soft-deactivate primary records if audit/history and institutional policy require preservation; define an archival/deletion policy rather than deleting related records accidentally.
- Treat audit records as append-only for application roles: application grants must deny `UPDATE` and `DELETE`, and high-impact state changes should be captured through a controlled transactional service path and/or database triggers. Include actor, action, entity type/id, UTC timestamp, outcome, and request/correlation ID; include before/after diffs only when necessary and redacted. Never log passwords, tokens, API keys, complete complaint narratives, full private messages, or raw uploaded content by default. Test an attempted audit-row update/delete as each app role. This protects against ordinary app misuse, not a privileged database owner.

---

## 9. Application architecture

### 9.1 Modular monolith

Start with one deployable app and a single primary PostgreSQL database. Keep domain boundaries in code rather than splitting into microservices.

Suggested layers:

1. **UI layer:** reusable components and pages; no secrets; no privileged database keys.
2. **Route/API layer:** validates session, parses/validates request, checks permissions, returns stable responses.
3. **Domain/service layer:** `attendanceService`, `marksService`, `transportService`, `complaintService`, `aiToolService`, etc. This contains reusable business rules.
4. **Data-access layer:** typed SQL/client functions and transactions; no model-generated SQL.
5. **Provider adapters:** authentication/storage/email/AI/map interfaces with provider-specific implementations behind a small boundary.
6. **Operations layer:** migrations, seeds, tests, logging, backup and deploy scripts.

AI tools and ordinary UI actions should call the same domain service functions. This prevents a “secret second backend” for AI that has different permissions or rules.

### 9.2 Proposed repository layout

```text
campus360/
  src/
    app/                    # routes, layouts, loading/error states, API handlers
    components/             # shared UI and domain components
    features/
      auth/ students/ academics/ attendance/ results/
      achievements/ fees/ transport/ calendar/
      connect/ complaints/ analytics/ assistant/ admin/
    lib/
      auth/                  # session helpers and authorization
      db/                    # generated types, queries, repositories
      validation/            # Zod schemas
      services/              # domain service functions
      ai/                    # provider interface, registry, tool definitions
      storage/ maps/ email/  # narrow provider adapters
  supabase/
    migrations/
    seed.sql
    tests/
  docs/
    requirements.md
    architecture.md
    data-model.md
    security.md
    ai-assistant.md
    decisions.md
    tasks.md
  tests/
    unit/ integration/ e2e/
  .env.example
  README.md
```

This is illustrative; follow the conventions of the chosen framework, do not force the exact structure if it creates unnecessary complexity.

### 9.3 API conventions

- Use a consistent JSON response/error shape and predictable HTTP status codes.
- Validate all incoming fields server-side with shared schemas (e.g., Zod).
- Pagination is explicit; do not return unbounded directory, message, or log data.
- Do not expose internal database errors, stack traces, service-role credentials, or provider raw errors to ordinary users.
- Mutating operations should support safe retries/idempotency where duplicate submission matters.
- Require CSRF protection according to the chosen cookie/session mechanism; configure allowed origins and secure headers.
- Do not accept a user ID from the body as proof of identity; derive requester identity from the validated session.
- Use the same authorization policy regardless of whether a request came from the UI or an AI tool call.

---

## 10. Hosting and database plan

### 10.1 Recommended class-project hosting arrangement

**Initial recommendation: GitHub + Vercel + Supabase.**

- Put application code, migrations, tests, and decisions in a private Git repository.
- Deploy Next.js from the repository to Vercel (or another compatible Node/container host if required).
- Use Supabase PostgreSQL for the relational system of record; Supabase also provides Auth, Storage, and Realtime features. The database is PostgreSQL rather than a proprietary JSON-only data store.
- Use Supabase Auth or a similarly mature identity library rather than implementing password/session internals from scratch.
- Store notes, certificates, assignment submissions, and receipts in private object-storage buckets, not as unbounded database blobs or public links.
- Keep dev/staging and production projects separate. Use fake seed records for the demo.
- Store all API keys and privileged database keys only in server environment variables. Never prefix server-only secrets with a public/client-exposed environment name or commit them to Git.

This option minimizes the amount of infrastructure code the student team must operate. Supabase documentation describes PostgreSQL, Auth, Storage, Realtime, and Edge Functions as parts of its platform, while its RLS guide emphasizes explicit table privileges and policies; both should be implemented rather than assumed to be automatic.

### 10.2 Deployment alternatives

**Alternative A — Managed app + managed database (recommended).** Vercel for the app; Supabase for Postgres/Auth/Storage/Realtime. Good for quick setup and Next.js integration. Watch function-duration/plan limits, database connection patterns, quota changes, region availability, and free-tier pause/backup limitations. Real-time bus tracking can use periodic location writes plus a subscription to the latest allowed bus location; do not build a separate WebSocket service unless proven necessary.

**Alternative B — Long-running web service/container.** Deploy the Next.js/Node app on a container-capable host (for example Render or another managed container platform) and use Supabase/Neon or a managed PostgreSQL service. This is worth considering if the project later needs long-running workers, custom processes, or more predictable background task handling. It adds some deployment/operations work; compare the actual current plan limits before selecting it.

**Alternative C — Self-host everything.** Run Dockerized app, PostgreSQL, reverse proxy (such as Caddy), object storage, monitoring, and backup jobs on an institution-owned or rented server. Add Ollama or vLLM only if local inference is a requirement. This gives more control but transfers security patching, uptime, storage monitoring, backup restoration, GPU management, and incident response to the team. It is not the first choice for a short class project unless self-hosting is part of the assignment.

### 10.3 Database choice and operations

**Use PostgreSQL as the default.** The data is inherently relational and benefits from foreign keys, uniqueness, transactions, indexed joins, reporting, and role/row policies. Supabase is the fast route to managed Postgres. Neon is a valid managed Postgres alternative if the team wants to assemble auth/storage separately; don't add a second database without a clear reason.

Required operational practices:

- Store schema changes as versioned migrations in the repository; don't make undocumented production-only edits in a dashboard.
- Use separate development/staging/production credentials and projects.
- Apply least-privilege database grants and RLS to every client-exposed table/schema; test both positive and negative access cases. Explicitly document which operations run with a user-scoped client and which privileged server-only jobs, if any, require a service-role credential.
- Keep private uploads private; use authorization checks and expiring links for downloads.
- Select a supported database region that meets latency and institutional/data-governance constraints; verify current availability and terms at setup time.
- **Free-tier reality (verify again before deploy):** Supabase documents that low-activity Free projects may pause after a 7-day window; the Free plan does not provide downloadable automated database backups. Supabase's database backup does not include objects stored through Storage API; it preserves database metadata, not file contents. Keep a scheduled/off-site logical database export (`supabase db dump`/`pg_dump` as appropriate), separately inventory/back up required private objects, and perform a restore drill. A database dump without the file objects is not a complete restore.
- Review the current Vercel Hobby terms before using it for the deployed submission: it is stated as limited to personal/non-commercial use. If the actual use case does not qualify, use an allowed plan/host; don't assume any named “free tier” is appropriate.
- Define retention for old GPS points, AI conversations, chats, audit logs, uploaded files, and deactivated accounts.
- Monitor database size, storage, API quotas, failed jobs, function timeouts, error rate, and connection usage. Keep uploads in object storage rather than proxying large file bodies through serverless functions with strict payload limits.
- Export essential records and provide a migration path if the provider or free plan changes. Before a demo, verify the deployment is awake, seed data is present, migrations are current, and the recovery path works.

### 10.4 File storage

Use object storage with private buckets for student-submitted documents, notes, certificates, assignment submissions, receipts, and complaint evidence. Store object keys and metadata in PostgreSQL, never a permanent public URL. Check authorization before issuing short-lived signed download URLs. Enforce maximum size and allow-listed formats; verify the detected file signature/type server-side instead of trusting the browser's extension or declared MIME type; use random object keys; prevent executable content from being served inline; and consider malware scanning for untrusted files. Test that an unrelated account cannot obtain a signed URL even if it guesses an object key. Track object retention separately from database backups.

### 10.5 Low-cost and production caveat

Free tiers can be enough for a prototype with synthetic data, but limits and policies change and free tiers may lack uptime guarantees, point-in-time recovery, sufficient storage, or always-on workers. Before adding real student data, get institutional approval and confirm the current pricing, data region, backup guarantees, provider terms, and incident/restore process. The plan is a deployment design, not a promise that production operation will cost zero. For example, the current Supabase pricing page lists 500 MB database size and 1 GB file storage on Free (these are different quotas), inactivity pausing, and paid-plan options; the exact current quotas/price must be checked directly at project creation. Supabase's current backup docs recommend CLI exports for Free projects and state that database backups do not include Storage API objects. Vercel Hobby is documented as personal/non-commercial; verify that the actual submission/deployment qualifies. [R19–R23]

---

## 11. AI integration: cloud APIs and local/self-hosted options

### 11.1 Design objective

The AI guide must be replaceable without rewriting Campus360. Model providers generate language and propose tool calls; **Campus360's server is the authority that decides whether a tool executes**. Never let a model connect straight to the database or receive service credentials.

### 11.2 Recommended integration pattern

Use Vercel AI SDK (TypeScript) as a starting point for provider-agnostic streaming and tool definitions. Define an internal, typed interface and a provider registry so provider-specific differences are contained. Start with one provider, keep a second provider configured for development/testing, and add a local adapter after the tool contract is stable.

Conceptual flow:

1. Browser sends the authenticated user's message to a server endpoint.
2. Server authenticates the session, loads role/scope, applies request/rate/token limits, and retrieves the approved help context.
3. Server invokes the configured provider through the adapter with only the minimum needed context and the allowed tools for that role.
4. Provider may return text or a structured tool request.
5. Server validates tool name/arguments against an allow-list and schema, checks permission, and calls the same domain service used by normal application pages.
6. For a safe read, the service returns minimal data. For a write/draft, the server returns a proposal to the UI and the user confirms through an explicit UI control before the business operation executes.
7. Tool output is returned to the model for a final response; the interface shows sources/links where possible and labels uncertainty.
8. The server records a redacted audit event and usage metrics without logging secrets or unnecessary personal information.

Set a small maximum tool-call count/iteration budget (for example, 3 rounds during the first release), request timeout, token budget, per-user rate limit, and fallback response. Avoid free-running agents and arbitrary computer-control tools inside the student-data application.

### 11.3 Provider choices

**OpenAI API — Responses API and function calling.** Provides custom function tools defined with schemas and a multi-step request/tool-result loop. It is a strong cloud candidate for a help/navigation assistant. Use only models currently available through the API account and verify tool/structured-output support for the chosen model. A ChatGPT consumer subscription should not be assumed to include API usage or credits; set up API billing and project keys separately.

**Anthropic API — Messages API and tool use.** Supports model-generated structured tool requests that the application executes. A good alternate provider for independent behavior comparisons and reasoning. Keep the server in control of the tools; avoid computer-use functionality for record operations when a narrow application API is safer.

**Google Gemini API — function calling.** Supports function calls for interacting with application tools and data. It is another viable cloud adapter. Check the exact model's tool-calling support, quota, retention/data controls, pricing, and account availability before use.

**Other providers such as GLM or OpenRouter — optional adapter.** Use only after checking the specific API endpoint, tool-call format, retention policy, and contractual terms. OpenAI-compatible APIs are convenient but compatibility is not proof that every structured-tool feature behaves identically. A router/aggregator adds another party to the data path, so do not route sensitive student records through it without a policy review.

**Provider prices and availability change frequently.** Do a current cost comparison using actual expected prompt/output sizes and tool-call counts before enabling AI for all users. Enforce a budget/circuit breaker rather than relying on a model name or consumer subscription plan.

### 11.4 Self-hosted/local model choices

**Ollama — easiest initial local experiment.** It offers a simple local model-serving interface and tool-calling support for compatible models; its documentation demonstrates tool calls with Qwen3. Good for development, offline prototypes, or a small single-machine pilot. Model quality, memory/VRAM needs, JSON adherence, concurrency, latency, and licence depend on the exact model/quantization. Keep the local server bound to loopback during development; if remote, put it behind authenticated networking and a reverse proxy rather than exposing a raw port publicly.

**vLLM — candidate for a GPU-backed serving environment.** It offers an OpenAI-compatible serving path and tool-calling support for supported model families/templates. It is more operationally involved than Ollama and is useful when throughput/concurrency on a suitable Linux/GPU server is needed. Confirm the exact model's chat template, tool-call format, memory needs, supported quantization, hardware, and licence before deployment.

**Candidate model families:** begin evaluation with instruction-tuned models whose current documentation explicitly supports tool/function calling (for example, Qwen3-family variants that are available in the selected runtime), then compare two or three alternatives (e.g., applicable Mistral or Llama-family instruct variants). This is a shortlist for evaluation, not a claim that every variant has the same license, quality, or tool support. Pin model versions/digests and record the license/acceptable-use terms.

**Self-hosting is not free by default.** The model weights may be available for download, but production needs appropriate CPU/RAM or GPU/VRAM, storage, monitoring, power/cloud compute, updates, authentication, capacity planning, and incident response. A laptop-local model is fine for development, but should not become an internet-facing production endpoint.

### 11.5 Provider adapter contract

Define a small application-owned interface, conceptually:

```ts
type AssistantRequest = {
  messages: SafeMessage[];
  tools: AllowedToolDefinition[];
  maxOutputTokens: number;
  timeoutMs: number;
};

type AssistantResult = {
  text?: string;
  toolCalls?: Array<{ name: AllowedToolName; arguments: unknown }>;
  providerId: string;
  modelId: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

interface AssistantProvider {
  generate(request: AssistantRequest): Promise<AssistantResult>;
}
```

This is illustrative pseudocode, not a drop-in library API. Use the AI SDK/provider integrations where they fit, and translate to this internal result shape at the boundary. Validate every parsed tool argument even if the provider claims schema-constrained output.

### 11.6 Initial tool registry

Implement the minimum tools needed to navigate and explain the app. All tool access is role-filtered server-side.

**Read-only help/navigation tools**

- `search_help(query)`: searches the approved feature/how-to catalogue.
- `explain_feature(featureId)`: explains a known page/feature and links to it.
- `navigate_to_page(pageId)`: returns a page ID from a strict enum; the client navigates to a matching registered path only after server validation.
- `list_upcoming_events(startDate, endDate)`: returns only events visible to the user.
- `list_my_assignments(status?)`: returns the signed-in student's assignments or the teacher's assigned tasks, according to role.
- `get_my_attendance_summary(termId?)`: returns only the signed-in student's permitted attendance summary.
- `find_course_notes(courseId, termId?)`: returns titles/metadata the user is authorized to see; downloads still go through normal storage authorization.
- `get_assigned_bus_status()`: returns limited status for the user's relevant bus route or the driver's currently assigned trip, with freshness timestamp.

**Explicitly deferred from the first AI release:** `search_student_directory(...)` and any tool returning identifiable records about other users. If later justified by the rubric, implement it only for a dedicated staff role, with strict query scope, minimal returned fields, pagination, rate limits, audit, and explicit tests; do not expose it as a general-purpose assistant capability.

**Later-phase draft tools (not part of the initial AI MVP)**

- `draft_complaint(category, description, confidentialityMode)`: may prepare a complaint draft for the ordinary complaint form; it does not submit the complaint. The default is confidential handling, not a promise of absolute anonymity.
- `draft_event(...)`: may prepare an event draft only for roles allowed to create events; it does not publish or save without the future approval flow.

Do not create model-callable tools for arbitrary SQL, arbitrary web requests, code execution, raw storage traversal, password retrieval, grade changes, attendance edits, receipt approval, role grants, account deletion, or payment state. The first AI release is read-only; the ordinary protected UI remains the path for state-changing actions. If later draft actions are implemented, use the full two-phase confirmation design in §11.7.

### 11.7 AI security and reliability controls

- Prompt injection: help docs, uploaded notes, marketplace text, complaints, and chat messages are untrusted content, not system instructions. Clearly delimit retrieved text and never let it grant new tools/roles.
- Authentication/authorization: the model's narrative about a user is not evidence of identity. Every tool rechecks the current session, role, scope, and record ownership.
- Least privilege: only expose tools required for the current role and task; return minimal fields and aggregations where possible.
- **Two-phase confirmation for any future side effect:** (1) the model may request a schema-validated proposal; the server checks the user's current session, role, scope, and resource ownership, then returns a human-readable preview without committing a write; (2) the UI presents an explicit confirmation control outside the chat transcript. On confirmation, a server endpoint must validate the session again, verify same-origin/CSRF protections, atomically consume a short-lived single-use server-generated confirmation token bound to the user/session, allowed tool, resource and normalized proposal, re-check authorization and relevant record state, then call the same domain service used by the ordinary UI and write an audit event. The model cannot create or approve its own confirmation token, and “yes” appearing in model/chat text is not authorization. In the MVP, do not expose AI tools that directly edit marks, attendance, fees, roles, accounts, or payment state; ordinary protected forms handle those actions.
- Limits: request-size ceiling, output/token limit, timeout, tool-round limit, rate limit, per-account budget, retries with backoff, circuit breaker, and safe provider fallback.
- Data protection: do not send full student files/rows to a provider when a server-computed summary or help snippet is enough. Review provider terms, retention, data residency, and use of data for training for the specific API account and current contract.
- Output safety: render output as text/approved Markdown; sanitize any permitted rich text; do not execute model HTML, scripts, SQL, or client code.
- Audit: record user ID, provider/model, tool name, allow/deny, confirmation, time, latency, and outcome, with secrets and unnecessary sensitive payloads redacted.
- Reliability: AI can be wrong and must cite the source screen/help item for policy/feature explanations. If a record is missing or a tool fails, it should say it could not verify the data rather than inventing it.
- Evaluation: include tests for prompt injection, permission denial, hallucinated navigation paths, incorrect tool arguments, retries/duplicate actions, provider outages, quota exhaustion, and leakage between two student accounts.

### 11.8 Cloud versus self-hosted decision

| Criterion | Cloud API | Self-hosted model |
|---|---|---|
| Time to initial integration | Usually fastest with a mature API/SDK | More model-serving and hardware setup |
| Operational burden | Provider runs inference; app team still secures tool execution | Team manages hardware, model server, updates, availability, and access |
| Cost shape | Token/request usage; budget controls needed | GPU/CPU capacity and operations; cost depends on utilization |
| Data path | Data is sent to the selected API provider; review contract and retention | Prompts can stay within infrastructure you control, but logs/network/storage still need securing |
| Model flexibility | Depends on provider/model catalogue and API access | More freedom subject to model licence, hardware, and serving support |
| Tool quality | Must test tool calling for selected model/API | Must test exact model/template/quantization; support varies |
| Recommended role | First real pilot and fallback option | Local development/prototype first; production only if capacity and operations are planned |

**Recommended staged choice:** implement the provider interface and tools first; prototype with one cloud API if API billing/policy is available; run a local Ollama proof-of-concept in parallel using synthetic data; compare latency, tool-call accuracy, answer quality, prompt-injection resilience, and per-task cost; only then decide whether a self-hosted GPU endpoint is justified.

---

## 12. Security, privacy, and safety requirements

The system may hold identifiable education, communication, financial, and location data. Treat it as sensitive even for a class demo. For any real deployment, the college must approve the hosting provider and privacy notice and should obtain qualified review of applicable Indian data-protection requirements, including the Digital Personal Data Protection Act, 2023 and DPDP Rules, 2025. The rules were notified in November 2025; applicability, commencement/transitional provisions, responsibilities, and sectoral obligations should be checked as they apply at deployment time. This design is not legal advice.

### 12.1 Authentication and account protection

- Use a maintained auth provider/library; do not implement password storage or session handling from scratch. For the recommended Supabase + Next.js arrangement, follow the current supported SSR/cookie integration rather than improvising token storage.
- Enforce secure, HttpOnly cookies and appropriate SameSite, origin-validation and CSRF protections for the selected auth flow; review cookie settings against the actual deployment domains.
- Require MFA for administrators where supported by the selected provider and within the project's scope.
- Rate limit sign-in, password reset, invite, upload, CSV import/export, and AI endpoints.
- Password reset links must be short-lived, single-use, and non-enumerating. Admins trigger a reset/invite; they never receive a user's current or generated temporary password in a client-visible toast.
- Keep service-role database keys and provider API keys server-only. Rotate if exposed.

### 12.2 Authorization and data isolation

- Enable and test RLS on every table exposed through a client-accessible Supabase API. Keep database grants and RLS policies aligned; a policy is not a substitute for correct grants.
- Routine signed-in data operations must preserve the caller's verified identity/claims and RLS context. Any service-role usage is server-only, limited to specifically documented administrative/background operations, and guarded by application authorization; service-role access bypasses RLS and must not be the default client for ordinary domain workflows.
- Test `SELECT`, `INSERT`, `UPDATE`, and `DELETE`/deactivation paths separately with actual test accounts/JWTs. CI should fail if an exposed table lacks an explicit RLS decision or required policy test.
- Avoid exposing tables directly to anonymous/public clients unless the exposure is intentional and small.
- Never treat a hidden button, UI route guard, or middleware alone as sufficient. Attempt direct API and Server Action calls as each role during tests.
- Use scoped checks for class assignment, department, student ownership, active bus trip, complaint identity, file access, and moderation scope.

### 12.3 Web/application hardening

- Validate all request payloads server-side with shared schemas; parameterize database operations; avoid raw SQL built from user text.
- Prevent XSS through safe output rendering and sanitization for permitted rich text; defend against CSRF according to session strategy and verify allowed origins for cookie-authenticated state changes.
- Set secure headers (including a restrictive but tested Content Security Policy), restrict allowed origins, and handle CORS deliberately. Generate a request/correlation ID and include it in redacted logs for diagnosing failures.
- Apply upload allow-lists, size limits, file-signature verification, private storage, server-side checks, random object keys, short-lived signed URLs, and malware scanning where feasible.
- Avoid leaking stack traces, sensitive database errors, hidden IDs, tokens, personal records, or file paths.
- Use dependency scanning/updates and lockfiles. Do not add libraries solely because an AI suggested them without checking maintenance, licence, and necessity.
- Use request IDs, rate limits on expensive/sensitive endpoints, audit records, tested backups, monitoring and an incident/restore checklist.

### 12.4 GPS and transport privacy

- Collect driver GPS only for an authorized active trip and only at a necessary update frequency.
- Display who can see bus location and when tracking is active.
- Restrict detailed location data to users with a legitimate route need and show a stale timestamp.
- Avoid indefinite historical location retention; define a short retention period and aggregate/delete old points.
- Do not build student tracking by default. If student boarding/check-in involves location, it needs a distinct requirement and privacy review.

### 12.5 Complaints, chat, and moderation

- Explain anonymous complaint limitations honestly.
- Restrict case visibility; log access to highly sensitive complaints.
- Provide reporting/blocking, moderation states, and rate limits for chat and marketplace posts.
- Define a content policy, escalation process, and retention policy before enabling private messaging for real students.
- Avoid logging full private messages or complaint narratives by default in application telemetry.

### 12.6 Fees and official results

- Keep payment state, receipt state, and manual verification separate and auditable.
- Never treat an uploaded receipt image or AI interpretation as authoritative payment confirmation.
- If a payment gateway is added, use the gateway's verified server-to-server webhook and reconciliation process.
- Clearly label imported/unverified academic data; avoid implying the app is an official KTU results system unless authorized and integrated through a permitted source.

### 12.7 Accessibility and fairness

- Ensure essential information isn't conveyed by colour alone.
- Do not use AI risk scores or predicted marks as automatic grounds for penalties, exclusion, scholarship decisions, or discipline.
- Keep a human review path and provide a non-AI way to complete every core workflow.

---

## 13. Testing, monitoring, and recovery

### 13.1 Testing layers

**Unit tests:** validation schemas, attendance calculations, scoped permission helpers, fee-ledger arithmetic, server-time/deadline rules, tool argument parsing, idempotency and correction/publication state transitions.

**Integration tests:** database constraints, table grants and RLS policies, private object storage/signed URLs, transactions, server endpoints, login/session behavior, provider adapter conformance, notification delivery, audit events, retention jobs and CSV import/export validation.

**End-to-end tests (Playwright):** student login → attendance/results; teacher login → attendance submission; teacher uploads notes → enrolled student downloads while another student is denied; student submits assignment → stable receipt; admin assigns role → permissions change; complaint submit → authorized handler resolves without seeing reporter identity; calendar event audience scoping; transport shows stale/simulated states honestly; optional AI navigates a permitted page but denies another role's data.

**Security tests:** direct request with another student's ID; role self-escalation; service-role key not in client bundle; exposed table without RLS decision; unauthorized exports; expired/replayed reset/confirmation token; oversized or incorrect-type upload; HTML/script content; direct access to private files; audit-row UPDATE/DELETE attempt; reported versus unreported conversation access; repeated tool-call loops; prompt injection in note/post; malformed tool arguments; and secrets accidentally committed.

**Operational tests:** restore database and required objects to a clean environment, deploy migrations from an empty database, verify rollback/recovery notes, rate-limit behavior, timeout/provider outage, free-tier pause/re-activation path, and stale bus GPS. Test SQL backups and object storage separately.

### 13.2 Quality gate for each feature

A feature is not “done” until all are true:

1. Its acceptance criteria are mapped to tests or an explicitly justified manual test.
2. It follows the existing architecture and shared validation/auth patterns.
3. It has loading, empty, success, error, and permission-denied states as relevant.
4. Data actually persists and can be reloaded after refresh/new session.
5. Required authorization tests pass for both allowed and denied roles.
6. The code diff is reviewed by a second model/person; findings are resolved or recorded.
7. Documentation/backlog is updated; change is committed in Git.

### 13.3 Monitoring and recovery

Monitor server errors, failed login spikes, database availability/size, storage usage, request latency, API/provider errors and spend, job failures, failed imports, and stale location updates. Keep logs useful but redacted. Define who can access logs, how long they are retained, and how to restore or rotate credentials. Test that a database backup actually restores the required records and files.

---

## 14. Delivery roadmap and dependency plan

### Phase 0 — Confirm scope and freeze initial decisions

- Collect assignment rubric, required stack, team size, delivery date, and mandatory features. Confirm whether the class mandates MongoDB or another stack; if not, retain the recommended Next.js/TypeScript/PostgreSQL/Supabase direction.
- Freeze the MVP boundary and put any rubric-driven exceptions in `docs/decisions.md`. Only the instructor's requirements can promote deferred scope.
- Record the privacy/data gate: use synthetic data by default and require institutional approval before using real student/staff data; verify applicable privacy requirements and phased commencement with a qualified source at deployment time.
- Confirm terminology: course vs program, semester/term conventions, teacher vs staff, receipt-check scope, KTU scheme/data source, complaint confidentiality, and transport hardware/data source.
- Run a short GPS/browser feasibility spike, but do not block foundational coding on GPS results; keep schedules/stop check-in as fallback.
- Review this document independently with at least two AI models; record proposals and reasons rather than merging uncritically.
- Create decision records and a role/table/operation authorization matrix before building user-facing modules.

**Exit criterion:** stack requirement and MVP are recorded; synthetic-data policy is explicit; no unresolved issue blocks auth/schema foundations; all other ambiguities have a safe default, an owner, and a decision point before the relevant module is built.

### Phase 1 — Repository and infrastructure foundation (P0)

- Initialize repository, formatting/linting, TypeScript, app shell and UI components.
- Create development/staging database, migrations and clearly-labelled synthetic seed data.
- Implement authentication, trusted role assignment/loading, secure session handling, authorization helpers, an explicit role × table × operation matrix, and RLS tests for exposed tables.
- Implement audit baseline: important state changes produce attributable records; application roles cannot update/delete audit rows; sensitive fields are redacted.
- Set up database/object export and restore procedures; perform a restore before treating the hosting plan as dependable.
- Add basic logging, error UI, tests and CI checks.
- Convert the prototype's common shell, navigation, form patterns, tables, toasts and theme into reusable components, replacing role switching as a simulated privilege toggle.

**Exit criterion:** protected skeleton is deployed; verified test accounts work; synthetic records persist through refresh; direct unauthorized API/Server Action calls are denied; RLS and database grants are covered by tests; an audit event is written for a sample mutation; database/object restore steps are documented and have been exercised.

### Phase 2 — Academic core (MVP)

- Academic hierarchy (department/program/term/subject/section), student directory, teaching assignments and enrolments.
- Student and teacher dashboards backed by persisted data.
- Attendance sessions, records, summaries and reasoned correction flow.
- Notes library with private upload and authorized download.
- Assignment submission with server-issued, stable receipt and duplicate/retry handling.
- Marks entry, publication state, correction history, and a student results view using manual entry or a small supervised CSV path; no KTU scraping.

**Exit criterion:** teacher and student journeys work end-to-end after refresh and across separate test accounts; unpublished marks and private files stay private; corrections are traceable; authorization tests pass.

### Phase 3 — Campus operations (MVP completion)

- Events/calendar and in-app notifications.
- Complaint box with truthful confidential identity handling and case status.
- Admin account lifecycle and read-only audit view.
- Activity points, certificate/internship workflow, and a read-only fee/receipt view if confirmed in the rubric; preserve history and separate transport receipt checks from financial reconciliation.
- Small capped CSV import/export only where needed for the MVP.

**Exit criterion:** each shipped workflow has role-scoped permissions, persistent data, tests and audit records; backup plus object restore is demonstrated; the MVP is a complete and reproducible staging demo, not merely visible screens.

### Phase 4 — Transport differentiator (time-boxed; not a blocker to MVP)

- Routes/stops/schedules, driver assignment, trip lifecycle, and minimized boarding manifest.
- Run the actual-device GPS test before enabling location; handle permission denied, suspended page, bad network, stale locations and retention. Prefer periodic latest-location polling until a measured reason for real-time subscriptions exists.
- If real location does not prove reliable, deliver schedules/stops and explicit driver stop check-ins; if simulation is used, persistently label it as simulated.

**Exit criterion:** route authorization and the chosen real/demo/fallback mode pass tests. Do not claim “live” unless a real authorized source is providing fresh coordinates.

### Phase 5 — AI site guide (time-boxed, after core authorization)

- Curated help catalogue and a provider adapter; one provider implementation first.
- Role-scoped help/page navigation and a small read-only tool catalogue. Test against an independent model/provider and a local Ollama-compatible model on synthetic fixtures if time permits.
- Add quotas, a bounded tool loop, tool-call audit, a kill switch and static-help fallback. Only add confirmed draft actions if the ordinary form/action is already secure and the instructor values the feature.

**Exit criterion:** prompt-injection, cross-account leakage, unauthorized tool and malformed-argument tests pass; assistant outage does not break core tasks; the server re-authorizes every tool call.

### Phase 6 — Deferred extras (only on explicit rescope)

- Student Connect feed, sell/give marketplace, and direct messaging with report-driven moderation.
- Full quiz capabilities beyond basic auto-graded MCQ/server timer, descriptive analytics, bulk imports beyond conservative caps, email/SMS, payment gateways, and predictive/at-risk analytics.

These items re-enter scope only by an explicit owner/instructor decision recorded in `docs/decisions.md` after MVP exit criteria pass.

### Phase 7 — Submission hardening

- End-to-end regression test on staging.
- Restore test and final backup/configuration review.
- Accessibility/mobile pass and removal of all misleading demo labels/values.
- Update README, setup steps, ER diagram, test evidence, known limitations, and demo script.

**Exit criterion:** every delivered feature passes the quality gate in §13.2, restoration is repeatable, and the demo uses synthetic data.

---

### MVP boundary (frozen for v0.2)

**MVP core before differentiators:** identity/auth and trusted scoped roles; academic structure and student profiles; attendance with history/correction; notes; assignment/submission receipt; manual or supervised CSV marks/results; calendar/in-app notification basics; complaint confidentiality and workflow; admin account lifecycle/audit view; synthetic seed data; RLS/security tests and a restore drill. Fee-ledger/receipt view and activity-point verification are included if required by the rubric; otherwise they are the first scope-controlled extensions.

**Time-boxed differentiators after the core:** transport schedules/stops and then real GPS only if feasible; the AI assistant limited to help/navigation/role-scoped reads. Both must have honest degraded modes.

**Deferred:** Student Connect direct messaging and marketplace; full quiz platform; payments; predictive grades/confidence intervals/at-risk labels; email/SMS delivery; unbounded import/export; and production self-hosted AI infrastructure. These are not secretly part of the MVP simply because screens appear in the HTML.

### 14.1 First backlog (suggested order)

1. Confirm requirements and instructor stack.
2. Create repository and decision log.
3. Set up Next.js + TypeScript + lint/test tooling.
4. Set up Supabase project and SQL migrations.
5. Define roles and permission matrix before building dashboard pages.
6. Implement login/logout and protected route/API tests.
7. Create academic base tables, unique constraints, seed records.
8. Build student directory with search/filter and authorization.
9. Build student and teacher dashboard data queries.
10. Implement class sessions and attendance records/summary.
11. Implement notes upload and private downloads.
12. Implement assignments/submission receipts.
13. Implement marks workflow and student result visibility.
14. Add event calendar/notifications.
15. Add achievements/complaints/fee workflows based on required scope.
16. Add transport route model and real location feasibility test.
17. Add Student Connect moderation if time permits.
18. Add AI help/navigation after tool and auth contracts are stable.
19. Run role-based E2E/security suite and backup restore test.
20. Prepare a reproducible demo using synthetic data.

---

## 15. Key risks and mitigations

**R1 — The project becomes too large.** Many roles and modules can exceed a class deadline.  **Mitigation:** freeze a core vertical slice, rank modules against the rubric, and ship tested end-to-end flows before advanced social/AI/ML features.

**R2 — AI models drift from the spec or rewrite working code.**  **Mitigation:** maintain this document, small feature tasks, versioned decisions, task-specific prompts, branch-based work, and code review.

**R3 — UI gives a false impression of implementation.**  **Mitigation:** replace mock values incrementally; label seeded/demo data; require persistence tests and data-freshness labels.

**R4 — Role/row authorization bugs expose student data.**  **Mitigation:** server-side checks plus RLS, least privilege, negative tests for every role, no trust in user-provided IDs, and no privileged keys in the browser.

**R5 — AI prompt injection or excessive agency.**  **Mitigation:** allow-listed structured tools, per-role tool registry, no raw DB/SQL, human confirmation, bounded loops, minimal context, independent tests. OWASP lists prompt injection, sensitive-information disclosure, insecure tool/plugin design, and excessive agency among major LLM application risks.

**R6 — Cloud AI costs or quotas are unpredictable.**  **Mitigation:** token/user quotas, budget alerts/circuit breaker, cache stable help, small-model evaluation, fallback static help, and monthly usage review.

**R7 — Local AI needs more hardware/operations than expected.**  **Mitigation:** prototype with Ollama and synthetic data, measure latency/memory, and use vLLM only if a suitable GPU environment and owner exist.

**R8 — GPS isn't actually live.**  **Mitigation:** prototype the data pipeline early; use device GPS and timestamped data; display stale/offline state; do not claim “live” without a data source.

**R9 — Privacy and moderation issues.**  **Mitigation:** collect minimal personal data, define retention/purpose, restrict reports/complaints/chats, moderate abuse, and get institutional/legal sign-off before real deployment.

**R10 — Provider free-tier or policy changes break deployment.**  **Mitigation:** pin/record configuration, export data, understand quotas and backup terms, keep a restore/migration plan, and avoid unnecessary provider coupling.

**R11 — Analytics looks authoritative without evidence.**  **Mitigation:** separate descriptive reports from predictions, label assumptions, show freshness, validate any model, and require human review for student-affecting use.

---

## 16. Open decisions for the owner/instructor

Questions below genuinely affect the scope or architecture. Safe defaults permit foundation work to proceed while module-specific choices remain open.

1. What stack is mandated, and is MongoDB required? **Default:** Next.js/TypeScript/PostgreSQL/Supabase unless prohibited.
2. What is the team size, deadline, and rubric weighting; is deployed staging required? **Default:** freeze the MVP in §14; deliver a localhost fallback and synthetic seeded staging demo.
3. Which features are compulsory for grading, especially fees, transport GPS, Student Connect, quizzes, and AI? **Default:** MVP core first; time-box transport/AI; defer social, advanced quiz, payments and predictive analytics.
4. Which KTU scheme/year and result source are permitted? **Default:** manual entry or validated, supervised CSV; no scraping absent explicit approval; preserve source/verification labels.
5. Who performs receipt verification and what is being checked? **Default:** driver/transport staff checks bus-pass status at boarding; finance/admin handles any actual ledger reconciliation. This split needs instructor confirmation.
6. Who verifies activity points/certificates? **Default:** the claim is submitted by student/teacher but approval must be performed by an authorized different person where verification is required.
7. Does Teacher Connect mean directory, announcements, or direct chat? **Default:** directory + scoped announcements; no private messaging in MVP.
8. What does the handwritten “SAV” bullet mean, and what is the unclear special bus event? **Default:** preserve as unknown; use generic configurable event overrides.
9. Will real student/staff data be used? **Default:** synthetic data only until the institution approves use and relevant privacy obligations/retention/hosting are checked.
10. Is a cloud AI API allowed/budgeted, or must it be local? **Default:** implement only after core; one cloud API with quotas if permitted, local Ollama for experimentation, and static help as guaranteed fallback.
11. Is a true anonymous complaint mode required, or is confidential complaint handling sufficient? **Default:** confidential mode with identity isolated from ordinary handlers and access audited; don't promise absolute anonymity.
12. If schedule slips, should transport or AI be cut first? **Default:** keep transport schedules/stops without live GPS; degrade AI to static help; preserve academic workflows.

---

## 17. Multi-model development protocol

Use models as a peer-review group without allowing them to become independent sources of truth.

### 17.1 Shared artifacts

Keep these in Git and provide the relevant subset with every task:

- `docs/requirements.md` — feature catalogue and acceptance criteria (this document is the seed).
- `docs/architecture.md` — approved stack, boundaries, conventions and data flow.
- `docs/data-model.md` — entity definitions and relationship rules.
- `docs/security.md` — threat model, role/row permissions, secrets policy, upload policy, AI-tool policy.
- `docs/decisions.md` — dated decisions with rationale and alternatives.
- `docs/tasks.md` — scoped backlog, dependencies, owner/model, verification state.
- `README.md` — how to install, configure, seed, test, and run the application.

### 17.2 Rules for all coding models

1. Read the current task and relevant project files first.
2. Do not change the chosen stack or architecture without a proposed decision and human approval.
3. Do not rewrite unrelated modules, replace files wholesale, or add dependencies without justification.
4. Do not claim tests were run unless the tool/environment actually ran them.
5. Provide changed files, assumptions, commands/tests and their results, known issues, and next step.
6. Use synthetic data unless authorized to process real data.
7. Never put secrets in source code, logs, example prompts, or client bundles.
8. Report disagreement with a requirement as a proposal; do not silently alter it.

### 17.3 Review loop

1. Planner writes the task and measurable acceptance criteria.
2. A second model critiques the task/spec for ambiguity/security gaps; the human resolves conflicts.
3. Implementer changes one bounded feature/branch.
4. Independent reviewer receives the spec, diff, relevant files, and test output—not just the implementer's summary.
5. Human or automated tests verify the review findings; only confirmed issues become required fixes.
6. Fixes are retested, reviewed, and committed.
7. Update documentation and mark the task done only after the quality gate in Section 13.2 passes.

Do not run more than one unresolved rewrite/review cycle at a time. Endless peer review can waste time and can cause models to introduce regressions while trying to satisfy stylistic preferences.

---

## 18. Prompt for another model to critique and refine this plan

A standalone, copy-ready version is also provided in `campus360_model_review_prompt.md`.

The reviewer should receive this document, the original HTML prototype, and the handwritten feature sketch. Ask it to review the plan against those source materials and current official technical documentation. It should recommend *specific deltas* with priority, rationale, risks, dependencies, and acceptance criteria. It must not implement code or overwrite the plan without showing changes. Details and the full prompt are in the companion file.

---

## 19. Reference sources and current operational checks

The following sources informed the initial direction and the v0.2 review consolidation. Provider features, model names, pricing, free-tier quotas, regional availability, and legal requirements may change; verify them again when building/deploying. Current plan and law statements below were checked on 23 October 2026; they are design inputs, not a substitute for reviewing the terms at deployment.

**Framework, hosting, and database**

- [R1] Next.js — Authentication guide: https://nextjs.org/docs/app/guides/authentication
- [R2] Vercel — AI SDK documentation: https://vercel.com/docs/ai-sdk
- [R3] Supabase — Database overview: https://supabase.com/docs/guides/database/overview
- [R4] Supabase — Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- [R5] Supabase — Billing/usage limits: https://supabase.com/docs/guides/platform/billing-on-supabase
- [R6] OpenStreetMap Foundation — Tile usage policy: https://operations.osmfoundation.org/policies/tiles/

**Cloud AI APIs and agent/tool interfaces**

- [R7] OpenAI — Function calling: https://developers.openai.com/api/docs/guides/function-calling
- [R8] OpenAI — Responses API overview: https://developers.openai.com/api/reference/responses/overview
- [R9] OpenAI — API pricing: https://developers.openai.com/api/docs/pricing
- [R10] Anthropic — Tool use: https://platform.claude.com/docs/claude/docs/tool-use
- [R11] Anthropic — API pricing: https://platform.claude.com/docs/en/about-claude/pricing
- [R12] Google — Gemini API function calling: https://ai.google.dev/gemini-api/docs/function-calling
- [R13] Vercel — AI SDK provider-agnostic toolkit: https://vercel.com/ai-sdk

**Self-hosting, security, and privacy**

- [R14] Ollama — Tool calling: https://docs.ollama.com/capabilities/tool-calling
- [R15] Ollama — Structured outputs: https://docs.ollama.com/capabilities/structured-outputs
- [R16] Qwen — Tool-calling concepts: https://qwen.readthedocs.io/en/latest/getting_started/concepts.html
- [R17] OWASP GenAI Security Project — Top 10 for LLM Applications: https://owasp.org/www-project-top-10-for-large-language-model-applications/
- [R18] Press Information Bureau / Government of India — DPDP Rules, 2025 notification: https://www.pib.gov.in/PressNoteDetails.aspx?ModuleId=3&NoteId=156054&lang=1&reg=3
- [R19] Supabase — Project pausing on Free plan: https://supabase.com/docs/guides/platform/free-project-pausing
- [R20] Supabase — Database backups (including Free-plan export guidance and Storage API object exclusion): https://supabase.com/docs/guides/platform/backups
- [R21] Supabase — Production checklist (pause/backup notes): https://supabase.com/docs/guides/deployment/going-into-prod
- [R22] Vercel — Hobby plan terms/usage: https://vercel.com/docs/plans/hobby and https://vercel.com/legal/terms
- [R23] Vercel — Function payload limits: https://vercel.com/docs/functions/limitations
- [R24] Next.js — Authentication, Server Actions and Route Handler authorization guidance: https://nextjs.org/docs/app/guides/authentication
- [R25] OpenStreetMap Foundation — Tile usage policy: https://operations.osmfoundation.org/policies/tiles/
- [R26] Press Information Bureau / Government of India — current summary describing lawful purpose/consent or legitimate use and phased 18-month implementation: https://www.pib.gov.in/PressReleaseDetail.aspx?PRID=2294910&lang=2&reg=48
- [R27] Press Information Bureau / Government of India — student data and DPDP Act/Rules overview including education-related child-data exemptions: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2202901&lang=2&reg=3
- [R28] OpenAI — API data controls and retention: https://developers.openai.com/api/docs/guides/your-data
- [R29] OWASP — Top 10 for LLM Applications: https://owasp.org/www-project-top-10-for-large-language-model-applications/

### Source interpretation

- The role/module list and original UX inspiration above are taken from the handwritten sketch and uploaded Campus360 HTML prototype.
- Stack, database, security, AI adapter, hosting, testing, and roadmap proposals are recommendations based on software engineering judgement and the official documentation linked above.
- Exact institutional rules, assignment constraints, API access entitlements, hosting budget, and legal applicability remain unconfirmed.
