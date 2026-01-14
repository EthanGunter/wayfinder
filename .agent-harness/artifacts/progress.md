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
2026-01-12: [func] Skill Sprint persistence layer next — unblock storing/reading plan, adjustments, daily challenges, journal.
2026-01-12: [plan] Skill Sprint: LLM provider seam + prompt contract — unblock dev harness + deterministic artifact updates without vendor lock-in. LLM seam: Convex action; non-streaming v1; message formatting outside seam; per-user provider settings live in users.settingOverrides.llm; user secrets plaintext in closed alpha pending encryption planning (E2E vs TLE, switchable).
2026-01-13: [func] LLM: implement provider seam (Convex action) — unblock provider-agnostic dev harness + Skill Sprint calls without vendor lock-in.
2026-01-13: [ux] Skills settings: configure LLM providers — Add settings tab for provider/model selection + user API key management via settingOverrides.llm
