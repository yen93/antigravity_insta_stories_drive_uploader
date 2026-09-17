---
name: "dcp"
description: "Save this chat session to chat_history/, create or update as_built.txt, create or update CLAUDE.md, then commit and push everything to GitHub. Use when the user says to save/export the chat and push updates (e.g. \"/dcp\", \"save this chat and push to github\")."
---

# dcp — document, commit, push

Run these four steps in order, in `${CLAUDE_PROJECT_DIR}`.

## 1. Save the chat transcript

Get a timestamp for the filename:

```bash
date +%d%m%y%H%M
```

Write the **entire current conversation** (from its start through this /dcp invocation) to a new file at:

`${CLAUDE_PROJECT_DIR}/chat_history/<timestamp>_chat_history.txt`

where `<timestamp>` is the `ddMMyyHHmm` value from the command above (day, month, 2-digit year, hour, minute — no separators). This naming convention (`ddMMyyHHmm_chat_history.txt`) replaced an earlier `ddMMyy_chat_history.txt` convention — always use the full `ddMMyyHHmm` form for new files, even if older files in the folder use the shorter form.

If `chat_history/` doesn't exist yet, create it. Look at any existing files already in `chat_history/` first and match their format/tone. If none exist, use this structure:

```
================================================================================
CHAT HISTORY EXPORT — <YYYY-MM-DD>
Session: <one-line description of what this session was about>
================================================================================

NOTE ON REDACTIONS: <only include this paragraph if the session actually
involved a live secret/credential/token pasted into the chat; describe what
was redacted and why. Omit the whole paragraph entirely if nothing needed
redacting — don't imply redactions happened when they didn't.>

--------------------------------------------------------------------------------
USER:
<summarize the user's message(s) — condense long instructions to their
substance, but keep specifics like file paths, numbers, and decisions intact>

--------------------------------------------------------------------------------
ASSISTANT:
<summarize what was actually done: key findings, tool calls and their outcomes,
questions asked and the answers given, files changed, anything published or
pushed. Write it as narrative prose, not a transcript dump — condense large
tool outputs to their substantive findings rather than reproducing them
verbatim. Preserve the back-and-forth order.>

--------------------------------------------------------------------------------
<continue alternating USER / ASSISTANT sections, separated by the dashed rule,
for the rest of the session>

================================================================================
END OF EXPORT
================================================================================
```

### Security check (mandatory, before writing the file)

Before writing anything to disk, scan the **entire** conversation content you are about to write — every turn, not just the most recent one, including text inside quoted tool output, code blocks, error messages, and file contents that may have echoed a secret — for anything that must never be committed to a (potentially public) repo. This is a hard gate: do not proceed to write the file until this pass is done. Look for things like:

- Passwords / passphrases
- API keys, tokens, bearer tokens, auth headers
- Private keys / certificates (`-----BEGIN ... KEY-----` blocks, `.pem`/`.key` contents, etc.)
- Connection strings / database URIs with embedded credentials
- Session cookies / session IDs
- Cloud or service credentials (AWS access keys, service account JSON, OAuth client secrets, etc.)
- Any other value that looks like a live secret the user pasted into the chat

Replace each finding with a descriptive `[REDACTED_*]` placeholder (e.g. `[REDACTED_API_KEY]`, `[REDACTED_PASSWORD]`) and note it in the "NOTE ON REDACTIONS" paragraph. Never write a real secret into the file, even partially or truncated. If nothing was found, omit the redactions paragraph entirely — don't imply redactions happened when they didn't.

## 2. Create or update as_built.txt

`${CLAUDE_PROJECT_DIR}/as_built.txt` is a living, factual inventory of what currently exists in the project — distinct from `CLAUDE.md` (dev-facing conventions/gotchas for a future Claude session) and from `chat_history/` (a per-session narrative log that keeps growing). It answers "what's actually built right now," not "how did we get here" or "how should Claude behave here." It is overwritten in place, not appended to.

- If it doesn't exist, create it.
- If it exists, update it to reflect the current reality — add new components this session introduced, edit or remove entries that changed or are no longer true, and bump the "Last updated" line. Don't just append; keep it an accurate current-state snapshot.
- If nothing this session did changes the project's actual built state (e.g. a chat-only session, or a change already fully reflected in the file), skip this step silently rather than making a cosmetic edit.

Use this structure, with only the sections that apply (omit empty ones; add an `OTHER` section for anything that doesn't fit):

```
================================================================================
AS-BUILT — <project name>
Last updated: <YYYY-MM-DD>
================================================================================

SCRIPTS
- <path> — <one or two lines: what it does>.
  Requires: <env vars / config it needs, and where they live — e.g. ".env">

EXTERNAL INTEGRATIONS
- <service name> (<host/URL>) — <how it's accessed, e.g. "REST API">,
  credential in <location, e.g. ".env", "gitignored">

DATA STORES
- <table/db/file — what it holds, naming pattern if dynamic>

AUTOMATIONS / ROUTINES
- <name> (<what runs it — cron, cloud routine, manual>) — <what it does>
================================================================================
```

### Security rule (same hard gate as step 1)

Never write an actual secret value into `as_built.txt` — only note *where* a credential lives (e.g. "in `.env`, gitignored") and, for any external routine/webhook token, that it exists and where it's stored. If in doubt, treat it like the chat-transcript security check above.

## 3. Create or update CLAUDE.md

- If `${CLAUDE_PROJECT_DIR}/CLAUDE.md` doesn't exist yet, create it: write a concise CLAUDE.md reflecting what's actually known about the project from this session and the repo as it stands — non-obvious architecture, how to build/run/test it, key conventions and gotchas a future Claude session would need. Keep it grounded in what you've actually seen; this isn't a mandate to do a full from-scratch repo audit the way `/init` does, just to capture a genuinely useful starting point rather than skip it entirely.
- If it already exists, check whether anything done in this session makes it inaccurate or incomplete: new/removed/renamed scripts or commands, changes to the data pipeline or architecture, new env vars or setup steps, new conventions or gotchas a future session would need. Judge this from what actually changed, not from the existence of a diff — a chat-history-only session or a change already covered by what's written there needs no edit. If an update is warranted, edit it directly to reflect the new reality, following its existing structure and level of detail (non-obvious architecture and commands, not exhaustive file listings or generic advice). If no update is needed, skip silently rather than making a cosmetic edit.

## 4. Commit and push

From `${CLAUDE_PROJECT_DIR}`:

1. Check whether `.gitignore` exists in the project root. If it doesn't, this directory hasn't been set up for git yet — before doing anything else:
   - Create a `.gitignore` covering at minimum: `node_modules/`, `.env`/`*.env`, and common credential/key file patterns (service account JSON keys, `*.pem`, `*.key`, and any other obviously sensitive files you see sitting in the working tree).
   - Run `git init`.
   Then run `git status` and confirm a remote is configured (`git remote -v`). If no remote exists, stop and ask the user for the remote URL to push to rather than guessing one or creating a new GitHub repo yourself — do not push anywhere unconfirmed.
2. Check what's about to be staged. This is a second, independent security gate — it covers staged *files* (including any pre-existing files in the working tree), not just the transcript content already covered by the security check in step 1. If anything looks like a live credential or an obviously sensitive file that isn't already `.gitignore`d, flag it to the user before staging it — don't silently commit it.
3. Stage all legitimate changes (the new chat-history file, a new/updated `as_built.txt`, a new/updated `CLAUDE.md`, plus any other outstanding changes in the working tree), commit with a concise message describing what changed in this session, and push to the current branch's remote (`origin`, typically `main` — check `git branch --show-current` rather than assuming).
4. Report back: the chat-history file path, whether `as_built.txt` was created/updated/left alone, whether `CLAUDE.md` was created/updated/left alone, the commit hash/message, and confirmation the push succeeded (or what went wrong, if it didn't).

Do not use `--force`, `--no-verify`, or skip hooks. If a pre-commit hook fails, fix the underlying issue and make a new commit rather than bypassing it.
