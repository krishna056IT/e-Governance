# HacKBios System Architecture

## 1. Purpose and Boundaries

This document describes system responsibilities and data boundaries; it
does not define a frozen API contract or a selected backend technology.
The frontend is a presentation layer. The backend is the authority for
identity, authorization, workflow state, document access, verification,
routing, assignment, deadlines, notifications, and audit history.

```text
Applicant / Officer / General Officer / Admin
                     ↓
             Role-based frontend
                     ↓
                Backend API
       ┌─────────────┼─────────────┐
       ↓             ↓             ↓
 Private file    Database      Email/notification
 storage         and audit       delivery
       ↕
 OCR/document-understanding service
       ↓ extracted evidence/results
 Backend verification → Department routing → Officer assignment
```

The OCR service supplies extracted information and document
understanding results to backend workflow services. It does not own
business decisions, final routing, or assignment.

## 2. Actors and Organization

- Applicant accounts use email and password; password storage is
  hash-only. No Applicant OTP flow is required.
- There are 10 Departments, 15 government Officers per Department
  (150 total), and exactly one global Admin.
- Every Officer has one unique government Officer ID and belongs to
  exactly one Department.
- A General Officer handles escalated cases.
- Organization sizes are represented as data/configuration; frontend
  behavior must not depend on hard-coded organization counts.
- The initial ten Departments are provisioned idempotently from the
  backend with `npm run seed:departments` (run from `backend/`). This
  establishes baseline records by stable code without overwriting
  Admin-managed descriptions or activation state. Subsequent Department
  management uses the authenticated Admin Dashboard.

  After Departments are seeded, run `npm run seed:officer-registry` from
  `backend/` to upsert 15 synthetic registry identities per Department
  (for example `REV-001` and `MUN-001`) using reserved `example.test`
  addresses. This seeds allowlisted identities only; it never creates
  Officer User accounts.

## 3. Authentication and Provisioning

### Applicant

```text
Email + password → account registration → email + password login
```

Passwords are securely hashed and never stored in plaintext. No
additional email-verification step is specified.

### Officer

```text
Government Officer ID + registered name/email
  → validate active Government Officer Registry identity
  → create/reuse User with registry Department and PENDING status
  → Admin reviews and approves or rejects
  → Officer enters Government Officer ID on Officer Access to check status
  → approval makes password setup available to that Officer
  → Officer completes the existing 24-hour, single-use password setup
  → Officer sets a bcrypt-hashed password and logs in by ID or email
```

`GovernmentOfficerRegistry` stores synthetic development identities and
their Department/email mapping separately from User accounts. Registry
seeding never creates accounts. The User record is authoritative for the
account state (`PENDING`, `ACTIVE`, `REJECTED`, or `SUSPENDED`), the
existing `isActive` check remains in force, and pending/rejected/
suspended accounts cannot authenticate. Registry Department association
is not caller-selectable.

The existing JWT, bcrypt, User, Admin permission, and audit mechanisms
are reused. Officer setup token expiry and one-use consumption are
enforced by the backend. Password setup does not issue a session.
Successful setup requires password confirmation, clears
`mustChangePassword`, and permits normal Officer login and dashboard
access. Applicant/Admin authentication flows are unchanged.

No production email provider is configured. An injectable email sender
is the delivery boundary; production approval returns a safe success
message after delivery and never includes setup URLs or token values in
the API response. Status lookup accepts a registry Government Officer ID and returns only
the status and next action; it does not return identity details or
database fields. Password setup requires the separate random registration
credential issued at registration, in addition to the ID; its hash and
expiry are stored on the User record. It cannot access Officer
application routes. Successful setup consumes the setup token and
invalidates the registration credential.

In development, a mock transport may capture the recipient, subject,
safe metadata, and setup path in memory for testing. The Admin approval
flow exposes no setup link or preview API; the Officer checks approval
on Officer Access and uses the existing password setup form. Without a
configured production sender, approval fails explicitly rather than
activating an account without a deliverable setup credential. No
password is returned or logged.

Only an Admin with the existing `USER_MANAGE` permission can list,
inspect, approve, or reject registrations. Rejection requires a reason
and is audited. Approval is conditional on a current pending state and
an active registry identity/Department. Existing Admin staff creation
cannot create or promote Officer accounts outside this flow.

### Admin

There is exactly one global Admin. The documented authentication
concept is:

```text
Admin email → backend generates token → email link sent
            → Admin opens link → backend validates token
            → Admin authentication/activation action
```

The token purpose, lifetime, whether it is for activation/login/password
setup, whether Admin also has a password, and token recovery/reset
behavior are **OPEN**. Do not infer any of these details.

For local development only, the backend provides an explicit
`npm run seed:admin` command. It provisions or resets one Admin using
`ADMIN_EMAIL` and `ADMIN_PASSWORD` from `backend/.env`, hashes the
password with the existing bcrypt mechanism, and refuses to run outside
`NODE_ENV=development`. This is a development bootstrap for the current
email/password login implementation; it does not resolve or replace the
production Admin authentication decision above. Never commit the local
`.env` file or use development credentials in production. To initialize
it, create `backend/.env` from `backend/.env.example` if it does not
exist; otherwise add `ADMIN_EMAIL` and `ADMIN_PASSWORD` to the existing
file without replacing its database settings. Set a private
`ADMIN_PASSWORD` of at least 12 characters, then run
`npm run seed:admin` from `backend/`. Re-running the command resets the
password only when the configured email matches the existing Admin; it
refuses to create a second Admin or change a non-Admin account's role.

### Authorization

The backend authenticates and authorizes every operation, checks the
actor's role and resource scope, and authorizes every original-document
read/download. Frontend route guards are for user experience only.

## 4. Application Processing Responsibilities

### Document intake and OCR

1. Backend validates the upload and stores the original privately.
   Applicant uploads accept PDF, PNG, and JPEG, have a configurable
   maximum size, and use server-generated storage IDs outside static
   directories. MongoDB stores metadata only; files and OCR text use
   private backend storage.
2. Local Tesseract OCR processes images; PDF.js renders PDFs for OCR.
   OCR confidence and status are persisted separately from the original
   document and extracted text.
3. The unchanged backend confidence gate uses configurable
   `OCR_THRESHOLD` (default 90%). Scores below it are persisted as
   requiring human verification with a pending state; scores equal to
   or above it are marked completed.
4. Below-threshold documents cannot enter document understanding,
   Department classification, routing, or assignment until an
   authorized General Officer/Human Verification officer verifies them.
   Verification rejection is delegated to the existing rejection/
   escalation workflow; the gate does not define an application-state
   transition.
5. A verified low-confidence document continues through broader
   document understanding before backend classification and routing.
6. Processing errors leave the original and metadata intact and record
   an OCR failure state. Retry orchestration is not yet implemented.

Applicant document metadata is scoped to the owning application.
Original files are returned only through an authenticated endpoint that
checks ownership or the dedicated pending-verification role/permission;
there is no public static document route. Extracted OCR text is not
returned to Applicants.

OCR must not approve/reject applications, make final business-rule
decisions, determine final Department routing, or assign Officers.

OCR confidence is extraction reliability, not Department-routing
confidence. The OCR threshold is configurable through backend
configuration/environment and must have one source of truth.

### Low-confidence human verification

This is a dedicated processing-stage permission, separate from ordinary
Officer review and the still-open General Officer escalated-case
decision set. Backend authorization must require an authorized
`GENERAL_OFFICER` or `HUMAN_VERIFIER` actor with the
`HUMAN_VERIFY_OCR` permission. The queue exposes application/document
identity, document type, OCR score/text, private original-document
access, reason, verification status, and submission time only to such
authorized actors. Verification and rejection decisions require an
append-only audit event; document update and audit recording must be
committed together with a conditional pending-status update. Sensitive OCR text must not be copied into
application logs or audit metadata.

### Business verification

Backend business rules evaluate the application and relevant evidence,
including OCR results where appropriate. Results and rationale needed
for workflow history are recorded. Officers receive only authorized
application information and original documents required for review;
they do not receive OCR/AI inspection controls, confidence controls,
missing-field AI warnings, or direct OCR manipulation.

### Department routing

Backend routing selects a Department after processing and verification
inputs are available. It considers broader relevant
application/document-understanding content to reduce wrong routing.
OCR output is evidence; the routing decision belongs to backend routing
logic. An uncertain result follows an explicit fallback rather than a
silent guess. The classifier and thresholds are not fixed here.

### Officer assignment

After a Department is selected, the assignment service:

1. selects only eligible Officers belonging to that Department;
2. counts each eligible Officer's assigned applications in
   `ASSIGNED` or `UNDER_REVIEW`;
3. chooses the Officer with the lowest count;
4. breaks equal-count ties by oldest `lastAssignedAt` first (never
   assigned sorts first), then government Officer ID in ascending
   stable order;
5. atomically creates the assignment and updates assignment fairness
   metadata.

If no eligible Officer is available, the application enters
`WAITING_FOR_OFFICER`. It must not be silently assigned to another
Department.

Selection and assignment must be concurrency-safe: use a transaction
with appropriate row/advisory locks or equivalent serialization, and
enforce at most one active assignment per application. The pending count
and assignment must be evaluated/committed atomically so concurrent
submissions cannot over-assign based on stale counts. Retries must not
create duplicate active assignments.

For this purpose, pending workload includes exactly:

- `ASSIGNED`
- `UNDER_REVIEW`

It excludes `DRAFT`, `SUBMITTED`, `PROCESSING`, `ROUTED`,
`WAITING_FOR_OFFICER`, `ESCALATED`, `CORRECTION_REQUIRED`,
`RESUBMITTED`, `APPROVED`, and `REJECTED`. Whether any correction and
resubmission flow uses these states remains **OPEN**; no resubmission
transition is authorized until that flow is approved.

An eligible Officer must be associated with the routed Department and
available for assignment according to the backend's authoritative
availability data. The precise administrative controls for availability
remain an implementation detail consistent with product policy.

## 5. Officer and General Officer Workflow

An Officer receives assigned cases, views authorized application data
and original documents, sees status/deadline information, reviews, and
records an adverse or uncertain finding. The currently assigned Officer
must explicitly start review to transition an application from
`ASSIGNED` to `UNDER_REVIEW`; viewing the case does not perform the
transition. That finding creates an escalation; it does not become
final `REJECTED`.

Escalation preserves at least:

- application ID;
- originating Officer;
- reason;
- timestamp;
- escalation status;
- references to the application/document versions reviewed;
- original Officer action and full audit history.

The General Officer handles escalated cases and may approve or reject
them; rejection requires a reason. The General Officer identity,
decision, reason, and timestamp are persisted separately from the
originating Officer's review. Resolved cases cannot be decided again.
The original escalation and Officer action remain immutable history.

The canonical state vocabulary includes outcome and correction-related
states, but transitions from General Officer review to those states are
not authorized until the corresponding actions are explicitly approved.
Any future correction/resubmission workflow must preserve prior
application/document versions; whether and how that flow exists remains
**OPEN**.

## 6. Conceptual State Models

### Applicant authentication

```text
Email + password registration → email + password login
```

This is not an application state model. No Applicant OTP or separate
email-verification step is specified.

### Application

```text
DRAFT → SUBMITTED → PROCESSING → OFFICER_REVIEW
                                    → ASSIGNED
                                         → UNDER_REVIEW
                                           (explicit Start Review by an
                                            Officer in Department scope)
                                              ├→ APPROVED
                                              ├→ REJECTED (reason required)
                                              └→ ESCALATED (reason required)
                                                   → APPROVED by General Officer
                                                   └→ REJECTED (reason required)
```

Only authorized transitions are accepted by the backend. The
`ASSIGNED → UNDER_REVIEW` transition requires an explicit Start Review
command by an authenticated Officer in the application's Department
scope; a read operation cannot cause it. Officer approval and rejection
are persisted outcomes, and rejection requires a reason. Escalation
requires a reason and enters `ESCALATED`. A General Officer may resolve
only escalated cases to `APPROVED` or `REJECTED`; rejection requires a
reason. Both outcomes persist the authenticated General Officer and
decision timestamp. New applicant submissions pass through
`PROCESSING` and reach `OFFICER_REVIEW` only when OCR is complete and
any required Human Verification is complete.
`CORRECTION_REQUIRED`, `RESUBMITTED`, and their transitions remain
**OPEN** pending approval of a correction workflow. The current Officer
implementation enforces Department scope; individual Officer
assignment is not yet modeled.
Deadline breach is a separate property/event and can
coexist with any nonterminal workflow state.

## 7. Conceptual Data Model

This is a logical model, not a required database schema.

### User

`id`, `email` (where applicable), `role`, `accountStatus`,
`passwordHash` (where password authentication applies), timestamps.
Never persist a plaintext password.

### Applicant

`userId` and Applicant-specific profile fields required by the
application process.

### Officer

`userId`, unique `governmentOfficerId`, required `departmentId`,
assignment eligibility/availability data, `lastAssignedAt`.

### Department

`id`, unique name, unique stable code, optional description, active
status, and timestamps. Initial Department records are seeded; ongoing
management is performed through the Admin Dashboard. Organization
counts are data, not frontend constants.

### Admin

One global Admin identity/account, with organization-wide authorization
scope. Conceptual email-token link authentication is required, but
token purpose/lifetime, password relationship and recovery behavior
remain **OPEN**.

### OfficerCredentialSetup

Officer/account reference, secure token hash, purpose, expiry, consumed
timestamp, creation timestamp. This entity may share an implementation
with other secure token challenges, but must enforce expiry and
single-use semantics.

### AdminEmailToken

Admin reference, secure token hash, creation/expiry timestamps, and a
purpose only after that purpose is approved. Any additional token
lifecycle metadata must follow the approved flow. Token purpose,
lifetime, password relationship, and recovery/reset behavior are
**OPEN**. Never store or log plaintext token values.

### Application

`id`, application number, Applicant reference, current status,
Department reference when routed, deadline and breach metadata,
created/updated timestamps, current version reference.

### ApplicationDocument

`id`, application/version reference, document type, private storage
key, MIME type, size, upload timestamp. No public URL and no OCR text
field on the original-document record.

### OCRResult

Document/version reference, processing status, OCR confidence score,
configured threshold used for that attempt, extracted content or
protected reference, structured understanding,
model/processor metadata, timestamps, human-verification-required and
status, verifier and verification timestamp where applicable. Stored
separately from the original and access-controlled. The confidence
score is a percentage from 0 through 100; the configured threshold
defaults to 90%.

### HumanVerification

Application/document/version references, reason, current verification
status, authorized verifier, decision/note, submitted and resolved
timestamps. Preserve the original and OCR result. Each decision has an
append-only audit event. A verified result releases processing to
document understanding; a rejection invokes the existing rejection/
escalation workflow without creating a new application state here.

### VerificationResult

Application/version reference, backend rule/check identifiers,
outcome, rationale/evidence references, timestamps. It is not an OCR
decision.

### ApplicationAssignment

Application reference, Department, Officer, assigned timestamp,
active/ended state, assignment history and relevant reason.
Constraints prevent duplicate active assignment and cross-Department
assignment.

### Escalation

Application/version, originating Officer, reason, timestamp, status,
General Officer/resolution references, decision timestamps. Do not
overwrite earlier escalations or Officer actions.

### ApplicationEvent / AuditLog

Actor, action, entity/version reference, safe metadata, timestamp.
Append-only or equivalently immutable; exclude secrets and unnecessary
document contents.

### Notification

Recipient, event/template reference, delivery status, timestamps, and
safe retry metadata. Do not store token plaintext in notification logs.

## 8. Integration/API Boundary

No API contract is frozen by this document. Before integration, define
versioned endpoints and schemas for:

- Applicant email/password registration and login, logout/session
  lifecycle;
- Government Officer Registry seeding/validation, Officer self-
  registration, Admin review/approval/rejection, one-time password
  setup, and login;
- application create/read/submit/list; correction/resubmission only if
  that workflow is approved;
- private document upload, authorized retrieval and document status;
- OCR processing status/results, confidence gate, authorized human
  verification queue/actions, and protected result access;
- verification outcomes and workflow transitions;
- Department routing and routing fallback;
- Officer queue/detail/review/escalation;
- General Officer queue/detail and approved actions when finalized;
- Admin organization-wide views and permitted management actions;
- deadline/breach views and notification delivery status;
- audit history.

Every operation requires server-side authentication/authorization,
validation, explicit error behavior, and appropriate idempotency and
concurrency semantics. Do not treat this capability list as permanent
URLs.

## 9. Privacy, Storage, and Failure Handling

- Original documents are stored in private file storage and served only
  after backend authorization. Never issue public document URLs.
- OCR results are stored separately from original documents.
- Scores below configured `OCR_THRESHOLD` are persistently marked as
  requiring human verification and are blocked from automatic routing
  until verified. Threshold defaults to 90%.
- Only an authenticated, authorized verifier may retrieve the original
  or OCR output for this queue. No public URLs are issued.
- Database records hold metadata, relationships, workflow state and
  protected result references as appropriate.
- Sensitive data is encrypted in transit and protected at rest according
  to the deployment security policy.
- OCR failure preserves the application and original document, records
  failure, and supports the approved retry/manual path.
- Routing uncertainty uses an explicit configured fallback; never
  silently choose a Department.
- Assignment unavailability produces `WAITING_FOR_OFFICER`; it never
  routes to a different Department.
- Officer credential setup/reset failures do not activate a credential
  and must not expose secret values.
- Admin email-token failures must not expose secret values or complete
  authentication/activation outside the approved flow.
- Deadline processing must recover after service failure without losing
  application data or breach history.

## 10. Deadlines and Audit

Keep deadline/breach orthogonal to application state. At minimum,
represent `deadlineAt` and breach occurrence/time (for example
`breachedAt`). Exact SLA, grace period, consequences and notification
policy remain open.

Record significant state changes, submissions/versions, processing
results, routing, assignment, Officer findings/escalations, and
deadline events. Record General Officer decisions, correction/
resubmission events, notifications and Admin actions only as those
actions and policies are approved. Audit history must preserve actor,
time, relevant version and action without secrets.

## 11. Open Decisions

See `PRD.md` for the shared decision list. The architecture must not
silently resolve:

- Admin email-token purpose/lifetime/password relationship/recovery;
- Production email sender/retry policy for Officer password setup;
- Officer direct approval authority;
- General Officer action set and resulting application transitions;
- routing algorithm, confidence and uncertainty fallback;
- provisioning/grant mechanism for the dedicated OCR human-verification
  permission;
- post-correction routing/reassignment behavior;
- SLA, breach consequences and notification policy;
- Applicant email/password account recovery behavior;
- Admin management permissions and retention policy.
