// Extraction is output-bound, not just context-bound. Keep source identities and
// hashes intact even if a large unit has to be read in several pieces.
import * as M from './memory-engine.js';
export function extractionBudget(capacity) {
    return Math.max(0, Math.min(2400, Math.floor(capacity.output * 0.40), capacity.input - 900));
}
export function extractionParts(entries, payload = {}) {
    const byId = new Map(entries.map(e => [M.record(e).id, e]));
    const parts = payload.parts || entries.map(e => ({ id: M.record(e).id, start: 0, end: e.content.length }));
    return parts.map(p => {
        const e = byId.get(p.id);
        if (!e || !Number.isInteger(p.start) || !Number.isInteger(p.end) || p.start < 0 || p.end > e.content.length || p.end <= p.start) throw new Error('A queued extraction fragment is invalid. Keep the source intact and review this job.');
        return { ...p, text: e.content.slice(p.start, p.end) };
    });
}
function splitPart(p, limit) {
    if (M.tokens(p.text) <= limit) return [p];
    const middle = Math.floor(p.text.length / 2);
    let cut = p.text.lastIndexOf('\n', middle);
    if (cut < middle / 2) cut = p.text.indexOf('\n', middle);
    if (cut < middle / 2 || cut > middle * 1.5) cut = middle;
    if (cut > 0 && /[\uD800-\uDBFF]/.test(p.text[cut - 1])) cut++;
    if (cut <= 0 || cut >= p.text.length) throw new Error('This extraction budget is too small. Increase the helper model context or response allowance.');
    return [...splitPart({ ...p, end: p.start + cut, text: p.text.slice(0, cut) }, limit), ...splitPart({ ...p, start: p.start + cut, text: p.text.slice(cut) }, limit)];
}
export function planExtraction(entries, payload, limit, maxSources = 3) {
    if (limit < 200) throw new Error('The helper connection has too little room for structured extraction. Increase its context or response allowance.');
    const parts = extractionParts(entries, payload).flatMap(p => splitPart(p, limit));
    const batches = []; let batch = [], used = 0;
    for (const p of parts) {
        const cost = M.tokens(p.text) + 40;
        if (batch.length && (batch.length >= maxSources || used + cost > limit || batch.some(b => b.id === p.id))) { batches.push(batch); batch = []; used = 0; }
        batch.push(p); used += cost;
    }
    if (batch.length) batches.push(batch);
    return batches.map(group => {
        const ids = M.unique(group.map(p => p.id));
        return { ...payload, kind: 'extract', ids, hashes: Object.fromEntries(entries.filter(e => ids.includes(M.record(e).id)).map(e => [M.record(e).id, M.hash(e.content)])), parts: group.map(({ text, ...p }) => p) };
    });
}
export function extractionInputs(entries, payload) {
    const byId = new Map(entries.map(e => [M.record(e).id, e]));
    return extractionParts(entries, payload).map(p => ({ ...byId.get(p.id), content: p.text }));
}
