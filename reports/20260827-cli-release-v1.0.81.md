# Copilot CLI Release Sync (v1.0.81)

## Summary
- Source repository: github/copilot-cli
- Latest release: 1.0.81 (v1.0.81)
- URL: https://github.com/github/copilot-cli/releases/tag/v1.0.81
- Published at: 2026-08-27T17:10:08Z
- Previously synced tag: v1.0.80
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

## Model Changes Applied
### Added
- grok-4.6
- gemini-3.7-flash
### Removed
- (none)
### Added upstream but not in the final list (needs review)
- (none)
### Mentioned only (not applied)
- (none)

## Releases With Model Changes
| Tag | Published | Change |
| --- | --- | --- |
| [v1.0.81](https://github.com/github/copilot-cli/releases/tag/v1.0.81) | 2026-08-27 | +grok-4.6, +gemini-3.7-flash |

## Replayed Releases
- v1.0.81

## Latest Release Notes (Excerpt)
- 2026-08-27
- - The plugins dashboard is available to everyone: run `/plugin`, `/mcp`, or `/skills`. Set `PLUGINS_DASHBOARD=false` to opt out of it and the `copilot plugins` command.
- - Ship MCP 2026-07-28 support to CLI, SDK, IDE, and in-memory clients
- - Hooks can now receive the current OpenTelemetry trace context and emit correlated spans: inputs gain `traceparent` (plus `tracestate` when the span has vendor state); command hooks also get env vars.
- - Windows: remote MCP servers protected by Microsoft Entra ID can now sign in through the OS authentication broker (WAM), usually with no prompt at all. Other platforms, `--device-code`, and machines without the broker library keep the existing browser flow.
- - Add xhigh reasoning effort support for Grok 4.6
- - Startup now offers to restore sessions that were still open when their CLI went away, so a crash or a machine restart no longer means reopening each terminal by hand
- - models.list now includes service-published infoMessages and warningMessages per model
- - Add `copilot app` to open the GitHub Copilot app in the current directory
- - Add defaultMode and defaultPermissionMode settings to choose startup mode and approval behavior for new interactive sessions
- - Add --with-token to copilot login to read an auth token from stdin
- - Add support for Gemini 3.7 Flash
- - Add Ctrl+E in /sandbox to open settings.json in your editor
- - Add per-agent usage metrics to --usage-output-file JSON output
- - Repeated read_agent calls now consistently return the full turn history unless since_turn is provided
- - Hook lifecycle events (`hook.start`/`hook.end`) from hooks inside a subagent are now recorded on that subagent's session and re-emitted on its parent, instead of being dropped on an internal session.
- - Repeatedly resuming the same session no longer crashes while telemetry is being replaced
- - An MCP server blocked by an enterprise policy now shows as blocked in /mcp instead of spinning as pending forever
- - Fixed an indefinite "Loading…/Resuming…" hang at startup when a repository plugin activates a contributed extension (or another extension reload races the initial load), which previously left the environment stuck on "still waiting on extensions"
- - Vim mode badge stays visible beside the activity indicator during turns
- - The startup status finishes after extension configuration during plugin reconciliation
- - Signing out of an account now clears its cached enterprise managed settings, so signing back in generally re-fetches the policy rather than re-applying the one cached before sign-out
- - An enterprise managed-settings policy is no longer rejected when `permissions.disableBypassPermissionsMode` carries an unrecognized value; it is now logged and enforced as `disable`.
- - Sandboxed builds on Windows create their scratch caches on first run, so cargo, go, Gradle, and ccache work without a warm cache
- - On macOS and Linux, shell commands resolve the same tools a bash login shell does, including project environments activated from a profile
- - Canvas windows open and refresh in the background instead of stealing focus from your terminal
- - A prompt sent while the agent is working no longer leaves a second copy of itself stuck as `(pending)` at the bottom of the transcript after it has been answered
- - Turning allow-all off from an ACP client now reaches the permission engine whenever there is a runtime override or auto-approval to revoke, so the setting can no longer report success while permissions stay enabled (a baseline granted by --allow-all-\* launch flags is still deliberately left intact)
- - A failed tool call no longer stacks its `(MCP: server)` label one character per line down the timeline — the label and the error now share the row, with the longer side truncating
- - Agents, skills and MCP servers contributed by installed plugins are no longer dropped in non-interactive (-p) runs, so --agent <plugin>:<agent> works headlessly without --plugin-dir

_Generated by scripts/cli-release-automation.mjs. The content is derived only from
release metadata, so repeated runs against the same base branch and the same upstream
release list produce byte-identical output._
