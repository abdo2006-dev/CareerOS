# ADR-012: Canonical Skills and Skill Evidence

**Status**: Proposed

## Context

Matching and market aggregation need comparable skill names, while a profile must still let a user
express a niche or personal label. A proficiency claim alone is weak evidence for a match.

## Decision

Use a small shared canonical `skills_catalog`, controlled `skill_aliases`, and private custom
labels on `user_skills`. A skill claim can have many `skill_evidence` items. Evidence may point to
a user-owned project, work experience, education entry, profile link, or bounded manual note.

`self_assessment` remains explicitly self-reported. Future matching should favor linked evidence
over claimed proficiency; it must explain which evidence it used. Private custom labels never
automatically enter shared market aggregation. This is deliberately not a complete global
technical ontology.

## Alternatives considered

- **Unrestricted skill strings**: rejected; aliases and spelling variants make validation and
  market aggregation unreliable.
- **One project-evidence foreign key on a skill**: rejected; it cannot represent multiple or
  non-project evidence.
- **Multiple nullable evidence foreign keys**: rejected; it makes every new evidence type a schema
  change and permits ambiguous combinations.
- **Canonical catalog plus generic evidence associations**: chosen; it preserves controlled
  matching while supporting multiple evidence types without over-modeling the catalog.

## Consequences

The generic association needs ownership-safe validation: an evidence row may only reference a
parent row with the same `user_id`. A bounded note is capped and treated as personal content, not
as a source for shared aggregation.
