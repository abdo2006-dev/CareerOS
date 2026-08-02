# Security and Privacy

Status: **proposal**, built to be a real threat-handling document, not a checklist restated
without application to this system.

## 1. What this system holds

Education/employment history, skills, project evidence, preferences, minimized work eligibility,
application records, saved job descriptions, and third-party public content (opportunity postings).
Resume content is deferred to Phase 1B. Profile data is sensitive personal data the user would not
want exposed to anyone else, including a future second user of the same system.

## 2. Authentication

**Implemented as of Phase 0**: Supabase Auth with email/password (magic link and OAuth/social
login are not implemented — see [ADR-008](adr/ADR-008-private-first-multi-user-later.md) and
[DEPLOYMENT_STRATEGY.md](DEPLOYMENT_STRATEGY.md) for why password auth was chosen). Signs in via
the real password grant endpoint, issuing a JWT scoped to one user. The frontend never holds
long-lived credentials; the session token is what authorizes direct Postgres access via
PostgREST, checked against RLS policies on every request. Public self-service signup is disabled
(`enable_signup = false`); accounts are created exclusively through the Admin API, using the
service-role/secret key from a trusted context — never through the public signup flow, locally or
in a future hosted production project. See
[ADR-008](adr/ADR-008-private-first-multi-user-later.md) for why this is built as
real-auth-from-day-one rather than a shortcut.

## 3. Authorization: Row Level Security is the actual boundary

Every user-owned table (see [DATA_MODEL.md](DATA_MODEL.md)) has an RLS policy of the form
`(select auth.uid()) = user_id`. This is enforced by Postgres itself, not by frontend logic — the
frontend UI hiding a button is not a security control. As implemented in Phase 0, every migration
also explicitly `REVOKE ALL` on `anon`/`authenticated`/`service_role` before granting back exactly
the intended privileges — Supabase's own default per-schema privileges otherwise grant more than
intended (see [RLS_POLICY_MATRIX.md](RLS_POLICY_MATRIX.md) for the specific finding), so nothing
here is left to a platform default. Shared/global tables (opportunities, source
listings, sources) are readable by any authenticated user and writable only by the service-role
key, which lives only in GitHub Actions secrets and is never sent to the browser or embedded in
any client-side bundle. The narrow exception — a user confirming or rejecting a potential
duplicate — is deliberately not a direct table grant; it goes through a restricted
`SECURITY DEFINER` function, exactly as specified in
[RLS_POLICY_MATRIX.md](RLS_POLICY_MATRIX.md#opportunity-identity-and-content-domain-sharedglobal).

**[RLS_POLICY_MATRIX.md](RLS_POLICY_MATRIX.md) is the authoritative, exhaustive table-by-table and
bucket-by-bucket permission reference** — it enumerates every table's and storage bucket's
SELECT/INSERT/UPDATE/DELETE permissions, the expected RLS predicate, anonymous-access status, and
the isolation test each row requires. This section states the *principle*; that document is the
*checklist* a migration must satisfy.

**Implemented Phase 1A profile-core hardening**: section revisions and reviews are browser
read-only. The only review mutation is a narrowly granted `SECURITY DEFINER` RPC that derives the
caller from `auth.uid()`, locks that user's current revision, and records that exact value. Primary
education selection likewise uses a narrowly granted ownership-checking RPC; browser clients do
not have column privilege to set `is_primary` directly. Every privileged function fixes its search
path, revokes default `PUBLIC` execution, and grants only the browser RPCs to `authenticated`.

**Row-level data isolation for future public users**: because the schema is already `user_id`-
scoped and RLS-enforced, enabling additional user accounts later is a matter of allowing sign-up —
the isolation mechanism doesn't change. This is the concrete mechanism behind the "private-first,
multi-user-later" claim in the project brief; it is not just an aspiration.

## 4. Secret storage

- Supabase service-role key: GitHub Actions repository secret, used only inside ingestion/scoring
  jobs, never logged, never in a committed file.
- Any future third-party API keys (event platform APIs, government job-portal API keys): same
  treatment — repository/environment secrets, least-privilege scopes where the provider supports
  them.
- No secret is ever placed in a file committed to the repository, including `.env` files — a
  `.env.example` with placeholder names is the pattern once implementation starts.
- **The repository is public** (see [ADR-009](adr/ADR-009-zero-cost-mvp-deployment.md) and
  [README.md](../README.md)), which means its full history, every branch, pull-request content,
  and GitHub Actions logs/artifacts are publicly visible. GitHub Actions repository secrets remain
  safe under a public repository — they are never exposed in the workflow file itself, and GitHub
  masks a secret's literal value in logs if it's registered as a repository secret. Local
  development goes further and doesn't rely on masking at all: `supabase/scripts/setup-local-users.mjs`
  generates a fresh random local-only development password each run and prints only that (never
  the Supabase secret key) so it can be used to sign in;
  `supabase/scripts/api-integration-test.mjs` generates its own random per-run password too, but
  never prints it, any access token, or the secret key, since it never needs to be typed by a
  human.

## 5. Resume and application data privacy

**Phase boundary**: Phase 1A collects only manual profile data. It records no resume file,
extraction output, imported suggestion, or extraction-specific provenance column. Phase 1B must
keep parsed suggestions separate from confirmed records and revisit field/suggestion-level
provenance; a row-level manual marker does not solve mixed-origin data.

- Resumes stored in a private Supabase Storage bucket; access only via short-lived signed URLs
  generated server-side (by the ingestion job) or via RLS-scoped client requests — never a public
  bucket.
- Resume text is never included in application logs. Ingestion/parsing job logs may record
  resume *record IDs* and processing status, never resume *content*.
- Data export: the user must be able to obtain their own profile, resumes, saved opportunities,
  and application history in a portable form (proposal: a JSON export endpoint/script) — deferred
  implementation, but the schema must not make this structurally hard (it doesn't: everything is
  relational and user-scoped).
- Profile/account deletion: the browser must not directly delete `profiles`, because that would
  cascade the career profile while leaving the Auth user alive. A later explicit trusted workflow
  must coordinate export/confirmation requirements, Auth-user deletion, user-owned database rows,
  and Storage objects. It must be documented and tested before any second real user is onboarded,
  not a raw browser or developer `DELETE`.

## 6. Untrusted external content

Every opportunity description, requirement line, and event page originates as untrusted external
HTML/text. Handling rules:

- **Sanitization happens at ingestion**, before storage — strip scripts and active content,
  normalize encoding, cap payload size, reject non-text content types unexpectedly returned by a
  source.
- **The raw, unsanitized response is not retained by default.** Only the sanitized,
  normalized snapshot (`opportunity_versions`, see [DATA_MODEL.md](DATA_MODEL.md)) is part of the
  product's durability promise. A separate, disabled-by-default debug table
  (`raw_capture_debug`) may be turned on temporarily during adapter development, with a short,
  documented retention period (proposal: 14 days) and automatic cleanup — never indefinite
  retention "just in case." See
  [ARCHITECTURE.md](ARCHITECTURE.md#raw-external-content-retention-policy) for the full policy.
  This bounds how much unsanitized third-party content the system ever holds at rest, which
  matters for both attack surface and data-minimization.
- **Raw content, whenever it exists under that debug path, is never rendered to the frontend and
  never sent to any LLM** — including one with tool-calling/action permissions. Only the sanitized
  snapshot is eligible for rendering or for any future LLM-explanation feature (see
  [ADR-005](adr/ADR-005-explainable-ranking-before-llm-ranking.md)).
- **Automated test fixtures never contain a real, unmodified raw external response.** Fixtures
  checked into the test suite are hand-sanitized or synthetic, consistent with the retention
  policy above — see [TESTING_STRATEGY.md](TESTING_STRATEGY.md#6-sanitization-and-security-relevant-tests).
- **Rendering defense in depth**: the frontend still escapes/sanitizes on render (never
  `dangerouslySetInnerHTML`-equivalent on raw source text) even though ingestion already
  sanitized, because a future source or a bug in one adapter should not become a stored XSS
  vector.
- **Prompt injection through scraped text**: if an LLM is ever used to summarize or explain a
  posting (see [SCORING_AND_MATCHING_MODEL.md](SCORING_AND_MATCHING_MODEL.md)), the posting text
  is passed only as data within a clearly delimited context, never concatenated into a system
  prompt or treated as containing instructions. Any text within a posting that reads like an
  instruction to an AI system ("ignore previous instructions," "you are now...") must be treated
  exactly like any other job-description text — summarized as content, never obeyed.

## 7. Server-side request forgery (SSRF)

The user-submitted-link adapter (see
[DATA_SOURCES_AND_COMPLIANCE.md](DATA_SOURCES_AND_COMPLIANCE.md)) is the primary SSRF surface: it
makes a server-side (GitHub Actions job) HTTP request to a URL a user provides. Mitigations:

- Reject non-`http(s)` schemes outright.
- Resolve the hostname and reject requests targeting private/internal/link-local IP ranges (RFC
  1918, loopback, link-local, and cloud metadata endpoints like `169.254.169.254`) before
  connecting — checked at connection time, not just on the input string, to defend against
  DNS-rebinding.
- Enforce a request timeout and a response-size cap.
- No redirects followed to a disallowed target (re-validate the final resolved host after any
  redirect).

## 8. Untrusted file uploads (resumes)

- Validate actual file type by content, not just filename extension.
- Enforce a maximum file size.
- Parse with a library that fails safely on malformed input; a corrupt or malicious PDF/DOCX must
  produce a `failed` status on the `resumes` row, not a crashed job that silently drops future
  processing.

## 9. Logging without leaking personal data

- Ingestion/scoring job logs record IDs, counts, timings, and error types/messages — never resume
  text, never full opportunity description bodies, never profile field values.
- Any future error-tracking/observability tool (see [OBSERVABILITY.md](OBSERVABILITY.md)) must be
  configured to scrub or avoid capturing request bodies that could contain profile or resume data.

## 10. User confirmation before consequential AI actions

The system does not send emails, submit applications, or take any externally-visible action
automatically. Any future feature that drafts an email or message on the user's behalf requires
explicit user review and an explicit send action every time — no "auto-send after N minutes" and
no standing auto-send rule, consistent with the project's non-goals
([MVP_SCOPE.md](MVP_SCOPE.md)).

## 11. Data minimization

Only fields that serve a stated product requirement (see
[PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md)) are collected. No unrelated personal data
(e.g., no reason to ever collect government ID numbers, financial information, or health data) is
requested by this product, and no such field should ever be added without updating this document
first.

For work eligibility, the permitted Phase 1A representation is only a self-reported structured
state, optional weekly-hour limit, and last confirmation time. Passport numbers, permit scans,
government identifiers, immigration narratives, and legal advice are explicitly out of scope; see
[ADR-015](adr/ADR-015-minimized-work-eligibility-representation.md).
