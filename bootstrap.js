// Scene Archivist's ST-facing entrypoint. No static imports: even an import error
// in the application must leave a visible launcher and actionable diagnostics.
const state = { phase: 'loading', error: null, warning: null, app: null };
let observer;
function statusText() {
    return state.phase === 'ready' ? (state.warning ? `Ready — initial refresh warning: ${state.warning}` : 'Ready — open the evidence database.') : state.phase === 'failed' ? `Startup failed: ${state.error}` : 'Starting Scene Archivist…';
}
function report(error) {
    console.error('[Scene Archivist]', error);
    const text = error?.message || String(error);
    if (globalThis.toastr?.error) globalThis.toastr.error(text, 'Scene Archivist');
    else window.alert(`Scene Archivist: ${text}`);
}
async function open() {
    if (state.phase === 'failed') { report(new Error(state.error)); return; }
    if (state.phase !== 'ready') { globalThis.toastr?.info('Scene Archivist is starting.', 'Scene Archivist'); return; }
    try { await state.app.openPanelPopup(); } catch (error) { report(error); }
}
function ensureLaunchers() {
    // Keep only the invisible compatibility control for Switchboard v0.2.3.
    // It is not part of either Extensions settings column or the wand menu.
    let bridge = document.getElementById('sa_cadence_enabled');
    if (!bridge) {
        bridge = document.createElement('input');
        bridge.type = 'checkbox'; bridge.id = 'sa_cadence_enabled';
        bridge.disabled = true;
    }
    bridge.hidden = true; bridge.style.display = 'none'; bridge.tabIndex = -1;
    bridge.setAttribute('aria-hidden', 'true');
    if (bridge.parentElement !== document.body) document.body.append(bridge);
    document.getElementById('sa-launcher')?.remove();
    const menu = document.querySelector('#extensionsMenu');
    if (menu && !document.getElementById('sa_wand_panel')) {
        const row = document.createElement('div'); row.id = 'sa_wand_panel'; row.className = 'list-group-item flex-container flexGap5'; row.tabIndex = 0; row.setAttribute('role', 'button');
        row.innerHTML = '<div class="fa-solid fa-folder-tree extensionsMenuExtensionButton"></div><span>Scene Archivist</span>';
        row.addEventListener('click', open); row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void open(); } }); menu.append(row);
    }
    if (state.phase === 'ready') state.app.syncCadenceControls();
    else if (state.phase === 'failed') {
        const toggle = document.getElementById('sa_cadence_enabled');
        if (toggle) toggle.disabled = true;
        bridge.setAttribute('data-sa-cadence-status', 'Scanner unavailable — startup failed');
    }
    const launcher = document.getElementById('sa_wand_panel');
    if (launcher) launcher.title = statusText();
    if (menu) { observer?.disconnect(); observer = undefined; }
}

async function boot() {
    ensureLaunchers();
    if (!document.getElementById('sa_wand_panel')) {
        observer = new MutationObserver(ensureLaunchers); observer.observe(document.body, { childList: true, subtree: true });
        ensureLaunchers();
    }
    document.addEventListener('click', event => {
        if (event.target.closest?.('#extensionsMenuButton') && !document.getElementById('sa_wand_panel')) ensureLaunchers();
    }, true);
    try {
        state.app = await import('./index.js');
        const result = await state.app.initializeArchivist();
        state.warning = result?.refreshError || null;
        state.phase = 'ready';
    } catch (error) {
        state.phase = 'failed'; state.error = error?.stack || error?.message || String(error);
        console.error('[Scene Archivist][BOOT_FAILED]', error);
    }
    ensureLaunchers();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void boot(), { once: true });
else void boot();
