# ADR-012: Canonical Skills and Skill Evidence

**Status**: Proposed

## Context

Matching and market aggregation need comparable skill names, while a profile must still let a user
express a niche or personal label. A proficiency claim alone is weak evidence for a match.

## Decision

Use a small shared canonical `skills_catalog`, controlled `skill_aliases`, and private custom
labels on `user_skills`. A skill claim can have many `skill_evidence` rows. Each row represents
exactly one typed source: a user-owned project, work experience, education entry, profile link, or
a bounded manual note. The finite Phase 1A source columns have real same-user composite foreign
keys; a check constraint permits exactly one source per row.

`self_assessment` remains explicitly self-reported. Future matching should favor linked evidence
over claimed proficiency; it must explain which evidence it used. Private custom labels never
automatically enter shared market aggregation. This is deliberately not a complete global
technical ontology.

## Alternatives considered

- **Unrestricted skill strings**: rejected; aliases and spelling variants make validation and
  market aggregation unreliable.
- **One project-evidence foreign key on a skill**: rejected; it cannot represent multiple or
  non-project evidence.
- **Fixed evidence foreign keys on `user_skills`**: rejected; putting one or many nullable
  project/experience/etc. slots on a single skill claim fixes its evidence capacity and makes
  multiple evidence awkward or ambiguous.
- **Dedicated typed `skill_evidence` association rows**: chosen. A skill has any number of rows,
  each row has exactly one typed source. A new evidence category requires a schema change; that is
  an accepted trade-off for real foreign-key integrity and clear querying at this scale.
- **Unconstrained `entity_type` + `entity_id` polymorphism**: rejected; it cannot enforce a real
  foreign key to the claimed target.

## Consequences

Every evidence row may only reference a parent with the same `user_id`; its exactly-one-source
check and bounded-note limit are migration/test requirements. Private note content is personal and
never a source for shared aggregation.
