# Scene Archivist — Database Edition

**A source-backed story database for SillyTavern.**

Archive your roleplay as it unfolds, build a searchable record of its history, and let your model look up old events when they actually matter — without stuffing the entire archive into every reply.

> **Public beta · 2.2.1-beta.1**  
> This is a substantially reworked fork of [Scene Archivist by AmiBastian](https://github.com/AmiBastian/SillyTavern-SceneArchivist). The Database Edition changes the storage, retrieval, and overall purpose of the original extension. It is intended for long-running roleplays and continuity-heavy stories. Back up your chats and databases before installing or updating.

## What makes this edition different?

Scene Archivist is a **historical reference database**, not an ambient memory injector. It stores evidence outside World Info and gives supported models tools to consult it on demand. A saved record does not automatically occupy your RP context simply because it exists.

The intention is to preserve the little and large details that disappear when a story grows beyond its context window: promises, possessions, discoveries, past conversations, unresolved conflicts, who learned what, and the circumstances behind a character's decisions.

It works alongside world-state trackers, relationship trackers, episodic memory extensions, and context compressors. Those systems can maintain the current situation or relevant experiences; Archivist preserves the historical receipts. None of those companion extensions are required.

```mermaid
flowchart LR
    A[Roleplay transcript] --> B[Scan new messages]
    B --> C[Scene evidence]
    C --> D[Character memories and structured extraction]
    D --> E[Review and save]
    E --> F[(Story database)]
    F --> G[Information trees and search]
    G --> H[Model requests relevant evidence]
    F --> I[Diaries and historical recaps]
```

## Features

| Feature | What it does |
| --- | --- |
| Scene archive | Chronological summaries with source message receipts, supported dates, cast, locations, decisions and outcomes. |
| Structured evidence | Extracts facts, knowledge states, promises, and unresolved threads as separately searchable records. |
| Character library | Keeps individual, dated memories and knowledge, including how a character learned something and what remains uncertain. |
| Little Things | Preserves smaller continuity-relevant details as separate evidence notes. |
| Information trees | Automatically builds a browsable index by chronology, characters, facts, threads, dates, locations and other available metadata. |
| On-demand retrieval | Lets tool-capable RP models search evidence, browse the tree, read records and verify original messages. |
| Semantic search | Optional independent embedding index, with keyword, hybrid and semantic search modes. |
| Reranking | Optional independent second-stage relevance ranking for retrieval results. |
| Character diaries | Individual and bulk first-person diary generation, saved author identities and voices, editing and regeneration. |
| Historical recaps | Manual or scheduled recaps covering completed stretches of fictional history. |
| Scene-date restrictions | Limits tool retrieval to eligible evidence at an explicitly selected fictional date, useful for flashbacks. |
| Review and recovery | Persistent multi-stage jobs, request pacing, resumable failures, editable proposals, revisions and backup/restore. |

## Installation

### Requirements

- A working SillyTavern installation with its user-file storage and Connection Manager APIs. ST 1.19.0 is the target test environment; other versions have not been certified.
- A generation model for scanning and other AI-assisted operations. Models that reliably follow structured JSON instructions are preferable for extraction.
- A tool-capable main model and compatible SillyTavern connection if you want the RP model to query the database itself. You can still use the workbench manually without function calling.
- An embedding service and a reranker **only if you choose to enable those features**. Keyword retrieval does not require either.

### Install from a release ZIP

1. Back up your SillyTavern chats and any existing Scene Archivist databases.
2. Extract the ZIP into the `public/scripts/extensions/third-party/` directory of your SillyTavern installation. For an installation using a different extension directory, use the location where its third-party extensions are installed.
3. Confirm that the extension files are inside one `SceneArchivist-Database` folder, with `manifest.json`, `bootstrap.js` and the other modules directly inside it. Avoid nested copies or simultaneous installations of the original and Database Edition: they share settings identifiers.
4. Reload SillyTavern and ensure the extension is enabled. Open **Scene Archivist** from the Magic Wand menu beside the chat composer.

There is intentionally no separate Scene Archivist settings panel in the Extensions drawer. The workbench contains its controls.

When upgrading an existing Database Edition installation, replace the existing extension's files rather than installing a second copy. Keep your backups and saved user data; the extension folder is not where your database lives.

## Quick start

1. Open the RP chat you want to archive, then open Scene Archivist from the Magic Wand.
2. Under **Scan → Database**, create a named database or select the existing database for that story. Keep different universes and AUs in separate databases.
3. Under **Settings → More**, choose the generation connections. You can select existing SillyTavern Connection Manager profiles or use the current model where offered. Keep **Review before writing** enabled while learning the workflow.
4. Optionally fill **Settings → Story setting context** with a short description of the era, AU, world rules and recurring cast. This is interpretive background, not a source of new events.
5. For a first test, use **Scan → Scan selected message range**, enter inclusive message numbers, preview and estimate the range, then run the scan. Review the proposed results and save the ones you want.
6. For normal use, choose **Overview → Scan all new messages**. It finds uncovered story messages and splits larger backlogs into bounded requests automatically.
7. Open **Evidence** or **Knowledge** to inspect the saved records. Under **Retrieval**, keep main-model tools enabled if your RP connection supports them.

You can start with keyword retrieval and manual scanning; vector synchronization, reranking, automatic scans and scheduled recaps are not prerequisites.

## Workbench map

| Page | Main purpose |
| --- | --- |
| **Overview** | Scan all new messages, estimate a scan, view recent records and threads, database health and backup controls. |
| **Scan** | Select/create a database, scan an exact inclusive range, and inspect scan history. |
| **Knowledge** | Character memories, structured facts and knowledge, open threads, diaries and author profiles. |
| **Evidence** | Search and inspect saved records, select evidence, ask questions and check continuity claims. |
| **Manage** | Recaps, evidence shortening, normalization, repairs, backups and data management. |
| **Retrieval** | Information trees, main-model tool access, vector search and reranker configuration. |
| **Settings** | Model connections, request pacing, scan cadence, story setting and UI preferences. |

Expand **More** or enable advanced controls under the display preferences if a setting is not visible. The in-workbench help explains individual controls.

## Scanning, automation and review

A normal new-message scan archives chronological scene evidence and runs the character-memory and structured-extraction stages. It records message coverage and source receipts so normal catch-up does not blindly process the entire chat again. Story messages hidden by compatible context-management extensions remain eligible; system/tool messages are not ordinary story evidence. A manually selected range is useful for a specific arc, correction or test.

Scans are AI-assisted: they can misread chronology, invent connections, or miss details. Source links make results checkable, not inherently infallible. Review uncertain claims and character knowledge carefully.

### Automatic scanning

Go to **Settings → More**:

- **Scan after this many new story messages:** default 12; `0` disables the trigger. This is a count of uncovered story messages, not fictional days or an API batch size.
- **Automatically scan when the threshold is reached:** off by default. When unchecked, Archivist offers a reminder at the threshold instead of starting a scan. When checked, it can begin a scan after an assistant reply.
- **Review before writing:** enabled by default.

For longer, dense RP replies, a cadence such as 25–50 messages is a reasonable starting point; choose based on the amount of story information generated, your helper model and the cost of scanning. Run a manual catch-up scan before compressing or removing old context, especially at arc boundaries.

To completely pause new cadence scans **and reminders**, uncheck **Settings → Database settings → Enable automatic scan cadence / reminders**. This preserves the interval and mode. Resuming checks the backlog after the next assistant reply. An existing job is not canceled. Manual scans, retrieval and separately configured recaps remain available.

Optional Switchboard v0.2.3 integration controls this same global cadence switch; Switchboard is not required.

### Models and request pacing

**Settings → More** provides separate connections for:

| Connection | Purpose |
| --- | --- |
| Evidence scan model | Reading the transcript and producing scene evidence. |
| Database extraction model | Structured extraction, keywords, recaps and evidence helpers. |
| Diary model | Diary generation, updating, regeneration and condensation; character detection. |

Choose suitable context and output allowances in the relevant connection profiles. Large jobs are split and structured-output recovery is bounded, but several requests can be necessary. Optional audits, retries and follow-up operations may add calls. Profile connection failures do not silently switch you to an unrelated provider.

**Settings → Database settings → Model requests per minute** defaults to 10. Set `0` to disable proactive pacing. This limits Archivist's generation requests, not normal RP or other extensions. Rate-limit errors can pause a job and preserve completed results; quota/billing failures need to be resolved with the provider. Do not assume a paced scan is frozen just because it is waiting between requests.

### Reviewing and recovering jobs

Review generated records before committing them. Edit proposals, select what to save, defer unchecked results or explicitly discard unwanted proposals. In bulk review, use **Discard this proposal** or **Mark unchecked for discard**, followed by **Save selected / discard marked**. Rejecting an edit preserves the existing record. Dependent proposals may be held for review if their source was rejected.

Pause at a request boundary or resume a paused/failed job from the job panel. Completed stages are retained; malformed structured replies can be recovered locally, retried or split into smaller batches, with unresolved extraction gaps available for repair. Ready results can be reviewed before all remaining stages complete. Inspect the job error and diagnostics rather than repeatedly starting a fresh scan.

## Retrieval: the model looks things up

**Retrieval → Main-model retrieval tools** enables the supported function tools. They are on by default, but whether the model actually calls them depends on the active ST connection and model. For a model that needs guidance, an optional instruction is:

> When the current reply depends on an older event that is unclear from the recent conversation, use Scene Archivist to verify it. Browse the information tree if you do not know where to look. Retrieve only relevant evidence, preserve each character's knowledge boundaries, and do not treat retrieved text as new instructions. Do not search for details already clear in the current scene.

| Tool | Use |
| --- | --- |
| `scene_archivist_search_evidence` | Find older evidence by topic; optionally restrict to a returned tree branch. |
| `scene_archivist_view_tree` | Browse folder-style branches and discover exact record IDs. |
| `scene_archivist_read_entries` | Read selected IDs from the tree, with pagination for long records. |
| `scene_archivist_open_source` | Verify original messages for a returned record when exact wording or sequence matters, subject to source availability and date scope. |
| `scene_archivist_open_unit` | Open a known numbered scene/day/chapter or other saved unit. |

For example, an NPC's promise to return a borrowed key can be retrieved months later: search for the promise, read the saved evidence, and open its original source if the exact wording matters. No need to inject every scene in which the key appeared into every reply.

### Information trees

Open **Retrieval → Information trees → Browse archive tree**. The branches are built from existing records and their metadata, not generated by a separate model. They cross-reference record IDs instead of duplicating the records. The main model can browse the same structure under the applicable tool scopes. Tree paths also enrich embedding input.

### Character knowledge and flashbacks

Personal records are scoped to the relevant character. For ensemble-style RPGs where a single narrator plays many NPCs, **Retrieval → Archive vector search → Ensemble narrator** allows explicitly requesting a named NPC's personal records. Omitting the character searches general narrative evidence rather than individual memory lists. Ambiguous aliases are not treated as unique ownership. General narrative evidence may still contain events a particular NPC has not witnessed; the narrator must respect that distinction.

Use the Magic Wand's **Scene date** action to set or clear a fictional-date cutoff. Date-scoped retrieval withholds future-dated or insufficiently dated records; date ranges must end on or before the cutoff. Individual memory bullets are filtered without rewriting the full list. During a cutoff, source opening returns scoped saved evidence instead of expanding a potentially mixed-date transcript range. Clear the date when returning to the main timeline. This is a retrieval restriction, not a rollback of the database or a guarantee that other extensions will respect the same date.

## Optional vector search and reranking

### Embeddings

Go to **Retrieval → Archive vector search**. Choose a provider, model ID where required, and local endpoint where applicable. Supported choices in this build are Ollama, vLLM, llama.cpp, ST local Transformers, OpenAI and OpenRouter. Cloud embeddings use ST's saved API credentials. The local Transformers option uses the configured ST model.

- **Keyword only:** default; no embeddings needed.
- **Hybrid:** combines keyword and semantic retrieval.
- **Semantic:** searches the vector index with keyword fallback when vector retrieval fails or returns no usable matches.

Click **Synchronize archive index** after initial setup and after scanning or editing records. Synchronization is explicit and incremental: unchanged chunks are reused, obsolete chunks removed. Changing the embedding model/provider/endpoint selects a different index. The old index is not automatically deleted.

Use **Test archive search** to check index coverage and compare semantic and keyword results, then adjust minimum similarity and result count if needed. Empty/stale index diagnostics are distinct from a query that simply has no qualifying semantic hits. The preview is not a test of the optional reranker.

### Reranking

Open **Retrieval → Archive reranker**. It is off by default and independent of the generation and embedding connections. It reranks shortlisted eligible excerpts for the Search evidence tool, not every RP reply, scan, diary or direct record read. Failed requests fall back to the original retrieval ranking.

Choose a compatible rerank API (e.g. a rank-capable llama.cpp or vLLM server), Hugging Face TEI `/rerank`, or the experimental Ollama Qwen3 rank-score adapter. Enter the full rerank endpoint (Ollama uses its base URL), model ID where required and an optional session-only bearer key. Use **Test reranker connection** before enabling it. Ordinary chat or embedding models are not rerankers; some Ollama builds cannot expose the required rank head. A failed synthetic test means that adapter is not usable with that runtime/model combination.

For browser-direct access, the endpoint must permit CORS and be reachable from the device running the browser. On mobile, `127.0.0.1` refers to the phone, not the ST server. The ST server-proxy route can use a service reachable by ST, but requires the host's optional proxy to already be enabled. Do not expose proxy-enabled ST publicly. Archivist does not change proxy settings or start local model servers for you.

## Character knowledge and diaries

The **Knowledge** page builds a story-specific character roster, independent of the active SillyTavern character card. Review aliases and hide mistaken candidates when necessary. Build missing character memory lists from saved knowledge locally, or scan missing character memories from archived scenes with a model. Existing lists are not replaced simply by building missing lists.

### Diary workflow

Under **Knowledge → Character diaries**:

1. Select an individual author and, when editing or regenerating, the saved diary.
2. Optionally specify a fictional date or inclusive source-message range in **Period, writing style & revision tools**. With blank period fields, the default is the latest dated period with personal evidence for that author.
3. **Write diary** creates a new diary using personal evidence; **Bulk create diaries** lets you choose eligible individuals (missing diaries selected initially). Bulk generation uses one initial diary request per selected author, not a single combined narrator diary.
4. **Update diary** adds unused evidence. **Regenerate saved diary** uses the original evidence references and current corrections rather than the currently entered period. **Replace with selected period** deliberately changes its source selection. Legacy diaries without usable evidence links may require replacement instead.
5. **Edit saved diary** allows direct Markdown editing without AI. Revision history and source links are retained. Condensation is separately available.

The active persona is excluded from diary generation by default. Use **Diary blacklist** to exclude other authors or explicitly allow the persona. Exclusion does not delete a character's memories or existing diary. Locked records must be unlocked before editing.

### Author identity and voice

**Diary author identity** stores per-author interpretive guidance: pronouns, role, established personality, vocabulary, emotional register and writing style. Scans can propose missing identities and voice guidance within the existing structured-extraction response, without a separate model call. Generated guidance must be supported by accepted current evidence. It may be absent for sparse or poorly documented characters.

Manual author identities support up to 4,000 characters, including persistent voice guidance. Automatic profile extraction remains unchanged. Saved manual identities take priority; edit and save to override an automatic profile, or clear and save to return to available scan-generated guidance. The separate optional voice/style field is guidance for a generation request, not a persistent per-author profile. Use the identity field for permanent voice instructions. Matching character cards and story setting provide background, not personal event knowledge.

Diaries are creative, first-person interpretations of selected evidence. They are **not authoritative facts**, are not automatically generated during scans, and are excluded from main-model archive retrieval and ambient RP injection. A model can still write an inaccurate or out-of-character diary; review it.

## Recaps and long stories

Select source records in **Evidence**, then go to **Manage → Create recap or shorten evidence**. Create a recap to combine selected history into a broader narrative account linked to its originals, or shorten individual evidence records. Shortening can change the active record; review proposals and keep backups. Creating a recap does not delete its source scenes.

Under **Scheduled recaps**, choose Manual only (default), Suggest and review, or Automatically create recaps. Trigger options are newer units, fictional calendar days and archive token pressure.

For a 45-day fictional recap, select **Every N fictional calendar days**, set **Fictional days per recap** to `45`, and select the desired automation mode. Periods begin at the earliest reliably dated archive scene. The latest archived fictional date determines which periods are complete; real-world time does not advance the schedule. Checks run after a successful archive scan, or manually with **Check / run due recaps**. Suggest mode does not make a model request merely to check the schedule.

Calendar scheduling excludes protected and undated records, pauses in flashbacks and avoids repeating covered scenes. Larger periods may be split into labeled parts to fit the helper context. If a group cannot fit safely, it may be skipped with a warning rather than dispatched. Keep actual story dates in your transcript for reliable scheduling.

## Storage, backups and migration

New databases and restored archives use authenticated ST server user-file storage, **not World Info**. The server keeps the catalog `scene-archivist-db-catalog-v1.json` and database files named `scene-archivist-db-<uuid>.json` in the user's files directory. Do not delete these through Data Maid or loose-file cleanup. Ordinary lorebooks are unaffected; legacy reference-lorebook reading and automatic archive injection are disabled in this edition.

- Use **Overview → Backup and data → Export database backup** (also available in Manage) to save a complete `.archivist.json` backup. The backup includes the saved archive, character records, recaps, revisions, source references, job state and relevant workflow metadata.
- Use **Import / restore backup** to preview and restore a backup into standalone storage. Complete story backups are validated as strict JSON; malformed backups are rejected rather than guessed at. Connection profiles and API credentials are not bundled as portable provider settings; configure them on the destination installation.
- Keep original chat JSONL files separately. A database is not a substitute for the original transcript. Source receipts can only reopen original text when the corresponding chat/messages are available and match their recorded hashes.
- For legacy Archivist lorebook archives, open the original chat, export a backup and use **Migrate legacy archive** in Database health or the database selector. It copies and verifies the database while retaining the original lorebook files. Do not rescan simply to migrate.
- Use one writing browser tab at a time. The ST files API is not a cross-tab transactional database. Avoid concurrent writes to the same database from multiple clients.

## Privacy, performance and limitations

Archivist stores databases on the ST server; this does not automatically make processing offline. Scans, diary generation, recap generation and AI-assisted questions send selected story material to your configured generation provider. Semantic indexing/search sends text to the embedding provider; reranking sends queries and eligible shortlisted excerpts to the selected reranker. You control these connections. An entirely local setup requires suitable local services for each feature you enable.

Opening the workbench, browsing saved records, building information trees, and editing saved diary text do not inherently require model calls. Explicit scanning, AI helpers, embeddings and reranking do. Token estimates are approximate and provider context limits vary. Archivist does not automatically compress or delete chat history, replace your other memory systems, or ensure the main model will retrieve every relevant fact.

The chat interface is intentionally quiet: no per-message scan-status badges. The optional message action button is off by default; enable it under **Settings → Database settings** if you want range/skip actions below message text. It is not part of ST's native message toolbar. You can use manual range selection without it.

## Troubleshooting and beta feedback

| Problem | First thing to check |
| --- | --- |
| Extension not appearing | Verify one correct installation folder, enabled extension and Magic Wand menu; check browser console for startup errors. |
| Nothing is being archived automatically | Select the correct database; check cadence enable, interval, automatic-vs-reminder mode and active jobs. |
| Scan stops or returns malformed JSON | Inspect the job panel, actual selected model, context/output limits and provider error. Resume or retry the failing batch; do not discard completed work unnecessarily. |
| Model never searches the database | Verify main-model retrieval tools and function-calling support on the active ST connection. Try an explicit request to look up an older event. |
| No vector results | Test archive search, inspect index coverage, confirm provider/model/endpoint, synchronize changed records and check similarity threshold. |
| Reranker errors | Test its endpoint, API format, model rank capability and browser/server connection route. Retrieval can still operate without reranking. |
| Diary is missing or generation is refused | Check selected author, period, personal evidence, blacklist/persona policy and Diary model capacity. |
| Old source cannot be opened | Verify the original chat still exists and the message hashes match; check the active fictional date. |
| Database appears missing | Check Database health and restore a verified backup if files are missing. Do not clear the database as a first troubleshooting step. |

Use **Overview → Database health → Export diagnostics**, **View debug log**, or the optional browser-console debug switch to investigate issues. Review diagnostic exports for private story text before sharing them.

For a useful bug report, include the Archivist and ST versions, desktop/mobile browser, whether this is a fresh install or upgrade, the operation and reproduction steps, model/provider and relevant error messages. Redact API keys and private story content. Please report reproducible bugs rather than assuming a model's prose quality is a database defect.

### Release status

The db.41 corrective release candidate passed 20 targeted module/regression checks and JavaScript syntax checks, including validation against large existing story backups, source/date scoping, diary evidence, job recovery, storage and vector operations using simulated host services where necessary. Full ST runtime integration, live provider generation and mobile behavior across public installations remain unverified. Treat this as a beta, not a guarantee of data integrity under every configuration.

## Credits and project history

Based on [AmiBastian/SillyTavern-SceneArchivist](https://github.com/AmiBastian/SillyTavern-SceneArchivist), upstream version **2.1.11**, commit [`af90a56dd46bfa995fd996f8c77548f1d40710f5`](https://github.com/AmiBastian/SillyTavern-SceneArchivist/commit/af90a56dd46bfa995fd996f8c77548f1d40710f5). The manifest credits Mira for the database-mode refactor.

`DATABASE_MODE_SOURCE.txt` records the original source revision. `DATABASE_MODE_README.md` is retained as historical development and migration notes; some earlier entries describe superseded UI or behavior. This README describes the current 2.2.1-beta.1 edition.
