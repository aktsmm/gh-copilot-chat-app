# Copilot CLI Release Sync (v1.0.108)

## Summary
- Source repository: github/copilot-cli
- Latest release: 1.0.108 (v1.0.108)
- URL: https://github.com/github/copilot-cli/releases/tag/v1.0.108
- Published at: 2026-11-09T16:20:30Z
- Previously synced tag: v1.0.107
- Releases replayed: 1
- Replay truncated: no

## Fallback Model List
- Default model: gpt-4.1
- gpt-4.1
- gpt-5.4
- gpt-5.4-mini
- claude-opus-4.7
- claude-opus-4.8
- claude-sonnet-5
- gemini-3.6-flash
- claude-opus-5
- grok-4.5
- grok-4.6
- gemini-3.7-flash
- gpt-6
- claude-opus-5.5
- gpt-6.1-sol

## Model Changes Applied
### Added
- (none)
### Removed
- (none)
### Added upstream but not in the final list (needs review)
- (none)
### Mentioned only (not applied)
- grok-4.7
- grok-4.6

## Releases With Model Changes
- (none)

## Replayed Releases
- v1.0.108

## Latest Release Notes (Excerpt)
- 2026-11-09
- - Add `sandbox.userPolicy.filesystem.enumeratePaths` in `settings.json` for Windows enumerate-only directory grants
- - Add /index commands and enable managed shared tgrep indexing by default for eligible repositories
- - PDF attachments on Grok 4.7 and Grok 4.6 fall back to file references instead of failing the turn
- - With the sandbox on, a running local MCP server is now restarted after `/cd`, so it follows the new directory's denied paths instead of keeping those of the directory the session left.
- - A file attachment sent through the SDK that points at a named pipe, socket or device is now tagged as an error instead of stalling the turn until something writes to the pipe.
- - The canvas tools now tell the model which instance IDs `open_canvas` accepts, instead of calling them free-form.
- - /model now lists models when Copilot answers the model list request with 421 Misdirected Request, for example after a plan change, by re-resolving your account's endpoint as chat turns already do instead of showing "Error loading model list".
- - Requests to OpenAI-compatible chat-completions providers no longer include an internal message field on skill and tool messages.
- - Ctrl+C now stops a running /compact, as Esc Esc does, instead of only arming the exit hint and quitting the CLI on a second press.
- - The /config help no longer shows literal backticks or uses a model outside the model list as its example.
- - Your defaultMode setting now applies when you close the startup session picker while the session is still loading its model, instead of the session staying in its previous mode.
- - A disabledSkills entry, skills.disable and skills.enable now match a skill name in any letter case, as invoking the skill does, instead of silently doing nothing when the case differs.
- - Creating or resuming an SDK session, or replacing its tools, with two custom tools of the same name is now an error. Before, the model was offered the first definition while some SDKs ran the handler of the last one.
- - Copilot no longer crashes with an unhandled exception at startup when it cannot save its first-launch timestamp, for example because the disk holding the Copilot home directory is full. The failure is logged and startup continues.
- - The Getting started box no longer suggests /init in a folder where you ran /init suppress, in a repository that already has Copilot instructions, or outside a git repository.
- - `copilot help config` now names the `.claude/rules` instruction files and the `.claude/settings.json` repository settings the CLI reads.
- - copilot help input now says that esc esc also stops a running /compact, and that in shell mode a single esc or ctrl+c on an empty prompt leaves shell mode
- - `/help` now describes `ctrl+d` (exits only on an empty prompt, otherwise deletes the next character) and `ctrl+z` on Windows correctly, and lists `ctrl+j`, `ctrl+v`, `ctrl+y` and the voice input keys.
- - copilot help limits now quotes the rate-limit prompt as local sessions show it, "Switch to Copilot Fusion mode?", instead of "Switch to auto mode?".
- - copilot help mcp now says that a directory's .github/mcp.json is ignored when the same directory has a .mcp.json, instead of implying the two files are merged
- - copilot help monitoring now describes the github.copilot.sandbox.operation.count metric as counting every sandbox decision by kind, not only deduplicated posture changes.
- - Pasting an image path again after clearing its `[image: ...]` label with Ctrl+U, Ctrl+K, Ctrl+W or an Up-arrow history recall attaches the image again instead of inserting the plain path.
- - Backspace, an arrow key, Ctrl+U or Shift+Enter pressed right after a paste now acts after the pasted text instead of on the text in front of it.
- - Picking an MCP server type by its number in the add or edit form now moves focus to the next field for that type.
- - /permissions default in Autopilot now asks again how to handle permissions on the next prompt, as /permissions manual does, instead of leaving Autopilot to deny every tool request.
- - A queued `/ask` or `/btw` that runs while another side answer is open now shows that it is still thinking, instead of showing the previous answer as its own finished answer for Ctrl+Y to copy.
- - copilot --resume <name> and /resume <name> now find a session whose name has an accent typed precomposed or decomposed, whichever spelling the session was saved with.
- - In /search, Up, Down and Enter bring a single match back into view after you scroll away, and a shorter terminal no longer leaves the current match off screen.
- - /security-review help now says it reviews the branch diff when the working tree is clean, not only staged and unstaged changes

_Generated by scripts/cli-release-automation.mjs. The content is derived only from
release metadata, so repeated runs against the same base branch and the same upstream
release list produce byte-identical output._
