# Security Policy

CareerOS is currently an early-stage, non-deployed portfolio project. There is no production
service and no real user data — the only data that exists is local, throwaway development
fixtures (see [docs/SECURITY_AND_PRIVACY.md](docs/SECURITY_AND_PRIVACY.md) and
[docs/DEPLOYMENT_STRATEGY.md](docs/DEPLOYMENT_STRATEGY.md)).

## Supported branch/version

Only the `main` branch is supported. There are no released versions or long-lived branches other
than `main`; a security report against anything else (an old feature branch, a closed pull
request) will be treated as informational at best.

## Reporting a vulnerability

- If GitHub's private vulnerability reporting is enabled for this repository (Security tab →
  "Report a vulnerability"), please use it instead of a public issue.
- If it is not enabled, or you are unsure, do not open a public issue with exploit details. Reach
  out through a private channel first (e.g., a GitHub direct message to the maintainer, if
  available) describing only that you have a security concern, and wait for a response before
  sharing details.
- Please do not send real resumes, real credentials, or any real personal application data as part
  of a vulnerability report or proof of concept — this project's own data model treats that kind of
  data as sensitive (see [docs/SECURITY_AND_PRIVACY.md](docs/SECURITY_AND_PRIVACY.md)), and a
  report is not an exception. Use synthetic/fake data to demonstrate an issue.

## What to expect

This is a solo-maintained student project, not a company with an SLA. There is no guaranteed
response time. Reports will be read and acknowledged on a best-effort basis, and fixed according to
severity and the maintainer's availability — realistic expectations for a project at this stage,
not a promise of rapid turnaround.
