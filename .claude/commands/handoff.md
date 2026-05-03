---
description: Append a dated handoff section to HANDOFF.md so the next session can pick up cleanly
allowed-tools: Read, Write, Edit, Bash
---

Read HANDOFF.md in the project root, then append a **new dated section** (do not overwrite old sections) with these bullet groups:

## HANDOFF — $CURRENT_DATE

**Current task** — one sentence on what you were literally in the middle of

**Done this session** — bullet per shipped item (feature, fix, deploy)

**Next step** — numbered list of the exact next 3–5 actions to take when resuming

**Key decisions made** — architectural or product choices locked in

**Gotchas (carry forward)** — things that will bite the next Claude

**Files touched** — key files changed/created (path + one-line summary)

Rules:
- Bullets only. No prose paragraphs.
- Be specific: include file paths, version numbers, env var names.
- Keep each bullet under 20 words.
- Use BST timestamps where relevant.

After writing, output exactly:

---
Handoff written to HANDOFF.md. Now run /clear and paste the latest section back in as your first message to resume cleanly.
---
