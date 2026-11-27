import * as M from './memory-engine.js';
import { escape as html } from './workflow-tools.js';
import { mountTools } from './workbench-tools.js';
import { mountRecovery } from './workbench-recovery.js';
import { WorkspaceLayout } from './workbench-layout.js';
import { StoryLibrary } from './story-library.js';
import { WorkbenchExtras } from './workbench-extras.js';
import { entryReasons, vectorStatus } from './vector-diagnostics.js';

export const button = (action, label, extra = '') => `<button type="button" class="menu_button" data-sa-action="${action}" ${extra}>${label}</button>`;
export const field = (key, label, value = '', type = 'text', extra = '') => `<label class="sa-field"><span>${label}</span><input class="text_pole" data-sa-field="${key}" type="${type}" value="${html(value)}" ${extra}></label>`;
const card = (title, body, open = true) => `<details class="sa-card" ${open ? 'open' : ''}><summary>${title}</summary><div class="sa-body">${body}</div></details>`;

export function renderMemoryBudget(w) {
    const container = w.root?.querySelector('#sa-budget-view');
    if (!container) return;
    const decision = w.lastBudget;
    const status = vectorStatus(w.vectorRun, {
        enabled: !!w.h.vectorSettings?.()?.enabled_world_info,
        available: typeof globalThis.vectors_rearrangeChat === 'function',
        selected: decision ? decision.accepted.filter(item => w.semanticHits.has(item.id)).length : null,
    });
    const heading = `<p class="sa-vector-status" role="status"><b>Vector search</b> · ${html(status)}</p>`;
    if (!decision) {
        container.innerHTML = heading + '<p>Send a normal chat reply to see which memories were selected.</p>';
        return;
    }
    const { accepted, omitted, used, budget } = decision;
    const filter = w.value('activationFilter');
    const visible = accepted.filter(item => !filter || (item.reasons || [item.reason]).includes(filter));
    const selected = new Set(accepted.map(item => item.id));
    const extra = [...w.activatedIds].filter(id => !selected.has(id)).length;
    const confirmed = accepted.filter(item => w.activatedIds.has(item.id)).length;
    const confirmation = w.activationKnown
        ? `<p>World Info activation confirmed for ${confirmed}/${accepted.length} selected memories.${extra ? ` SillyTavern also activated ${extra} other story entries.` : ''}</p>`
        : '<p>Waiting for World Info to confirm these selections.</p>';
    const mode = decision.enforced === false
        ? '<p class="sa-warnline">This SillyTavern version exposes activation reporting only. Native World Info limits apply.</p>'
        : '<p>The shared budget covers native World Info matches, scene recall and Little Things.</p>';
    const little = w.sceneRecall.selection();
    const rows = visible.map(item => `<div class="sa-retrieval-entry">
        <div class="sa-viewrow"><b>${html(M.title(item.entry))}</b> · ${item.cost} tokens<br>${html(entryReasons(item))}
        ${w.activationKnown ? `<br><span>${w.activatedIds.has(item.id) ? 'World Info activation confirmed' : 'Not activated by World Info'}</span>` : ''}</div>
        <div class="sa-row">${button('inspect', 'Inspect', `data-id="${html(item.id)}"`)}</div>
    </div>`).join('');
    const skipped = omitted.map(item => `<div class="sa-retrieval-entry">${html(item.title)} · ${item.tokens} tokens · ${html(item.reason)}
        ${item.reasons?.length ? `<br>Activation source · ${html(entryReasons(item))}` : ''}</div>`).join('');
    container.innerHTML = heading
        + `<p><b>${used}/${budget}</b> memory tokens retained.${little.items.length ? ` Little Things used ${little.tokens} tokens.` : ''}</p>`
        + mode + confirmation
        + `<p class="sa-hint">Showing ${visible.length} of ${accepted.length} retained entries.</p>${rows}
        <details><summary>${omitted.length} omitted records and reasons</summary>${skipped}</details>`;
    w.layout?.help.refresh(container);
}

export function mountWorkbench(w, root) {
    w.root = root;
    const oldCards = [...root.querySelectorAll(':scope > details.sa-card')];
    const hero = root.querySelector(':scope > .sa-hero');
    const nav = document.createElement('div'); nav.className = 'sa-tabs'; nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', 'Scene Archivist sections');
    const tabs = ['story', 'archive', 'characters', 'library', 'maintain', 'prompt', 'settings'];
    w.panes = {};
    tabs.forEach((id, index) => {
        const b = document.createElement('button'); b.type = 'button'; b.id = `sa-tab-${id}`; b.textContent = id; b.dataset.saTab = id;
        b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', `sa-pane-${id}`); b.tabIndex = index === 0 ? 0 : -1; nav.append(b);
        const panel = document.createElement('section'); panel.id = `sa-pane-${id}`; panel.className = 'sa-pane'; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', b.id);
        w.panes[id] = panel; root.append(panel);
    });
    root.querySelector('.sa-title').after(nav);
    const dashboard = document.createElement('div'); dashboard.id = 'sa-dashboard'; dashboard.className = 'sa-dashboard'; nav.after(dashboard);
    const jobs = document.createElement('div'); jobs.id = 'sa-jobs'; jobs.setAttribute('aria-live', 'polite'); dashboard.after(jobs);
    const heroCard = document.createElement('details'); heroCard.className = 'sa-card'; heroCard.open = true; heroCard.innerHTML = '<summary>🗂️ Your archive</summary><div class="sa-body"></div>'; heroCard.querySelector('.sa-body').append(hero); w.panes.archive.append(heroCard);
    for (const c of oldCards) {
        const text = c.querySelector('summary').textContent;
        const tab = /Ledger/.test(text) ? 'archive' : /Memory settings|Memories|Trackers/.test(text) ? 'characters' : /Recall|model saw/.test(text) ? 'prompt' : /Ask|Previously on/.test(text) ? 'library' : 'settings';
        c.open = false; w.panes[tab].append(c);
    }
    root.querySelector('#sa_range_from')?.closest('.sa-row')?.remove();
    root.querySelector('#sa_run').value = '✨ Summarize new, a quickie';
    root.querySelector('#sa_thorough').value = '💋 Archive thoroughly';
    w.panes.archive.insertAdjacentHTML('beforeend', card('🎯 Pick your messages', `<p class="sa-hint">Both numbers are inclusive. 311 to 372 summarizes exactly that range and leaves 373 and 374 alone. Visibility has its own controls.</p><div class="sa-grid">${field('rangeFrom', 'First message', '', 'number', 'min="0"')}${field('rangeTo', 'Last message, inclusive', '', 'number', 'min="0"')}</div><p id="sa-range-preview" class="sa-hint"></p><label class="checkbox_label"><input type="checkbox" data-sa-field="rangeHide"><span>Hide this range after a successful summary</span></label><label class="checkbox_label"><input type="checkbox" data-sa-field="rangeMemories"><span>Also create memories</span></label><div class="sa-row">${button('rangePreview', 'Preview range')}${button('rangeArchive', 'Summarize this range') + button('rangeCatchUp', 'Catch up this range')}${button('rangeHide', 'Hide this range')}${button('rangeShow', 'Show this range')}</div><p class="sa-hint">“Summarize new” uses uncovered messages. “Mark archived” only marks coverage and does not write a summary.</p>`));
    w.panes.archive.insertAdjacentHTML('beforeend', card('🧹 Tidy the shelves', `<p class="sa-hint">Sort the archive and group memories by date. Every memory sentence keeps its wording. No AI request is made.</p><label class="checkbox_label"><input type="checkbox" data-sa-field="tidyDuplicates"><span>Also remove exact duplicate memories within the same date group</span></label><div class="sa-row">${button('tidy', 'Tidy up, hands off the prose')}</div>`, false));
    { const ledger = [...w.panes.archive.children].find(x => /Ledger/.test(x.querySelector?.('summary')?.textContent || '')); if (ledger) w.panes.archive.append(ledger); }
    w.panes.library.insertAdjacentHTML('beforeend', card('🔬 Memory inspector', `<div class="sa-row"><input id="sa-library-query" class="text_pole" placeholder="Search dates, names, locations or text" aria-label="Search memory library"><select id="sa-library-type" class="text_pole" aria-label="Record type"><option value="">All types</option>${M.TYPES.map(t => `<option>${t}</option>`).join('')}</select><label class="checkbox_label"><input id="sa-library-history" type="checkbox"><span>History</span></label></div><div class="sa-row">${button('selectVisible', 'Select results')}${button('clearSelection', 'Clear selection')}${button('refresh', 'Refresh')}${button('clip', 'Quick capture')}</div><p class="sa-hint">Select records here to condense them, extract structured facts, or inspect their sources. Originals and every revision remain available.</p><div id="sa-library-results"></div>`));
    w.panes.maintain.insertAdjacentHTML('afterbegin', card('✂️ Condense story records', `
        <label class="checkbox_label"><input type="checkbox" data-sa-option="auditCondense"><span>Audit shorter proposals for missing facts, one extra request</span></label>
        <p class="sa-hint">Select archive entries in Library. Shorten preserves each heading. Create recap combines the selection into one titled entry linked to the originals.</p><div class="sa-grid"><label class="sa-field"><span>Mode</span><select class="text_pole" data-sa-option="recapMode"><option value="recap">Create recap</option><option value="shorten">Shorten individual entries</option></select></label>${field('recapLabel', 'Recap title (optional)', w.options().recapLabel === 'Arc' ? '' : w.options().recapLabel, 'text', 'maxlength="80" placeholder="Suggest a title from the story"')}</div><div class="sa-row">${button('condenseSelected', 'Condense selected, gently')}${button('condenseSuggested', 'Review suggested sources')}</div><div id="sa-condense-suggestion" class="sa-hint"></div>
        <details class="sa-inline-tools"><summary>🧩 Recap suggestions</summary>
            <p class="sa-hint">The model reads the full text of eligible archive entries in your Library selection. Fill in both fields to use an inclusive unit range instead.</p>
            <div class="sa-grid">${field('recapFrom', 'First unit (optional)', '', 'number', 'min="0" step="1"')}${field('recapThrough', 'Last unit (optional)', '', 'number', 'min="0" step="1"')}</div>
            ${field('recapFocus', 'Focus (optional)', '', 'text', 'maxlength="500" placeholder="Find the scenes that set up the station escape"')}
            <div class="sa-row">${button('suggestRecapGroups', '✨ Suggest recap groups')}</div>
            <p id="sa-recap-groups-status" class="sa-hint" role="status"></p>
            <div id="sa-recap-groups"></div>
        </details>
        <details class="sa-inline-tools"><summary>🎯 Token target</summary>
            ${field('condenseTarget', 'Target tokens (0 = automatic)', 0, 'number', 'min="0"')}
        </details>
        <details class="sa-inline-tools"><summary>✍️ Archive condense prompt</summary>
            <label class="sa-field"><span>Writing instructions for shorter entries</span><textarea id="sa_archive_cond_prompt" class="text_pole" rows="5"></textarea></label>
            <p class="sa-hint">Use this to guide wording and emphasis. Scene Archivist still checks required headings, dates, times, and quotations.</p>
            <div class="sa-row"><input id="sa_archive_cond_prompt_reset" class="menu_button" type="button" value="Reset archive prompt"></div>
        </details>
        <details class="sa-inline-tools"><summary>✍️ Recap writing prompt</summary>
            <label class="sa-field"><span>Writing instructions for combined recaps</span><textarea id="sa_archive_recap_prompt" class="text_pole" rows="5"></textarea></label>
            <div class="sa-row"><input id="sa_archive_recap_prompt_reset" class="menu_button" type="button" value="Reset recap prompt"></div>
        </details>
        <details class="sa-inline-tools"><summary>🧠 Character memories</summary>
            <p class="sa-hint">Measure savings in tokens while keeping every distinct memory. Review and Undo remain available.</p>
            <div class="sa-row"><input id="sa_cond_run" class="menu_button sa-cond-run" type="button" value="✂️ Condense character memories"></div>
            <label class="sa-field"><span>Shorten character memories prompt</span><textarea id="sa_mem_shorten_prompt" class="text_pole" rows="5"></textarea></label>
            <div class="sa-row"><input id="sa_mem_shorten_prompt_reset" class="menu_button" type="button" value="Reset shorten prompt"></div>
            <details class="sa-inline-tools"><summary>Organize existing memories prompt</summary>
                <label class="sa-field"><span>Instructions used by Organize existing memories</span><textarea id="sa_cond_prompt" class="text_pole" rows="6"></textarea></label>
                <div class="sa-row"><input id="sa_cond_prompt_reset" class="menu_button" type="button" value="Reset organize prompt"></div>
            </details>
        </details>
        <details class="sa-inline-tools"><summary>⏰ Scheduled recaps</summary>
            <div class="sa-grid"><label class="sa-field"><span>Automation</span><select class="text_pole" data-sa-option="autoCondense"><option value="off">Manual only</option><option value="suggest">Suggest and review</option><option value="auto">Automatically create recaps</option></select></label><label class="sa-field"><span>Trigger</span><select class="text_pole" data-sa-option="trigger"><option value="units">After newer units</option><option value="time">Every N fictional calendar days</option><option value="pressure">Archive token pressure</option></select></label>${w.optionField('afterUnits', 'Newer units', 'number')}${field('afterDays','Fictional days per recap',w.options().afterDays,'number','data-sa-option="afterDays" min="1" max="365000" step="1"')}${w.optionField('pressureTokens', 'Archive token threshold', 'number')}</div><p class="sa-hint">Calendar periods start at the earliest reliably dated archive scene. Checks run after a completed archive scan; the latest archived fictional date closes elapsed periods. Flashbacks pause automatic recaps. Protected and undated records are excluded, and original scenes stay intact. Large periods may be split into recap parts to fit the helper model. Automatic mode is opt-in.</p><p id="sa-recap-schedule-status" class="sa-hint" role="status"></p><div class="sa-row">${button('runRecapSchedule','Check / run due recaps')}</div><p class="sa-hint">This button checks saved scenes now. In Automatically create recaps mode, it can make model requests; in Suggest mode, it makes none.</p>
        </details>`));
    w.panes.characters.insertAdjacentHTML('afterbegin', card('💭 Create character memories', `<div id="sa-memory-coverage" class="sa-hint"></div><div class="sa-grid"><label class="sa-field"><span>Read from</span><select class="text_pole" data-sa-flow="memorySource"><option value="chat">Chat</option><option value="archive">Archive</option><option value="both">Both</option></select></label><label class="sa-field"><span>Scope</span><select class="text_pole" data-sa-flow="scope"><option value="new">New material</option><option value="messages">Exact chat messages</option><option value="units">Unit range</option><option value="last">Last X units</option></select></label>${field('memoryStart', 'Start (inclusive)', '', 'number', 'min="0"')}${field('memoryEnd', 'End (inclusive)', '', 'number', 'min="0"')}${field('memoryLast', 'Number of units', 5, 'number', 'min="1"')}</div><div class="sa-row">${button('backfillKnowledge','Build missing lists from saved knowledge (no AI)')}${button('backfillScenes','Scan missing character memories')}${button('memoriesAll', 'Create memories from selected source')}${button('memoryAudit', 'Organize existing memories')}</div>`));
    w.panes.settings.insertAdjacentHTML('afterbegin', card('Story setting context', `<p class="sa-hint">Describe the AU, era, world rules and recurring cast in a few sentences. Saved per story; used in workbench generation requests, not injected into ordinary RP or treated as new evidence.</p><label class="sa-field"><span>Setting background</span><textarea class="text_pole" data-sa-field="storySettingContext" rows="5" maxlength="4000"></textarea></label><div class="sa-row">${button('saveStoryContext','Save story setting')}</div>`, false));
    w.panes.settings.insertAdjacentHTML('afterbegin', card('📖 Context for archive and memories', `<label class="checkbox_label"><input type="checkbox" data-sa-flow="persona"><span>Create memories for my persona</span></label><label class="checkbox_label"><input type="checkbox" data-sa-flow="readReferences"><span>Read selected lorebooks for archive and memories</span></label><div class="sa-row">${button('flowReferences', 'Choose reference lorebooks')}<span id="sa-reference-summary" class="sa-hint"></span></div><div class="sa-grid"><label class="sa-field"><span>Reference tokens, 0 for the whole selection</span><input class="text_pole" type="number" min="0" value="0" data-sa-flow="referenceBudget"></label><label class="sa-field"><span>Reference selection policy</span><select class="text_pole" data-sa-flow="referenceFit"><option value="all">All selected entries, explain overflow</option><option value="relevant">Relevant complete entries within allowance</option></select></label></div><label class="checkbox_label"><input type="checkbox" data-sa-flow="auditMemories"><span>Audit proposed memories against evidence, one extra request</span></label><p class="sa-hint">Audits provide advice for your review and use separate passes. Their extraction result is retained if the audit fails. No memories are rewritten automatically.</p><label class="checkbox_label"><input type="checkbox" data-sa-flow="includeChatContext"><span>Include SillyTavern chat context</span></label><p class="sa-hint">Reference lore supplies background. The selected scene supplies events and character knowledge. Chat context uses SillyTavern's prompt preview. Extensions that only run during live generation may contribute different material.</p>`, false));
    w.panes.settings.insertAdjacentHTML('beforeend', card('⏰ Optional automation', `<label class="checkbox_label"><input type="checkbox" data-sa-flow="singleRequest"><span>Combine stages into one request when they use the same model</span></label><label class="checkbox_label"><input type="checkbox" data-sa-flow="rolling"><span>Prepare rolling memories from chat</span></label><div class="sa-grid"><label class="sa-field"><span>New messages before a review</span><input class="text_pole" type="number" min="1" data-sa-flow="rollingEvery"></label><label class="sa-field"><span>Leave the latest messages out</span><input class="text_pole" type="number" min="0" data-sa-flow="rollingBuffer"></label></div><p class="sa-hint">Rolling memories use Chat or Both and keep a reviewable draft.</p>`, false));
    root.querySelector('.sa-main').insertAdjacentHTML('afterend', '<p id="sa-flow-preview" class="sa-hint"></p>');
    w.panes.characters.insertAdjacentHTML('beforeend', card('🧩 Facts, knowledge and unfinished business', `<p class="sa-hint">Select source entries in Library. Extract who knows, suspects, believes incorrectly, is unaware, or is hiding something, plus living facts and open promises.</p><div class="sa-row">${button('extract', 'Extract from selected')}${button('newKnowledge', 'Add knowledge')}${button('newFact', 'Add fact')}${button('newThread', 'Add promise or thread')}</div><div id="sa-state-list"></div>`, false));
    w.panes.characters.insertAdjacentHTML('beforeend', card('Character diaries', `
        <p class="sa-hint">Private, first-person writing grounded in the selected character’s personal evidence. Diaries are separate from canon and RP injection.</p>
        <div class="sa-grid sa-diary-selection">
            <label class="sa-field"><span>Story character / NPC</span><select class="text_pole" data-sa-field="diaryCharacter"><option value="">Choose a story character</option></select></label>
            <label class="sa-field"><span>Saved diary</span><select class="text_pole" data-sa-field="diarySaved"><option value="">No saved diary</option></select></label>
        </div>
        <p id="sa-diary-policy-status" class="sa-hint" role="status"></p>
        <div class="sa-row sa-diary-actions">${button('diary', 'Write diary')}${button('diaryUpdate', 'Update diary')}${button('diaryRegenerate', 'Regenerate saved diary')}${button('diaryEdit', 'Edit saved diary')}</div>
        <div class="sa-row">${button('diaryBulk', 'Bulk create diaries')}</div>
        <p class="sa-hint">Regeneration uses the saved diary’s exact evidence, ignores period fields and preserves the original until approval.</p>
        <div id="sa-diary-reader" class="sa-hint sa-diary-reader sa-markdown" role="status"></div>
        <details class="sa-inline-tools"><summary>Period, writing style &amp; revision tools</summary>
            <p class="sa-hint">Default: latest dated period with personal evidence. Choose a date or message range for earlier events. Requests use the separate Diary model in Settings.</p>
            <div class="sa-grid">${field('diaryDate', 'Story date (YYYY-MM-DD, optional)')}${field('diaryFrom', 'Source message from (optional)', '', 'number', 'min="0"')}${field('diaryTo', 'Source message through (optional)', '', 'number', 'min="0"')}</div>
            <label class="sa-field"><span>Voice / style direction (optional)</span><textarea class="text_pole" data-sa-field="diaryStyle" rows="3"></textarea></label>
            <div class="sa-row">${button('diaryRewrite', 'Replace with selected period')}${button('diaryCondense', 'Condense diary')}</div>
        </details>
        <details class="sa-inline-tools"><summary>Diary author identity</summary>
            <p class="sa-hint">Scans propose missing identities and voice directions during structured extraction, with no extra model request. Saved author edits take priority. Clear and save to return to scan-generated guidance when available. Matching cards provide background only, never event knowledge. Story setting is in Settings.</p>
            <label class="sa-field"><span>Identity and voice</span><textarea class="text_pole" data-sa-field="diaryAuthorIdentity" rows="3" maxlength="1500"></textarea></label>
            <div class="sa-row">${button('saveDiaryIdentity','Save author identity')}</div>
        </details>
        <details class="sa-inline-tools"><summary>Diary blacklist</summary>
            <p class="sa-hint">Your active persona is excluded by default. You may explicitly allow them. This does not hide or delete memories or existing diaries.</p>
            <div class="sa-row">${button('diaryBlacklistAdd','Blacklist selected character')}</div>
            <label class="sa-field"><span>Excluded characters in this story</span><select class="text_pole" data-sa-field="diaryBlacklist"><option value="">Choose blocked character</option></select></label>
            <div class="sa-row">${button('diaryBlacklistRemove','Allow selected blocked character')}</div>
        </details>
        <details class="sa-inline-tools"><summary>Character roster tools</summary>
            ${field('diaryName', 'Individual name (optional override / add)')}
            <div class="sa-row">${button('diaryDetect', 'Detect characters in chat')}${button('diaryAddCharacter', 'Add typed name')}${button('diaryExcludeCharacter','Hide incorrect candidate')}</div>
            <p id="sa-diary-cast-status" class="sa-hint" role="status"></p>
            <p class="sa-hint">Detection uses the Diary model and the last 80 messages by default, or the message range in Period, writing style &amp; revision tools. It saves names only.</p>
        </details>`, false));
    w.panes.library.insertAdjacentHTML('beforeend', card('🔎 Search, evidence and continuity', `<p class="sa-hint">Ask searches this story’s saved records. If evidence is missing, it can make one follow-up pass using related wording and verified original messages in this chat. Evidence used shows what was supplied; source buttons open the saved record or jump to the original passage.</p><div class="sa-row"><input class="text_pole" data-sa-field="question" placeholder="Ask, or enter a claim to check" aria-label="Archive question or continuity claim">${button('ask', 'Ask the archive')}${button('continuity', 'Check this claim')}${button('continuityAll', 'Check recent continuity')}${button('continuityFull', 'Check whole archive')}</div><p class="sa-hint">Recent checks use the configured number of newest eligible records. Findings stay below until another check replaces them.</p><div id="sa-evidence-results" aria-live="polite"></div><div id="sa-continuity-results" aria-live="polite"></div>`));
    w.panes.prompt.insertAdjacentHTML('beforeend', card('💰 Memory budget and loading reasons', `<div class="sa-row"><label>Show activation source<select class="text_pole" data-sa-field="activationFilter"><option value="">All sources</option><option value="keyword">Keyword</option><option value="native vector">Vector</option><option value="always on">Always On</option><option value="recall">AI Recall</option><option value="sticky">Sticky</option></select></label></div><div id="sa-budget-view"></div>`, false));
    w.panes.settings.insertAdjacentHTML('afterbegin', card('🛠️ Story memory settings', `<div class="sa-grid">${w.optionField('budget', 'Total injected memory tokens', 'number')}${w.optionField('requestBudget', 'Helper input tokens (0 = use model context)', 'number')}${w.optionField('batchSize', 'Units per helper request (0 = fit context)', 'number')}${w.optionField('charactersPerBatch', 'Characters per audit request (0 = fit context)', 'number')}<label class="sa-field"><span>Review bulk results</span><select class="text_pole" data-sa-option="reviewMode"><option value="end">Together at the end</option><option value="step">After each step</option></select></label></div><p class="sa-hint">Together at the end runs the whole job before one combined review. Helpers fit the selected model’s context by default. Use a positive input or count limit to cap individual requests. Review later keeps prepared results.</p><label class="checkbox_label"><input type="checkbox" data-sa-option="continuityAuto"><span>Check continuity after new replies, findings only</span></label><label class="checkbox_label"><input type="checkbox" data-sa-option="recapOnReturn"><span>Offer a dated recap when returning to this story</span></label>${w.optionField('recapAfterHours', 'Hours before offering a return recap', 'number')}<div id="sa-telemetry" class="sa-hint"></div>`));
    w.panes.maintain.insertAdjacentHTML('beforeend', card('🔗 Archive sharing', `<p id="sa-sharing-state" class="sa-hint"></p><div class="sa-row">${button('sharing', 'Share this archive across chats')}</div>
        <details id="sa-shared-filing" class="sa-inline-tools" hidden><summary>📁 Where to file new summaries</summary>
            <div class="sa-grid"><label class="sa-field"><span>Where to file new summaries</span><select class="text_pole" data-sa-flow="sharedMode"><option value="new">Start a new unit</option><option value="continue">Continue an existing unit</option><option value="earlier">File an earlier event</option></select></label>${field('sharedUnit', 'Existing unit number', '', 'number', 'min="0"')}</div>
        </details>`, false));
    w.panes.maintain.insertAdjacentHTML('beforeend', card('💾 Backups and restore', `<p class="sa-hint">A story backup includes its archive, character memories, recaps, dependencies, revisions, jobs and workflow settings. Imports show a preview and create separate books. Connection profiles stay on your device.</p><div class="sa-row">${button('exportStory', 'Export complete story')}${button('importStory', 'Import or restore story')}${button('exportWorkflow', 'Export workflow preset')}${button('importWorkflow', 'Import workflow preset')}${button('importLog', 'Import a plain Scene Log')}</div><input data-sa-field="file" type="file" accept=".json,.md,.txt" hidden>`, false));
    w.panes.prompt.insertAdjacentHTML('beforeend', card('🧭 Archive vector search', `<p class="sa-hint">Independent story index. No native World Info injection. Synchronize explicitly after scanning or editing; only changed chunks are embedded. Search evidence uses your selected retrieval mode.</p><label class="sa-field"><span>Tool search mode</span><select class="text_pole" data-sa-option="archiveVectorMode"><option value="keyword">Keyword only</option><option value="hybrid">Hybrid (keyword + semantic)</option><option value="vector">Semantic (keyword fallback on errors)</option></select></label><label class="sa-field"><span>Embedding provider</span><select class="text_pole" data-sa-option="archiveVectorSource"><option value="ollama">Ollama</option><option value="vllm">vLLM</option><option value="llamacpp">llama.cpp</option><option value="transformers">ST local Transformers</option><option value="openai">OpenAI (ST API key)</option><option value="openrouter">OpenRouter (ST API key)</option></select></label><div class="sa-grid">${w.optionField('archiveVectorModel','Embedding model ID (e.g. qwen3-embedding:4b)','text')}${w.optionField('archiveVectorUrl','Embedding server URL (local providers)','text')}${w.optionField('archiveVectorK','Semantic results (1–30)','number')}<label class="sa-field"><span>Minimum similarity (0–1)</span><input class="text_pole" type="number" min="0" max="1" step="0.05" data-sa-option="archiveVectorThreshold"></label></div><div class="sa-row">${button('vectorSync','Synchronize archive index')}</div><div class="sa-row">${field('archiveVectorQuery','Test semantic query')}${button('vectorTest','Test archive search')}</div><div id="sa-vector-preview"></div><p id="sa-archive-vector-status" class="sa-hint" role="status">Not synchronized in this session. Existing index is reused after reload. No embeddings are generated during passive refresh. Test archive search checks the selected server index and shows semantic and keyword matches separately.</p><label class="checkbox_label"><input type="checkbox" data-sa-option="ensembleTools"><span>Ensemble narrator: allow tool access to a named NPC’s personal records when explicitly requested. Omit character to search general narrative evidence (not personal memory lists).</span></label>`, true));
    w.panes.prompt.insertAdjacentHTML('beforeend', card('Archive reranker', `<p class="sa-hint">Optional second-stage relevance ranking for Search evidence. Sends only eligible shortlisted evidence to the selected service; no changes to archive records or embeddings. External endpoints receive story excerpts. Off by default.</p>
        <label class="checkbox_label"><input type="checkbox" data-sa-option="archiveRerankEnabled"><span>Enable reranking for archive tool searches</span></label>
        <label class="sa-field"><span>Reranker API format</span><select class="text_pole" data-sa-option="archiveRerankProvider"><option value="compatible">Rerank API (vLLM / Infinity / Cohere-style)</option><option value="tei">Hugging Face TEI /rerank</option><option value="ollama">Ollama (Qwen3 rank scores · experimental)</option></select></label>
        <label class="sa-field"><span>Connection route</span><select class="text_pole" data-sa-option="archiveRerankTransport"><option value="direct">Browser direct (CORS required)</option><option value="server">ST server proxy (must already be enabled)</option></select></label>
        ${w.optionField('archiveRerankUrl','Server URL (Ollama base URL; otherwise full rerank endpoint)','text')}${w.optionField('archiveRerankModel','Reranker model ID (optional for TEI)','text')}
        ${field('rerankKey','Bearer API key (optional, this session only)','','password','autocomplete="off"')}
        <div class="sa-grid">${[['archiveRerankCandidates','Candidates (2–40)',2,40],['archiveRerankResults','Final results (1–20)',1,20],['archiveRerankChars','Characters per candidate (400–4000)',400,4000],['archiveRerankTimeout','Timeout in seconds (3–60)',3,60]].map(([key,label,min,max])=>field(key,label,w.options()[key],'number',`data-sa-option="${key}" min="${min}" max="${max}" step="1"`)).join('')}</div>
        <p class="sa-hint">Ollama: enter http://127.0.0.1:11434 and the installed Qwen3 rank-pooled model ID. The adapter uses /api/show and /api/embed; a synthetic ranking test must pass before story excerpts are sent. Some Ollama versions cannot expose the rank head. In that case the original retrieval ranking remains active.</p><p class="sa-hint">For mobile, a direct endpoint must be reachable from the phone (not its localhost). The server-proxy route uses ST's existing optional CORS proxy; do not expose a proxy-enabled ST instance publicly. No proxy settings are changed by Scene Archivist.</p>
        <div class="sa-row">${button('rerankTest','Test reranker connection')}${button('rerankClearKey','Clear session API key')}</div><p id="sa-rerank-status" class="sa-hint" role="status">Not tested in this session. Errors fall back to the original search ranking.</p>`, false));
    mountTools(w);
    mountRecovery(w);
    w.extras = new WorkbenchExtras(w);
    mountStoryTools(w);
    if (w.h.settings().databaseOnly) cleanupDatabaseUI(w, root);
    w.layout = new WorkspaceLayout(w);
    w.library = new StoryLibrary(w);
    root.addEventListener('click', event => {
        const tab = event.target.closest('[data-sa-tab]'); if (tab) { w.showTab(tab.dataset.saTab); return; }
        const b = event.target.closest('[data-sa-action]');
        if (b) { event.preventDefault(); w.dispatch(b.dataset.saAction, b).catch(e => w.h.notify(String(e?.message ?? e), 'error')); }
    });
    root.querySelector('[data-sa-field="diaryCharacter"]')?.addEventListener('change', () => { root.querySelector('[data-sa-field="diaryName"]').value = ''; w.renderDiaryReader(); });
    root.querySelector('[data-sa-field="diaryName"]')?.addEventListener('change', () => w.renderDiaryReader());
    root.querySelector('[data-sa-field="diarySaved"]')?.addEventListener('change', () => w.renderDiaryReader());
    root.querySelector('[data-sa-field="question"]').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); w.dispatch('ask').catch(error => w.h.notify(error.message, 'error')); }
    });
    nav.addEventListener('keydown', e => {
        const buttons = [...nav.querySelectorAll(':scope > [role=tab]:not([hidden])')], i = buttons.indexOf(document.activeElement);
        if (i < 0 || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault(); const n = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (i + (['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : -1) + buttons.length) % buttons.length;
        w.showTab(buttons[n].dataset.saTab); buttons[n].focus();
    });
    root.addEventListener('change', event => {
        const control = event.target.closest('[data-sa-flow]');
        if (control) {
            const state = (w.liveState().flowSettings ??= {});
            state[control.dataset.saFlow] = control.type === 'checkbox' ? control.checked : control.type === 'number' ? Number(control.value) : control.value;
            w.renderFlow();
            void w.persist().catch(error => w.h.notify(error.message, 'error'));
            return;
        }
        const el = event.target;
        if (el.dataset.saField === 'rerankKey') { try { w.setRerankKey(el.value); } catch(error) { w.clearRerankKey(); w.rerankProgress(error.message); } el.value=''; return; }
        if (el.dataset.saOption) {
            const key = el.dataset.saOption;
            w.options()[key] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
            w.h.saveSettings();
            if (['autoCondense','trigger','afterDays','afterUnits','pressureTokens'].includes(key)) w.renderRecapSchedule();
            if (key === 'sceneRecall') w.chatControls?.renderScene();
            if (['archiveRerankUrl','archiveRerankProvider','archiveRerankTransport'].includes(key)) w.clearRerankKey();
            if (key.startsWith('archiveRerank')) w.rerankProgress?.('Settings changed. Test the connection before use.');
            if (['archiveVectorSource','archiveVectorModel','archiveVectorUrl'].includes(key)) w.vectorProgress?.('Embedding connection changed. Synchronize the selected index before using semantic retrieval.');
            else if(key.startsWith('archiveVector')) w.vectorProgress?.('Search settings changed. Test again; no reindex required.');
        }
        if (el.dataset.saField === 'activationFilter') w.renderBudget();
        if (el.dataset.saSelect) { el.checked ? w.selected.add(el.dataset.saSelect) : w.selected.delete(el.dataset.saSelect); w.renderDashboard(); }
        if (el.matches('#sa-library-type, #sa-library-history, .sa-library-filter')) w.renderLibrary();
        if (el.dataset.saField === 'file' && el.files?.[0]) { w.readImport(el.files[0], w.importKind).catch(e => w.h.notify(e.message, 'error')); el.value = ''; }
        w.layout?.refresh();
    });
    root.querySelector('#sa-library-query').addEventListener('input', () => w.scheduleLibraryRender());
    for (const input of root.querySelectorAll('[data-sa-field="rangeFrom"],[data-sa-field="rangeTo"]')) input.addEventListener('input', () => {
        root.querySelector('#sa-range-preview').textContent = '';
        root.querySelector('#sa-range-message-preview')?.replaceChildren();
    });
    w.syncOptions(); w.showTab('story'); w.updateUnitLabels(); w.installVectorBridge();
}


function mountDatabaseStoryTools(w) {
    w.panes.story.innerHTML = `<section class="sa-story-home sa-db-home">
        <h3 id="sa-story-name">This story’s evidence</h3>
        <div id="sa-story-stats"></div><p id="sa-story-job" class="sa-hint"></p><p id="sa-story-warnings" class="sa-warnline"></p>
        <div class="sa-db-scan-choices">
            <article class="sa-db-choice"><b>Scan everything new</b><p>Normal catch-up. Scene Archivist finds every story message that has not been scanned yet and splits large chats into safe batches automatically.</p>${button('storyThorough', 'Scan all new messages')}</article>
            <article class="sa-db-choice"><b>Scan only part of the chat</b><p>Use this when you deliberately want one scene, arc, test sample, or corrected section instead of all pending material.</p>${button('storyRange', 'Choose a message range')}</article>
        </div>
        <div class="sa-row sa-db-secondary">${button('estimateThorough', 'Estimate new-message scan')}</div>
        <p class="sa-note">Scanning writes source-backed evidence to the database. Nothing from Scene Archivist is inserted into normal RP prompts; the main model receives records only when it explicitly calls a retrieval tool.</p>
    </section>`;
    w.panes.story.insertAdjacentHTML('beforeend', `<div class="sa-story-cards">
        ${card('🧵 Open threads <span id="sa-story-thread-count" class="sa-hint"></span>', '<div id="sa-story-threads"></div>', false)}
        ${card('🗂️ Recently saved', '<ul id="sa-story-recent"></ul>', false)}
        ${card('Database health', `<div class="sa-row">${button('setupHealth', 'Check database')}${button('migrateStorage', 'Migrate legacy archive')}${button('repairMissing', 'Repair missing information')}${button('safeDiagnostics', 'Export diagnostics')}</div><div class="sa-row">${button('debugToggle', 'Enable debug console')}${button('debugView', 'View debug log')}${button('debugClear', 'Clear debug log')}</div><p class="sa-hint">Debug console output is OFF by default. The in-extension log keeps recent Scene Archivist diagnostics without flooding DevTools.</p>`, false)}
        ${card('💾 Backup and data', `<p class="sa-hint">Backup and restore are always available here. Standalone files are stored on the ST server in user/files. Do not delete scene-archivist-db-*.json in Data Maid / loose-file cleanup. Clearing affects only Scene Archivist records and scan coverage.</p><div class="sa-row">${button('exportStory', 'Export database backup')}${button('importStory', 'Import / restore backup')}${button('clearDatabase', 'Clear Scene Archivist data')}</div>`, false)}
    </div>`);
    w.panes.prompt.insertAdjacentHTML('afterbegin', card('🛠️ Main-model retrieval tools', `<label class="checkbox_label"><input type="checkbox" data-sa-option="memoryTools"><span>Allow supported models to query Scene Archivist when they need older continuity</span></label>
        <div class="sa-tool-explainer"><p><b>Search evidence</b><span>Finds older facts, promises, possessions, chronology, knowledge states, locations, and unresolved threads.</span></p><p><b>Open source</b><span>Opens the verified original messages behind a result when exact wording, attribution, or sequence matters.</span></p><p><b>Open archive unit</b><span>Opens a known numbered Scene/Day/Chapter. The model should use this only when it already knows the unit number.</span></p></div>
        <p class="sa-note">These are on-demand retrieval tools. They do not create ambient memory injection.</p>`));
    w.panes.prompt.insertAdjacentHTML('afterbegin', card('Information trees', `<p class="sa-hint">Browse folder paths, short evidence summaries and exact IDs. The tree is rebuilt from saved records on demand, without another model call. Semantic indexing includes tree paths.</p><div class="sa-row">${button('treeBrowse','Browse archive tree')}</div><p class="sa-hint">The main model can call view_tree, then read_entries, or search within a returned branch.</p>`));
    w.panes.settings.insertAdjacentHTML('afterbegin', card('🔧 Database settings', `<p id="sa-profile-scope"></p><div class="sa-row">${button('setupHealth', 'Check database')}${button('profiles', 'Manage model profiles')}</div>
        <label class="sa-field"><span>Model requests per minute (0 = no pacing)</span><input id="sa_rate_rpm" class="text_pole" type="number" min="0" max="600" step="1" title="Shared limit for all Scene Archivist model calls, including retries; does not throttle normal RP."></label><p class="sa-hint">Requests are spaced evenly, not sent in bursts. Provider rate-limit errors pause the current job and retain its results. Resume respects the provider cooldown even when pacing is off.</p><p data-sa-pacing-status class="sa-hint" aria-live="polite"></p>
        <label class="checkbox_label"><input id="sa_message_actions" type="checkbox"><span>Show Scene Archivist message action button</span></label><p class="sa-hint">Off by default. When enabled, the button appears below message text, not in SillyTavern’s native action bar. Manual range selection remains available in Scan.</p>
        <label class="checkbox_label"><input id="sa_cadence_enabled_panel" type="checkbox"><span>Enable automatic scan cadence / reminders</span></label><p id="sa_cadence_status_panel" class="sa-hint" role="status"></p><p class="sa-hint">Uncheck to pause new automatic scans and reminders without changing the interval or scan mode in More. Manual scans, retrieval and recap settings remain available. An already-started job is not canceled.</p><div id="sa-telemetry" class="sa-hint"></div>`));
}

function cleanupDatabaseUI(w, root) {
    const removeCard = selector => root.querySelector(selector)?.closest('details.sa-card')?.remove();
    for (const selector of ['#sa_mem_target', '#sa_tr_sel', '#sa_recall', '#sa_view_sum', '#sa_delivery', '[data-sa-flow="rolling"]', '[data-sa-option="budget"]']) removeCard(selector);
    root.querySelector('#sa_cond_run')?.closest('details.sa-inline-tools')?.remove();
    root.querySelector('[data-sa-flow="persona"]')?.closest('details.sa-card')?.remove();
    root.querySelector('[data-sa-action="importLore"]')?.remove();
    for (const action of ['rangeCatchUp', 'rangeHide', 'rangeShow']) root.querySelector(`[data-sa-action="${action}"]`)?.remove();
    for (const field of ['rangeHide', 'rangeMemories']) root.querySelector(`[data-sa-field="${field}"]`)?.closest('label')?.remove();

    // Keep the legacy database selector because its IDs are wired to ST, but strip
    // the duplicate legacy scan controls from the visible UI.
    const heroCard = root.querySelector('.sa-hero')?.closest('details.sa-card');
    if (heroCard) {
        const summary = heroCard.querySelector(':scope > summary'); if (summary) summary.textContent = '🗄️ Database';
        heroCard.open = false;
        const select = heroCard.querySelector('#sa_lorebook');
        if (select && !heroCard.querySelector('label[for="sa_lorebook"]')) select.insertAdjacentHTML('beforebegin', '<label for="sa_lorebook" class="sa-control-label">Evidence database</label>');
        const name = heroCard.querySelector('#sa_newname'); if (name) name.placeholder = 'New database name';
        const create = heroCard.querySelector('#sa_create'); if (create) create.value = 'Create database';
        for (const id of ['sa_run', 'sa_thorough', 'sa_paste', 'sa_check', 'sa_attach', 'sa_fix']) { const node = heroCard.querySelector('#' + id); if (node) node.hidden = true; }
    }

    // Exact-range scanning should read like one self-contained workflow.
    const rangeCard = root.querySelector('[data-sa-action="rangePreview"]')?.closest('details.sa-card');
    if (rangeCard) {
        const summary = rangeCard.querySelector(':scope > summary'); if (summary) summary.textContent = '🎯 Scan selected message range';
        const body = rangeCard.querySelector(':scope > .sa-body');
        if (body) body.innerHTML = `<p class="sa-hint"><b>Use this only when you want a specific part of the chat.</b> For normal catch-up, use Overview → Scan all new messages.</p>
            <p class="sa-hint">Choose Start and End with the small Scene Archivist book control beside chat messages, or type the message numbers below. Both endpoints are included.</p>
            <div class="sa-grid">${field('rangeFrom', 'Start message', '', 'number', 'min="0"')}${field('rangeTo', 'End message (included)', '', 'number', 'min="0"')}</div>
            <p id="sa-range-preview" class="sa-hint"></p>
            <div class="sa-row">${button('rangePreview', 'Preview selected messages')}${button('rangeArchive', 'Scan selected range')}</div>
            <div class="sa-row sa-db-secondary">${button('rangeClear', 'Clear message range')}${button('estimateRange', 'Estimate selected range')}</div>`;
        rangeCard.open = true;
    }

    const ledgerCard = root.querySelector('#sa_ledger')?.closest('details.sa-card');
    if (ledgerCard) { const summary = ledgerCard.querySelector(':scope > summary'); if (summary) summary.textContent = '📒 Scan history'; ledgerCard.open = false; }

    const tidyCard = root.querySelector('[data-sa-action="tidy"]')?.closest('details.sa-card');
    if (tidyCard) {
        const summary = tidyCard.querySelector(':scope > summary'); if (summary) summary.textContent = '🧹 Normalize database order';
        const hint = tidyCard.querySelector('.sa-hint'); if (hint) hint.textContent = 'Reorders managed records and groups dated material without asking a model to rewrite story content.';
        const tidy = tidyCard.querySelector('[data-sa-action="tidy"]'); if (tidy) tidy.textContent = 'Normalize record order';
        tidyCard.open = false; w.panes.maintain.prepend(tidyCard);
    }

    const inspector = root.querySelector('#sa-library-query')?.closest('details.sa-card');
    if (inspector) {
        const summary = inspector.querySelector(':scope > summary'); if (summary) summary.textContent = '🔬 Evidence browser';
        const query = inspector.querySelector('#sa-library-query'); if (query) query.placeholder = 'Search names, dates, places, promises, facts, or text';
        const type = inspector.querySelector('#sa-library-type option[value=""]'); if (type) type.textContent = 'All record types';
        const select = inspector.querySelector('[data-sa-action="selectVisible"]'); if (select) select.textContent = 'Select all shown';
        const clear = inspector.querySelector('[data-sa-action="clearSelection"]'); if (clear) clear.textContent = 'Clear selected records';
        const refresh = inspector.querySelector('[data-sa-action="refresh"]'); if (refresh) refresh.textContent = 'Reload database';
        const clip = inspector.querySelector('[data-sa-action="clip"]'); if (clip) clip.textContent = 'Save evidence note';
        const hint = inspector.querySelector('.sa-hint'); if (hint) hint.textContent = 'Use the checkboxes to select evidence for structured extraction, recap/shortening, export, protection, or repair. Opening and searching do not change records.';
    }

    const factsCard = root.querySelector('[data-sa-action="extract"]')?.closest('details.sa-card');
    if (factsCard) {
        const summary = factsCard.querySelector(':scope > summary'); if (summary) summary.textContent = '🧩 Structured continuity';
        const hint = factsCard.querySelector('.sa-hint'); if (hint) hint.textContent = 'Turn selected evidence into searchable facts, character knowledge states, and unresolved threads. Nothing is added to normal RP prompts.';
        const labels = { extract: 'Extract continuity from selected evidence', newKnowledge: 'Add character knowledge', newFact: 'Add story fact', newThread: 'Add open thread / promise' };
        for (const [action, text] of Object.entries(labels)) { const node = factsCard.querySelector(`[data-sa-action="${action}"]`); if (node) node.textContent = text; }
    }

    const condenseCard = root.querySelector('[data-sa-action="condenseSelected"]')?.closest('details.sa-card');
    if (condenseCard) {
        const summary = condenseCard.querySelector(':scope > summary'); if (summary) summary.textContent = '✂️ Create recap or shorten evidence';
        const hint = condenseCard.querySelector('.sa-hint'); if (hint) hint.textContent = 'Use records selected in Evidence. Create recap combines them into one linked summary; Shorten keeps them separate and makes each record smaller.';
        const run = condenseCard.querySelector('[data-sa-action="condenseSelected"]'); if (run) run.textContent = 'Review recap / shortening';
        const suggest = condenseCard.querySelector('[data-sa-action="condenseSuggested"]'); if (suggest) suggest.textContent = 'Find recap candidates';
    }

    const memoryCreateCard = root.querySelector('[data-sa-action="memoriesAll"]')?.closest('details.sa-card');
    if (memoryCreateCard) {
        const summary = memoryCreateCard.querySelector(':scope > summary'); if (summary) summary.textContent = '🧠 Build character library';
        const hint = memoryCreateCard.querySelector('.sa-hint'); if (hint) hint.textContent = 'Build initial lists from existing character knowledge at no model cost, or scan unprocessed archive scenes for richer episodic memories. Neither action rescans the raw story. These records are not injected into normal RP prompts.';
        const create = memoryCreateCard.querySelector('[data-sa-action="memoriesAll"]'); if (create) create.textContent = 'Create memories from selected source';
        const audit = memoryCreateCard.querySelector('[data-sa-action="memoryAudit"]'); if (audit) audit.textContent = 'Organize character memories';
        memoryCreateCard.open = false;
    }
    const memoryBrowser = root.querySelector('#sa-character-memories')?.closest('details.sa-card');
    if (memoryBrowser) { const summary = memoryBrowser.querySelector(':scope > summary'); if (summary) summary.textContent = '👥 Character Library'; memoryBrowser.open = true; }
    const diaryCard = root.querySelector('[data-sa-action="diary"]')?.closest('details.sa-card');
    if (diaryCard) { const summary = diaryCard.querySelector(':scope > summary'); if (summary) summary.textContent = '📓 Character diaries'; diaryCard.open = false; }

    const backupCard = root.querySelector('[data-sa-action="exportStory"]')?.closest('details.sa-card');
    if (backupCard) {
        const summary = backupCard.querySelector(':scope > summary'); if (summary) summary.textContent = '💾 Data management';
        const body = backupCard.querySelector(':scope > .sa-body');
        body?.querySelector('[data-sa-action="exportStory"]')?.replaceChildren(document.createTextNode('Export database backup'));
        body?.querySelector('[data-sa-action="importStory"]')?.replaceChildren(document.createTextNode('Import / restore backup'));
        const row = body?.querySelector('.sa-row');
        if (row && !row.querySelector('[data-sa-action="repairMissing"]')) row.insertAdjacentHTML('beforeend', `${button('repairMissing', 'Repair missing information')}${button('clearDatabase', 'Clear Scene Archivist data')}`);
        backupCard.open = true;
    }

    const characterTab = root.querySelector('[data-sa-tab="characters"]'); if (characterTab) characterTab.textContent = 'knowledge';
    const promptTab = root.querySelector('[data-sa-tab="prompt"]'); if (promptTab) promptTab.textContent = 'retrieval';
    const run = root.querySelector('#sa_run'); if (run) { run.value = 'Scan all new messages'; run.title = 'Scan every story message that is not already covered, automatically splitting large chats into bounded passes.'; }
    const auto = root.querySelector('#sa_autoarch'); if (auto) { const span = auto.closest('label')?.querySelector('span'); if (span) span.textContent = 'Automatically scan when the threshold is reached'; }
    const threshold = root.querySelector('#sa_remind'); if (threshold) { const label = threshold.closest('.sa-row')?.querySelector('label'); if (label) label.textContent = 'Scan after this many new story messages'; }
    const hide = root.querySelector('#sa_hide'); hide?.closest('label')?.remove();
    const keep = root.querySelector('#sa_keepvis'); keep?.closest('.sa-row')?.remove();
    const attach = root.querySelector('#sa_attach'); if (attach) attach.hidden = true;
    const fix = root.querySelector('#sa_fix'); if (fix) fix.hidden = true;
    const thorough = root.querySelector('#sa_thorough'); if (thorough) thorough.hidden = true;
}

function mountStoryTools(w) {
    if (w.h.settings().databaseOnly) { mountDatabaseStoryTools(w); return; }
    w.panes.story.innerHTML = `<section class="sa-story-home">
        <p class="sa-eyebrow">THE STORY SO FAR</p><h3 id="sa-story-name">📖 This story</h3>
        <div id="sa-story-stats"></div><p id="sa-story-job" class="sa-hint"></p><p id="sa-story-warnings" class="sa-warnline"></p>
        <div class="sa-row">${button('storyThorough', '📚 Archive thoroughly')}${button('storyRange', '🎯 Choose range')}${button('storyAttach', '🔗 Attach archive to this chat', 'hidden')}${button('estimateThorough', '📊 Estimate this run')}</div>
        <p class="sa-hint">Summaries, character memories and enabled trackers, with one review. The lore can be dramatic. The buttons can behave.</p>
    </section>`;
    w.panes.story.insertAdjacentHTML('beforeend', `<div class="sa-story-cards">
        ${card('🧵 Open threads <span id="sa-story-thread-count" class="sa-hint"></span>', '<div id="sa-story-threads"></div>', false)}
        ${card('🗂️ Recently saved', '<ul id="sa-story-recent"></ul>', false)}
        ${card('Get started or troubleshoot', `<div class="sa-row">${button('workflowPreset', 'Choose a workflow')}${button('setupHealth', 'Check setup')}${button('forgotten', 'Why was this forgotten?')}${button('safeDiagnostics', 'Export reviewed diagnostics')}${button('groundingCheck', 'Test helper grounding, up to 5 requests')}</div>`, false)}
        ${card('🔎 Memory Trail', `<p id="sa-story-trace" class="sa-hint"></p><div class="sa-row">${button('dockPromptTrace', '🔎 Open trail beside chat')}${button('previewReply', 'Preview next reply')}</div>`, false)}
    </div>`);
    const range = w.root.querySelector('#sa-range-preview');
    range.insertAdjacentHTML('beforebegin', '<p id="sa-range-anchor-note" class="sa-hint" hidden></p>');
    range.insertAdjacentHTML('afterend', `<div class="sa-row">${button('rangeClear', '🧽 Clear picks')}${button('estimateRange', '📊 Estimate this range')}${button('sharedFiling', '📂 Shared filing options', 'hidden')}</div>
        <details class="sa-inline-tools"><summary>💡 Find a scene break</summary><p class="sa-hint">Ask the helper to suggest where this scene ends. Pick a suggestion to set the end. The chat and archive stay untouched until you choose an archive action.</p>
        ${field('rangeHold', 'Keep the newest messages out of suggestions for unarchived chat', 4, 'number', 'min="0"')}${button('sceneBreaks', '💡 Suggest scene breaks')}</details>`);
    w.root.querySelector('[data-sa-action=memoriesAll]').after(document.createRange().createContextualFragment(button('estimateMemories', '📊 Estimate memories run')));
    w.root.querySelector('#sa-character-memories').insertAdjacentHTML('beforebegin', `<div class="sa-row">${button('characterTimeline', '🗓️ Character timeline')}${button('characterExport', '📄 Export character memories')}</div>`);
    w.panes.prompt.insertAdjacentHTML('afterbegin', card('🔍 What went into the reply?', `<p id="sa-last-prompt" class="sa-hint"></p>${button('showPromptTrace', '🔎 View last reply’s memory trail')}
        <label class="checkbox_label"><input type="checkbox" data-sa-option="sceneRecall"><span>🧵 Match Little Things and story records to the scene</span></label>
        <p class="sa-hint">Use recent cues and explicit scene markers to recall details inside the memory budget. This runs locally and uses no extra model request.</p>
        <label class="checkbox_label"><input type="checkbox" data-sa-option="preciseDelivery"><span>Send relevant complete bullets from activated character lists</span></label>
        <p class="sa-hint">Native World Info filters run first. Protected lists and explicit full-detail requests stay whole. Native vector matches can load independently of keyword matches; excerpts are chosen locally when an evidenced cue matches.</p>
        <label class="checkbox_label"><input type="checkbox" data-sa-option="groupMemoryScope"><span>🧠 Only load the speaking character’s memories in groups</span></label>
        <p class="sa-hint">When you save a group memory for a specific card, its lorebook can use that card filter in SillyTavern too.</p>
        <label class="checkbox_label"><input type="checkbox" data-sa-option="cacheLayers"><span>⚡ Cache-friendly delivery · experimental</span></label>
        <p class="sa-hint">Cache-friendly delivery puts fixed lore earlier and changing matches near the reply. It overrides delivery position for Scene Archivist entries during the scan. Compare shared prompt prefix in the memory trail.</p>
        <label class="checkbox_label"><input type="checkbox" data-sa-option="memoryTools"><span>🛠️ Let supported models look up story memories · experimental</span></label>
        <p class="sa-hint">This may add a model request. SillyTavern can show the lookup in chat so the model can use the result.</p>`));
    w.panes.settings.insertAdjacentHTML('afterbegin', card('🔧 Setup and workflow profiles', `<p id="sa-profile-scope"></p>
        <div class="sa-row">${button('setupHealth', '🔧 Check setup')}${button('profiles', '⚙️ Manage workflow profiles')}</div>
        `));
    w.root.querySelector('[data-sa-action=importLog]').after(document.createRange().createContextualFragment(button('importLore', '📥 Copy from another lorebook')));
}
