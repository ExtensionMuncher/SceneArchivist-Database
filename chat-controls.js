import { anchorMessage, isSkipped, rangeControl, resolveEndpoints, setEndpoint, toggleSkipped } from './chat-workflows.js';
import { flashbackPicker } from './flashback-picker.js';

const actionButton = (label, action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
};

export class ChatControls {
    constructor(workbench) {
        this.w = workbench;
        this.root = workbench.root;
        for (const [field, endpoint] of [['rangeFrom', 'from'], ['rangeTo', 'to']]) {
            this.root.querySelector(`[data-sa-field="${field}"]`)?.addEventListener('change', event => {
                const input = event.target, index = Number(input.value);
                if (input.value === '') void this.clear(endpoint).catch(error => this.w.h.notify(error.message, 'error'));
                else if (Number.isInteger(index) && this.chat()[index]) void this.pick(endpoint, index, false).catch(error => this.w.h.notify(error.message, 'error'));
            });
        }
        document.addEventListener('pointerdown', event => {
            if (!this.menu?.contains(event.target) && !this.trigger?.contains(event.target)) this.close();
        });
        document.addEventListener('keydown', event => {
            if (this.menu && event.key === 'Escape') { event.preventDefault(); this.close(true); }
        });
        window.addEventListener('resize', () => this.close());
        document.querySelector('#chat')?.addEventListener('scroll', () => this.close(), { passive: true });
        this.mountSceneControls();
    }

    chat() { return this.w.h.context().chat || []; }
    state() { return this.w.h.meta().rangeControl; }
    endpoints() { return resolveEndpoints(this.state(), this.chat()); }

    async save() {
        this.syncRange();
        this.mount();
        this.w.extras?.render();
        await this.w.persist();
    }

    async clear(endpoint) {
        const state = this.state();
        if (state) {
            if (endpoint) delete state.endpoints[endpoint];
            else state.endpoints = {};
        }
        for (const [key, field] of [['from', 'rangeFrom'], ['to', 'rangeTo']]) {
            if (!endpoint || endpoint === key) this.root.querySelector(`[data-sa-field="${field}"]`).value = '';
        }
        await this.save();
    }

    async pick(endpoint, index, announce = true) {
        if (!this.chat()[index]) throw new Error('That message is no longer in this chat.');
        setEndpoint(rangeControl(this.w.h.meta()), this.chat(), endpoint, index);
        await this.save();
        if (announce) this.w.h.notify(`${endpoint === 'from' ? 'Start' : 'End'} set to #${index}. Open Archive → Pick your messages to use the range.`);
    }

    syncRange() {
        const bounds = this.endpoints();
        for (const [end, field] of [['from', 'rangeFrom'], ['to', 'rangeTo']]) {
            const input = this.root.querySelector(`[data-sa-field="${field}"]`);
            if (input && (bounds[end].index !== null || bounds[end].missing)) input.value = bounds[end].index ?? '';
        }
        const note = this.root.querySelector('#sa-range-anchor-note');
        if (note) {
            const missing = Object.values(bounds).some(bound => bound.missing);
            const text = missing ? '⚠️ A selected message was removed. Pick that endpoint again.' :
                Object.values(bounds).some(bound => bound.index !== null) ? '📌 Your picks follow the messages when their numbers change.' : '';
            note.textContent = text;
            note.hidden = !text;
        }
    }

    close(focus = false) {
        this.menu?.remove();
        this.menu = null;
        this.trigger?.setAttribute('aria-expanded', 'false');
        if (focus) this.trigger?.focus();
        this.trigger = null;
    }

    open(trigger, messageNode, selected) {
        if (this.w.h.settings().showMessageActions !== true || !trigger.isConnected) return;
        if (this.trigger === trigger) { this.close(true); return; }
        this.close();
        const index = Number(messageNode.getAttribute('mesid')), message = this.chat()[index];
        if (!message) return;
        const menu = document.createElement('div');
        menu.className = 'sa-message-menu';
        menu.id = 'sa-message-menu';
        menu.setAttribute('role', 'group');
        menu.setAttribute('aria-label', `Scene Archivist actions for message ${index}`);
        const database = !!this.w.h.settings().databaseOnly;
        const actions = [
            ['Start range here', () => this.pick('from', index)],
            ['End range here', () => this.pick('to', index)],
            [database ? 'Save evidence detail' : 'Remember this', () => this.w.extras.remember(index, selected)],
            [isSkipped(this.state(), message) ? (database ? 'Include in scan again' : 'Include in archive again') : (database ? 'Skip when scanning' : 'Skip when archiving'), async () => {
                toggleSkipped(rangeControl(this.w.h.meta()), message);
                await this.save();
                this.w.renderFlow();
            }],
        ];
        if (!database && !message.is_user) actions.push(['What went into this reply?', () => this.w.extras.prompt.show(index, true)]);
        const heading = document.createElement('small');
        heading.textContent = `Scene Archivist · #${index}`;
        menu.append(heading);
        for (const [label, run] of actions) menu.append(actionButton(label, () => {
            this.close(true);
            Promise.resolve().then(run).catch(error => this.w.h.notify(error.message, 'error'));
        }));
        document.body.append(menu);
        const rect = trigger.getBoundingClientRect(), width = menu.offsetWidth, height = menu.offsetHeight;
        menu.style.left = Math.max(8, Math.min(rect.right - width, innerWidth - width - 8)) + 'px';
        menu.style.top = Math.max(8, Math.min(innerHeight - height - 8, rect.bottom + height + 12 <= innerHeight ? rect.bottom + 5 : rect.top - height - 5)) + 'px';
        this.menu = menu;
        this.trigger = trigger;
        trigger.setAttribute('aria-expanded', 'true');
        menu.querySelector('button').focus();
    }

    mount(messageIndex) {
        this.renderScene();
        const showActions = this.w.h.settings().showMessageActions === true;
        if (!showActions || (this.trigger && !this.trigger.isConnected)) this.close();
        const chat = this.chat();
        const currentIndex = Number.isInteger(Number(messageIndex)) && messageIndex != null ? Number(messageIndex) : null;
        const messages = document.querySelectorAll(currentIndex == null ? '#chat .mes[mesid]' : `#chat .mes[mesid="${currentIndex}"]`);
        this.messageActions ??= new WeakMap();
        for (const node of messages) {
            const index = Number(node.getAttribute('mesid')), message = chat[index];
            const text = node.querySelector('.mes_text');
            // Never delete, hide, replace or move a shared toolbar or a container
            // that holds another extension's controls. Remove only our identifiable
            // legacy leaves, and discard an old wrapper only when genuinely empty.
            for (const old of node.querySelectorAll('.sa-message-action')) {
                if (old.getAttribute('aria-label') === 'Scene Archivist message actions' &&
                    old.getAttribute('aria-controls') === 'sa-message-menu' &&
                    old.childElementCount === 0) old.remove();
            }
            for (const strip of node.querySelectorAll('span.sa-message-badges')) {
                for (const badge of [...strip.children]) {
                    if (badge.tagName === 'SPAN' && badge.childElementCount === 0 &&
                        ['status', 'endpoint'].includes(badge.dataset.kind) &&
                        badge.title === badge.textContent && /^(?:To archive|Archived(?: · .+)?|Memories made|Range start|Range end|Archive skip)$/.test(badge.textContent)) badge.remove();
                }
                if (!strip.children.length && /^(?:\s*|To archive|Archived(?: · .+)?|Memories made|Range start|Range end|Archive skip)$/.test(strip.textContent)) strip.remove();
            }
            for (const footer of node.querySelectorAll('div.sa-message-footer')) {
                if (!footer.children.length && !footer.textContent.trim()) footer.remove();
            }
            const host = text?.parentElement;
            let trigger = this.messageActions.get(node);
            // Clones made by host rerenders do not retain event handlers. Only the
            // current instance's own button is reusable; foreign children stay put.
            for (const candidate of node.querySelectorAll('button[data-scene-archivist-control="message-action"]')) {
                if ((!showActions || !host || !message || candidate !== trigger || candidate.parentElement !== host) && candidate.childElementCount === 0) candidate.remove();
            }
            if (!showActions || !host || !message) {
                this.messageActions.delete(node);
                continue;
            }
            if (trigger?.isConnected && trigger.parentElement === host) continue;
            trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.dataset.sceneArchivistControl = 'message-action';
            trigger.textContent = 'Archivist';
            trigger.title = this.w.h.settings().databaseOnly ? 'Scene Archivist · range and evidence' : 'Scene Archivist · range and memory';
            trigger.setAttribute('aria-label', 'Scene Archivist message actions');
            trigger.setAttribute('aria-controls', 'sa-message-menu');
            trigger.setAttribute('aria-expanded', 'false');
            let selected = '';
            trigger.addEventListener('pointerdown', () => {
                const selection = window.getSelection();
                selected = node.querySelector('.mes_text')?.contains(selection?.anchorNode) ? selection.toString().trim() : '';
            });
            trigger.addEventListener('click', event => {
                event.stopPropagation();
                this.open(trigger, node, selected);
                selected = '';
            });
            // Append after existing content; do not insert between host/extension
            // siblings or place our button in .mes_buttons / .extraMesButtons.
            host.append(trigger);
            this.messageActions.set(node, trigger);
        }
    }

    anchor(index) { return anchorMessage(this.chat()[index]); }

    mountSceneControls() {
        // Refresh before the native wand opens, including if ST rebuilt its menu.
        document.addEventListener('click', event => {
            if (event.target.closest?.('#extensionsMenuButton')) this.renderScene();
        }, true);
        this.renderScene();
    }

    renderScene() {
        // Remove legacy composer controls even on an in-session upgrade.
        document.querySelectorAll('#send_form .sa-flashback-start, #send_form .sa-composer-scene').forEach(node => node.remove());
        const menu = document.getElementById('extensionsMenu');
        if (!menu) return;
        let row = this.sceneControls;
        if (!row || row.parentElement !== menu) {
            row?.remove();
            menu.querySelector('#sa_wand_scene_date')?.remove();
            row = document.createElement('div');
            row.id = 'sa_wand_scene_date';
            row.className = 'list-group-item flex-container flexGap5';
            row.tabIndex = 0;
            row.setAttribute('role', 'button');
            row.setAttribute('aria-haspopup', 'dialog');
            row.innerHTML = '<div class="fa-solid fa-clock-rotate-left extensionsMenuExtensionButton" aria-hidden="true"></div><span></span>';
            row.addEventListener('click', () => {
                if (!row.hidden) void this.chooseFlashback().catch(error => this.w.h.notify(error.message, 'warning'));
            });
            row.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); row.click(); }
            });
            const launcher = menu.querySelector('#sa_wand_panel');
            if (launcher) launcher.after(row);
            else menu.append(row);
            this.sceneControls = row;
        }
        const w = this.w;
        const available = w.options().sceneRecall && w.h.isActive() && !!w.h.context().chatId;
        const date = available ? w.sceneRecall.frame().flashback : '';
        row.hidden = !available;
        const label = date ? 'Scene date · ' + new Date(date + 'T00:00:00Z').toLocaleDateString(undefined, {
            timeZone: 'UTC', calendar: 'gregory', year: 'numeric', month: 'short', day: 'numeric',
        }) : 'Set scene date';
        const text = row.querySelector('span');
        if (text.textContent !== label) text.textContent = label;
        row.setAttribute('aria-label', date ? `${label}. Change or clear scene date` : label);
        row.title = date ? 'Change or clear the active story date' : 'Set a story date for archive retrieval';
    }

    async chooseFlashback() {
        const w = this.w, chat = this.chat(), origin = w.identity();
        const frame = w.sceneRecall.frame();
        if (w.h.isBusy() || w.h.isGenerating?.()) throw new Error('Finish the current reply or archive action before changing the scene date.');
        if (!w.options().sceneRecall || !w.h.isActive() || !w.h.context().chatId) return;
        const picker = flashbackPicker(frame.flashback ? 'Change scene date' : 'Set scene date', frame.flashback || frame.date, { allowClear: !!frame.flashback });
        if (await w.h.confirm(picker.root, {
            okButton: frame.flashback ? 'Apply' : 'Set scene date', wide: false, large: false, canConfirm: picker.validate,
            onOpen: popup => popup.dlg.setAttribute('aria-labelledby', 'sa-flashback-title'),
        })) {
            if (origin !== w.identity() || chat !== this.chat()) return;
            await this.changeFlashback(picker.date());
        }
    }

    async changeFlashback(date) {
        const w = this.w;
        if (w.h.isBusy() || w.h.isGenerating?.()) throw new Error('Finish the current reply or archive action before changing the scene date.');
        if (!w.options().sceneRecall || !w.h.isActive()) throw new Error('Enable Scene Recall and attach this story’s archive first.');
        w.sceneRecall.setFlashback(date);
        this.renderScene();
        await w.persist();
        document.getElementById('extensionsMenuButton')?.focus();
    }
}
