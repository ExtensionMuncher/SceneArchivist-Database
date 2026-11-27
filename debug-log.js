const MAX = 240;
const rows = [];
let enabled = false;

const clean = value => {
    if (value == null) return value;
    if (value instanceof Error) return { name: value.name, message: value.message, stack: String(value.stack || '').split('\n').slice(0, 8).join('\n') };
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    try { return JSON.parse(JSON.stringify(value)); }
    catch { return String(value); }
};

export function configure(value) { enabled = !!value; }
export function isEnabled() { return enabled; }
export function clear() { rows.length = 0; }
export function entries() { return rows.map(row => ({ ...row, detail: clean(row.detail) })); }
export function text() { return entries().map(row => `${row.at} [${row.level.toUpperCase()}] ${row.code} — ${row.message}${row.detail == null ? '' : `\n${JSON.stringify(row.detail, null, 2)}`}`).join('\n\n'); }

export function log(level, code, message, detail = null) {
    const row = { at: new Date().toISOString(), level, code: String(code || 'EVENT'), message: String(message || ''), detail: clean(detail) };
    rows.push(row);
    if (rows.length > MAX) rows.splice(0, rows.length - MAX);
    if (!enabled) return row;
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'debug' ? 'debug' : 'info';
    console[method](`[Scene Archivist][${row.code}] ${row.message}`, row.detail ?? '');
    return row;
}

export const debug = (code, message, detail) => log('debug', code, message, detail);
export const info = (code, message, detail) => log('info', code, message, detail);
export const warn = (code, message, detail) => log('warn', code, message, detail);
export const error = (code, message, detail) => log('error', code, message, detail);
