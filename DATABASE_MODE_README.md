# db.23 — standalone database and information trees

Scene Archivist now uses authenticated SillyTavern user-file storage, not World Info, for new databases and restored archives. Existing database record IDs, metadata and .archivist.json exports remain compatible. Open the original chat, export a backup, then use **Migrate legacy archive** in Database health or the database selector. Migration copies and verifies records before publishing the standalone catalog; it leaves legacy World Info files intact. Do not rescan merely to migrate. New imports go directly into standalone storage. Ordinary lorebooks are unaffected; managed legacy records remain excluded from automatic injection. Optional reference-lorebook reading is disabled in this edition.

The server stores `scene-archivist-db-catalog-v1.json` and `scene-archivist-db-<uuid>.json` in the user's files directory. **Do not remove these via Data Maid's loose-file cleanup.** Keep story exports as backups. Use one writing tab at a time; the files API does not provide cross-tab transactional locking.

Retrieval → Information trees → Browse archive tree opens the derived, paginated archive index. Its branches cover chronology, character memories and knowledge, facts and entities, threads, Little Things, and where available recaps, clips, people, locations and dates. Branches cross-reference the same record ID, not duplicate records. The tree is built from existing metadata and excerpts without LLM calls; it is not an editable AI-generated index. Unresolved personal subjects are not promoted to named characters. Diary prose remains outside tool retrieval.

`scene_archivist_view_tree` browses branches (optional query, page, character and date scope); `scene_archivist_read_entries` reads exact IDs with explicit pagination. `scene_archivist_search_evidence` accepts an optional branch ID to restrict retrieval. Existing scope and audience restrictions apply. Tree labels, paths and summaries enrich the embedding inputs. Synchronize the archive vector index once after upgrading to refresh the changed text fingerprints. Future synchronizations remain incremental. No passive injection or extra generation calls are introduced.

---

Earlier database-mode documentation follows; where storage or lorebook instructions conflict, the db.23 behavior above takes precedence.

# Scene Archivist — Database Edition 2.2.0-db.20

Based on upstream Scene Archivist 2.1.11 at commit `af90a56dd46bfa995fd996f8c77548f1d40710f5`.

## What changed

This fork treats Scene Archivist as a **database/retrieval system**, not an ambient memory injector.

- No Scene Archivist archive record is allowed into normal World Info generation.
- No Little Things extension prompt is injected.
- Character memories and creative diaries remain accessible in the Characters workspace, but never inject into RP prompts. Trackers, rolling memories and reply-memory delivery are disabled/hidden. Existing legacy records remain readable and exportable.
- Batch scans split uncovered chat into bounded ~12k-token passes and then extract source-linked `knowledge`, `fact`, and `thread` records.
- `fact` and `thread` records are no longer created Always On.
- Summaryception/Timeline-hidden RP messages remain eligible evidence; true system/tool messages remain excluded.
- Main-model tools are enabled by default:
  - `scene_archivist_search_evidence`
  - `scene_archivist_open_source`
  - `scene_archivist_open_unit`

## Scan trigger

The existing message-received trigger is repurposed. It counts **unscanned story messages**, not raw chat length. Default threshold: 12 messages. Automatic scanning starts OFF: the extension notifies you at threshold. Enable the existing automatic-scan checkbox to run the batch scan automatically after an assistant reply.

## Source of truth

Relationship/current-world state should remain owned by dedicated systems such as RST/NWST. Character/episodic long-term memory should remain owned by Memory Loom or another selected memory system. Scene Archivist stores receipts and answers retrieval questions.


## 2.2.0-db.9 safety fix
Passive page load, chat open, chat switch, and UI refresh are now hard read-only operations. Scene Archivist no longer calls SillyTavern chat metadata saving during refresh, and branch/index write preparation only occurs when an explicit Scene Archivist write action begins.

## 2.2.0-db.12 startup repair

- Fixed the database overview renderer referencing the removed legacy attach button, which threw before the extension launcher registered.
- Added an independent launcher in Extensions settings and the wand menu; launchers appear before the application module initializes and report startup errors.
- Initial chat refresh errors no longer prevent the mounted workspace from being opened. Existing settings keys, archive data, and folder name are unchanged.

## 2.2.0-db.13 story character diaries

- Diary subjects are individual story characters, independent of SillyTavern cards. The roster is rebuilt from archived cast lines, structured people, knowledge subjects and saved memories/diaries.
- Detect characters in chat reads the last 80 messages by default or the specified inclusive range, using the configured Diary model in bounded passes. Detected names must have a literal mention in cited story messages; edits invalidate those receipts. No model requests occur simply by opening the extension.
- Add a name manually without a card. Detection/manual additions are stored in the current chat and archive scope. Existing diary entries remain unchanged; write, update, rewrite and condense keep their existing source checks.
- Shared ensemble card descriptions are optional background, not the identity or perspective of the diary author.


## 2.2.0-db.17 structured JSON recovery

- `Pause after this request` is now a hard request boundary for structured extraction: no JSON repair or source retry is sent until Resume.
- Empty/no-text structured replies receive one bounded source retry and then enter the same split/defer recovery path instead of bypassing recovery metadata.
- Automatic recovery scales with the current job size rather than stopping after a fixed 48 recovery events.
- Irreducible structured extraction fragments are deferred instead of failing the completed scene archive; they remain retryable from a durable gap queue across later jobs, reloads, exports, and restored backups.
- Structured extraction now performs deterministic JSON recovery before spending another source-reading request: fenced/prose wrappers, double-encoded objects, literal control characters inside strings, and trailing commas are repaired locally when safe.
- Non-truncated malformed replies get one cheap JSON-only correction request that may only reserialize already-produced records; it is not allowed to invent new story facts.
- Clearly truncated replies skip the wasteful same-size retry and split only the failing evidence batch immediately. Completed stages, draft books, approved scenes, and prior structured results remain untouched.
- Failed structured stages identify the exact structured batch in the job panel and expose **Retry failed batch**. Recovery history retains the recent malformed replies for diagnostics.

## 2.2.0-db.14 structured extraction batch repair

- Structured extraction uses output-aware batches of at most three source fragments and approximately 2,400 source tokens (less for smaller helper context budgets). Large individual entries are split without changing the underlying evidence or its source IDs/hashes.
- Resume upgrades an oversized pending extraction stage in place, preserving completed archive stages, draft books, and approved results.
- Invalid or truncated JSON is retried once and then only the failed extraction batch is split when possible. The final invalid response is retained on a failed stage, and overlarge record arrays are rejected instead of silently dropping records.
- Review & save ready results remains available on failed/paused jobs: approved scenes can be saved before any remaining extraction calls. No restart is necessary.

## 2.2.0-db.18 request pacing
Settings → Database settings: Model requests per minute, default 10, 0 disables proactive pacing. All Scene Archivist model calls share an evenly spaced, serial dispatch gate per browser tab. Normal RP and other extensions are not throttled. A surfaced provider rate-limit error pauses the job without JSON recovery, retaining completed stages; Resume waits for at least 60 seconds or a longer available Retry-After. Session-local cooldown survives refresh. No automatic retry of provider quota errors. Pause/cancel/chat switch during pacing blocks the next dispatch.

## 2.2.0-db.19 resumed extraction connection
- Resumed bulk jobs read the live extraction connection instead of their original draft's profile. Other evidence and story settings are retained.
- The paused extraction panel displays the actual configured model/provider and permits explicit connection changes without dispatching a request. No automatic provider fallback.
- Current chat-completion model is read through SillyTavern's provider-aware getter rather than the unrelated OpenAI default. Dispatch diagnostics record the provider, model, response allowance, and available sanitized nested errors.
- Structured JSON extraction uses raw completion text on the current connection to avoid normal roleplay cleanup. Known quota/billing errors pause without suggesting a timed recovery; ambiguous rate limits still respect cooldown. SillyTavern may mask upstream response details; provider-side errors are not fixed by this extension.

## 2.2.0-db.20 optional preset inspection
- Read connection-profile presets only when a name is assigned and exists in the host preset list. Missing/removed presets no longer emit repeated `Preset undefined not found` errors from Scene Archivist's model metadata inspection. Existing profile capacity fallbacks and actual request routing are unchanged.

### db.24 — Diary regeneration and eligibility

- Select the story character and the saved diary (if more than one exists). **Regenerate saved diary** uses the same personal-evidence record IDs and verified Little Things, not the old generated prose or the currently entered date/range. Current corrected evidence is used. The original diary ID and revision history are retained after approval. **Replace with selected period** is a distinct action; **Update diary** still appends unused evidence.
- The active SillyTavern persona is blacklisted by default. Blacklist a named individual from the diary controls and use the blacklist selector to allow them again. Explicitly allowing the current persona overrides the default for that identity in this chat/archive. Known aliases resolve to the same reviewed identity. Policy is chat/archive scoped and travels with the selected archive in a story backup; restoring an older backup without policy uses the default.
- Blacklisting does not hide or remove the character, memories, or existing diary text. New requests, queued diary generation/review and diary condensation respect the policy. Legacy diaries without personal-evidence links cannot safely regenerate the original period; select a period and use Replace instead. Oversized regeneration is refused instead of truncating evidence.

### db.25 — workspace layout

Presentation-only update. Seven database pages remain in the main navigation, with display preferences under a separate disclosure. Flat accordion rows, simple record metadata, compact actions and mobile navigation replace stacked rounded cards and pills. The diary reader and primary actions remain visible; period/style/revision controls, exclusions and roster tools have their own disclosures. Per-button help is opt-in inside the database workspace, including on touch devices; the Help & examples guide remains accessible. No database schema, vector index, diary policy, model requests or job migration changes.

### db.26 — Scene date controls
The Magic Wand menu contains a single Scene date action, showing the active story date when set. Open it to set, change, or explicitly clear the date and apply. The composer icon and permanent status strip are removed. The saved story-date anchors and retrieval semantics are unchanged.

### db.27 — temporal character memories and diary completions

Scene-date tool retrieval projects individual eligible memory bullets from the saved list without changing it. Date ranges require their final date to be at or before the cutoff; cited learning dates also constrain eligibility. Unknown or ambiguous dates remain unavailable during a flashback. Tree reads, keyword results and semantic matches use the same scoped list; direct source opening returns date-scoped saved memory during a cutoff rather than potentially mixed-date original messages. The embedding index now stores individual memory bullets. Synchronize once after upgrading; non-memory vectors are reused. Clearing the scene date restores unrestricted chronological views subject to ordinary character scope.

Diary evidence requests allow up to 3500 output tokens, capped by the selected connection preset. Diary flow requests preserve raw completion finish metadata; empty or truncated responses are not committed, and reasoning-only results are diagnosed without returning reasoning as diary prose. Retry retains the chosen profile, original evidence, and approval workflow. No automatic paid retry, no change to rate limiting or database persistence.

### db.28 — Optional archive reranker

Retrieval → Archive reranker. Off by default; explicitly enable it for `scene_archivist_search_evidence`. The embedding and generation connections are unchanged. First retrieve candidates using the selected keyword / hybrid / semantic mode, scoped to active records, character, branch, and scene date. Widen the first-stage shortlist (default 24, 2–40), fuse rankings, and make one bounded request to the reranker. Only shortlisted excerpts and the query are sent. Rank by returned scores, select up to the configured final result count (default 10, 1–20), then use the existing 7000-character evidence budget. Long records use bounded excerpts; the returned evidence remains the original saved record, not provider-generated text. No reranking for direct ID reads, tree browsing, scans, diaries or ordinary RP generation without a search tool call. No new embeddings or schema migration.

Supported formats: compatible `POST /rerank` or `/v1/rerank` accepting `model`, `query`, `documents`, `top_n`, `return_documents` and returning `results` with `index` and `relevance_score`/`score`; Hugging Face TEI `POST /rerank` accepting `query`, `texts`, `truncate`, returning indexed scores. Enter the full endpoint URL, and model ID (TEI uses the model loaded on its server). Direct browser requests require CORS and an endpoint reachable by the browser, especially on mobile. Optional ST server proxy route requires an already-enabled host proxy; use only on trusted private ST instances. The extension never changes ST proxy settings. The optional Bearer key is session-only and cleared on endpoint/format/route changes; connection settings are excluded from portable backups. Use Test reranker connection for a synthetic probe (no story text); no paid generation or automatic retries. Reranking service errors, invalid scores, or timeout fall back to first-stage results. No new evidence is accepted from the reranker. External services receive selected story excerpts, so choose a trusted endpoint. Candidate excerpts may be shortened for cross-encoder limits; ranking quality depends on the chosen model.

### db.29 — Ollama rank adapter
Choose **Ollama (Qwen3 rank scores · experimental)**, enter the Ollama base URL (e.g. `http://127.0.0.1:11434`) and the local rank-pooled model ID. Do not use a regular embedding model. Uses model metadata from `/api/show`, Qwen3 query/document pairs and two-class outputs from `/api/embed`; recovers the yes/no ratio after normalization. A synthetic ranking calibration is required on first use per session/configuration and through Test reranker connection. Unsupported runtimes, normal embeddings, malformed scores and indistinguishable calibration results fail closed to ordinary retrieval. No automatic external provider fallback. Existing compatible and TEI routes remain unchanged. If Ollama cannot expose the rank head, a dedicated rank-capable runtime is required for this GGUF. No reindexing needed.

### db.30 — archive search diagnostics
The search preview now checks actual server index coverage, reports pre/post-threshold candidate counts and displays separate keyword results. Empty or wholly outdated indexes do not trigger a query embedding. Index synchronization verifies stored hashes after completion. Scoped semantic searches use a bounded expanded shortlist (up to 2048 stored chunks) so unrelated global matches do not crowd out eligible records; existing scope and text validation remain in force. No change to vector identities, existing storage, reranker connection, or saved archive data.

### db.31 — Diary grounding and story setting
- Settings → Story setting context saves a short setting per chat/archive. Workbench requests use it as interpretive background, never new evidence.
- Knowledge → Character diaries → Diary author identity saves optional alias-aware identity and pronouns. Matching card description/personality are background only. Retried diary jobs read current context without changing source selection.
- Short diary prompt scales prose to evidence and explicitly disambiguates third-person references. Full chat prompt assembly is not used for personal diary requests.
- Selected Custom GLM-5.3/Flash connection profiles receive low reasoning effort via the host custom-body YAML path for diary generation only; active RP settings remain unchanged. No automatic retries, higher token budgets or profile switches.

### db.32 — Diary workflow and readable previews
- Bulk create diaries from the current period: select eligible authors, with missing diaries selected initially. One private-evidence request per author, existing saved diaries never overwritten. The same persistent job queue, review, blacklist, persona exclusion and rate limiter apply. Authors with no usable evidence or an oversized request are listed separately. Empty period fields retain the latest-period-per-character behavior.
- Edit the selected saved diary directly without AI, including blacklisted authors' existing diaries. Explicit save, stable ID, source receipts and revision history retained; locked or changed records are refused.
- Render Markdown in Library record previews, timeline summaries, Little Things, structured records, character memories and the diary reader. Formatting-only sanitized output uses SillyTavern's Showdown and DOMPurify libraries. No remote images, active links or executable markup. Stored text stays Markdown.

### db.33 — scheduled recaps
Manage → Create recap or shorten evidence → Scheduled recaps. Calendar automation now uses completed N-day fictional periods starting at the first reliably dated archive scene, not a rolling minimum age for individual scenes. Latest archived date is the clock; no wall-clock time or scene-number substitution. Each due period with at least two uncovered eligible scenes becomes a separate resumable job stage, or several labeled parts if its source text does not fit the selected helper context, and a cross-boundary scene stays whole in its ending period. Checks run after successful archive/catch-up completion (including Resume); Check / run due recaps is available for restored archives or a manual check. Suggest makes no model calls. Auto is opt-in, respects active jobs, flashback mode, protections and existing valid recap coverage, and avoids repeating unchanged automatic attempts. Existing source records remain. A context-budget preflight splits large periods into chronological parts; if even two or three scenes will not fit together, that group is skipped before dispatch with an actionable warning. No settings migration or vector rebuild.

### db.34 — cadence pause / Switchboard

A global **Enable automatic scan cadence / reminders** checkbox is available in the permanent Extensions launcher and Settings → Database settings. Uncheck it to suppress new cadence-triggered scans and reminders across chats while preserving `remindEvery` and `autoArchive`. Resume checks the backlog on the next assistant reply; it does not dispatch immediately. Manual scans, database browsing, retrieval, and recap configuration are unchanged. An existing job is not canceled; scheduled recaps following a completed scan still follow their own settings. Switchboard 0.2.3 uses the permanent launcher control, not a duplicate settings store. Both updates are required for Switchboard integration.

### db.35 — mobile message controls / remove redundant launcher panel

Settings → Database settings → **Show Scene Archivist message action button** is off by default (including upgrades from earlier builds). It is a global saved UI preference and does not modify archive backups or scanning. Turning it off removes existing controls and closes the action menu immediately; when enabled, the native button is mounted in an independent footer beneath the message text. Range endpoints and scan badges also live in that footer, never in ST’s native message header or toolbar. Existing status badge visibility choices remain. The separate Extensions settings drawer panel has been removed; the wand menu still opens the workbench and exposes Set scene date. Switchboard 0.2.3 remains compatible through the invisible, same-ID cadence checkbox bridge (no new Switchboard version needed). No archive migration or vector rebuild.

### db.36 — scan-generated diary identities
Existing structured extraction requests can optionally return source-linked diary author profiles alongside continuity records. No new model calls, no diary generation, no ambient prompt injection. Only accepted active records with matching source hashes supply the automatic guidance; optional malformed/unsupported profile metadata is ignored. The author must match an individual on the archive roster. Existing manual notes always take priority; edit and Save author identity to override a proposal, or clear and save to return to automatic guidance. Guidance is interpretive background only, not personal event evidence. Profiles are portable with the archive records and available to the individual and bulk diary requests. Sparse or omitted profiles may remain blank until a later scan returns supported guidance. No retroactive paid scan or archive migration.

### db.37 — diary author regression audit

The ZIP contains a single extension directory. Source-derived author guidance now has independent original-source and carrier hashes, and stale, edited or rebuilt evidence cannot silently revalidate old guidance. Older automatic profiles without independent receipts remain usable only on current, unrevised carriers with unchanged source hashes. Repeat extraction can add missing profiles to an identical, unprotected record with matching original evidence instead of discarding the profile or duplicating the fact. Step reviews display the proposed guidance; editing the carrier invalidates that proposal. Optional profile extraction is bounded, relevant-name-only, omitted when the helper budget cannot fit it, and omitted from the ordinary source-retry prompt. Shared aliases are not used as another character's personal diary evidence. Manual identities, diary records, cadence, and recap settings are unchanged. No additional scheduled requests or migration are needed.

### db.38 — remove chat status clutter

Remove all per-message coverage, memory, range endpoint and skip badges from chat. The optional message action button remains opt-in; if disabled, no Archivist footer is mounted. Old badge elements are cleaned up on mount and obsolete badge selectors are removed from settings. Legacy workflow profiles may retain their old badge preference, which is ignored for compatibility. Range controls, skip state, scan coverage, reminders, and diary/retrieval operations remain unchanged. No archive migration.

### db.39 — message control isolation

Optional message actions now use one dedicated, individually marked button appended after existing message content. No shared toolbar or third-party container is hidden, replaced, reordered, or cleared. Legacy cleanup removes identifiable Archivist action leaves and status badges only, and removes legacy wrappers only if empty. Foreign controls inside old wrappers are retained. Existing setting, wand access, cadence, archive data, and Switchboard integration are unchanged.

### db.40 — Review proposal rejection
Bulk review now distinguishes saving, deferring (unchecked), and permanently discarding a proposal. Expand an unwanted result and choose **Discard this proposal**, or uncheck unwanted results and choose **Mark unchecked for discard**, then **Save selected / discard marked**. Discarding a proposed edit restores the original saved entry; discarding a new proposal does not delete existing evidence. Dependent proposals whose sources were rejected remain held for explicit review. All-discard completion no longer requires an approved entry, and completed ready-review jobs are marked done. The same choices apply to Little Things. No new model calls are introduced.


### db.41 — release audit corrections
- Complete story backups use strict JSON parsing, preserving literal story text and avoiding model-output recovery on large files. Invalid backups are rejected rather than repaired. Valid model JSON takes a direct parse path before wrapper removal.
- Date-scoped retrieval checks all explicit dates and both ends of ranges; incomplete or mixed unknown dates are withheld. During an active cutoff, open_source returns date-scoped saved evidence only, because a transcript receipt can span later scenes.
- Ensemble retrieval requires uniquely resolved owners for personal knowledge and Little Things. Source opening uses the same eligible record set as search/tree navigation.
- No migration or reindexing required. This is a release candidate; full host/browser/provider tests remain necessary.
- Bulk job completion preserves live diary blacklist and roster edits made during a pause.
