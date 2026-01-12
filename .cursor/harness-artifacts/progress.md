# Agent Progress Cache

**Purpose**: Durable notes that save future agents time. Not a session log. Not for user consumption.

**Rules**:
- Append-only, <=10 lines per session
- Log only: constraints, gotchas, invariants, or next-task recommendations
- Never: commands, implementation details, test transcripts, or transient issues
- Git history shows what happened; this shows what you must know
- If this is a code-specific note that needs to be addressed later, prefer adding `// TODO:{{category}} {{thing to fix/refactor/improve}}`
---

2026-01-12: [func] Skill Sprint scaffold shipped — `/dev` gate fixed; `/dev` gate fixed; `/dev/skill-sprint` page added; dev links surfaced in header for dev-enabled users.
2026-01-12: [func] Skill Sprint Convex schema shipped — adds 5 tables + indexes to unblock persistence layer.
