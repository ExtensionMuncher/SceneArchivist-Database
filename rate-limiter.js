// Extension-local model dispatch gate. No global fetch hooks or RP throttling.
export const DEFAULT_RPM = 10;
export const normalizeRPM = value => value === '' || value == null || !Number.isFinite(Number(value)) ? DEFAULT_RPM : Math.max(0, Math.min(600, Math.floor(Number(value))));
export class RateLimitError extends Error {
    constructor(until, cause) { super(until ? `Provider rate limit reached. Job paused; earliest retry ${new Date(until).toLocaleTimeString()} (provider availability is not guaranteed). Completed results are retained.` : 'Provider quota or billing limit reached. Job paused; check the provider account before retrying. Completed results are retained.', { cause }); this.name = 'RateLimitError'; this.until = until; }
}
export class DispatchStopped extends Error {
    constructor(cause) { super('Stopped before sending the next model request.', { cause }); this.name = 'DispatchStopped'; this.unsent = true; }
}
function errorNodes(error) {
    const out = [], seen = new Set(), pending = [error];
    while (pending.length && out.length < 20) {
        const value = pending.shift(); if (value == null || seen.has(value)) continue;
        seen.add(value); out.push(value);
        if (typeof value === 'object') pending.push(value.cause, value.error, value.response, value.data, value.body, value.details);
    }
    return out;
}
// Keep only diagnostic fields, not raw HTTP headers, request bodies, or credentials.
const errorText = e => typeof e === 'string' ? e : [e?.message, e?.code, e?.type, e?.statusText].filter(Boolean).join(' ');
const redact = value => String(value ?? '').replace(/https?:\/\/[^\s]+/gi, '[URL omitted]').replace(/(?:Bearer\s+|(?:api[_ -]?key|authorization|token|password)\s*[:=]\s*)[^\s,;]+/gi, '[credential omitted]').replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[credential omitted]').slice(0, 500);
export function errorDetails(error) {
    return errorNodes(error).map(e => ({ name: redact(e?.name), message: redact(typeof e === 'string' ? e : e?.message || e?.statusText), status: redact(e?.status ?? e?.statusCode), code: redact(e?.code), type: redact(e?.type) })).filter(e => Object.values(e).some(Boolean));
}
export const isQuotaLimit = error => errorNodes(error).some(e => e?.quota_error === true || /insufficient[_ -]?quota|billing[_ -]?(?:hard[_ -]?)?limit|(?:exceeded|exhausted|insufficient|out of) (?:your |the )?(?:current )?(?:quota|credits|balance)|(?:quota|credit|balance) (?:exhausted|exceeded|depleted)/i.test(errorText(e)));
export const isRateLimit = error => isQuotaLimit(error) || errorNodes(error).some(e => e instanceof RateLimitError || Number(e?.status ?? e?.statusCode ?? e?.code) === 429 || /(?:^429$|\b(?:http|status|code|error)\s*[:=]?\s*429\b|rate[_ -]?limit|too many requests|resource[_ ]exhausted|requests per minute|tokens per minute)/i.test(errorText(e)));
function retryDelay(error, now) {
    let delay = 60000;
    for (const e of errorNodes(error)) {
        const header = e?.headers?.get?.('Retry-After') ?? e?.headers?.['retry-after'] ?? e?.headers?.['Retry-After'] ?? e?.retry_after ?? e?.retryAfter;
        if (header != null) { const numeric = Number(header); const ms = Number.isFinite(numeric) ? numeric * 1000 : Date.parse(header) - now; if (Number.isFinite(ms)) delay = Math.max(delay, ms); }
        const text = typeof e === 'string' ? e : String(e?.message ?? '');
        const m = text.match(/retry(?:\s+after|\s+in|Delay["\s:]+)\s*(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s(?:ec(?:onds?)?)?|m(?:in(?:utes?)?)?)/i);
        if (m) delay = Math.max(delay, Number(m[1]) * (/^ms|^millisecond/i.test(m[2]) ? 1 : /^m/i.test(m[2]) ? 60000 : 1000));
    }
    return delay;
}
export class RequestLimiter {
    constructor({ rpm = () => DEFAULT_RPM, now = () => Date.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), report = () => {}, load = () => ({}), save = () => {} } = {}) {
        Object.assign(this, { rpm, now, sleep, report, save });
        let state = {}; try { state = load() || {}; } catch { /* session storage optional */ }
        this.lastStart = Number.isFinite(state.lastStart) ? Math.min(state.lastStart, now()) : -Infinity;
        this.cooldownUntil = Number.isFinite(state.cooldownUntil) ? state.cooldownUntil : 0;
        this.tail = Promise.resolve();
    }
    emit(state) { try { this.report(state); } catch { /* diagnostics must not affect generation */ } }
    persist() { try { this.save({ lastStart: this.lastStart, cooldownUntil: this.cooldownUntil }); } catch { /* storage optional */ } }
    run(send, check = () => {}) {
        const guarded = () => { try { check(); } catch (e) { throw new DispatchStopped(e); } };
        const execute = async () => {
            try {
                for (;;) {
                    guarded();
                    const rpm = normalizeRPM(this.rpm()), now = this.now();
                    const wait = Math.max(0, this.cooldownUntil - now, rpm ? this.lastStart + Math.ceil(60000 / rpm) - now : 0);
                    if (!wait) break;
                    this.emit({ state: 'waiting', seconds: Math.ceil(wait / 1000), cooldown: this.cooldownUntil > now, rpm });
                    await this.sleep(Math.min(wait, 250));
                }
                guarded();
                this.lastStart = this.now(); this.persist(); this.emit({ state: 'sending' });
                try { return await send(); }
                catch (e) {
                    if (!isRateLimit(e)) throw e;
                    if (isQuotaLimit(e)) throw new RateLimitError(null, e);
                    this.cooldownUntil = Math.max(this.cooldownUntil, this.now() + retryDelay(e, this.now())); this.persist();
                    throw new RateLimitError(this.cooldownUntil, e);
                }
            } finally { this.emit({ state: 'idle', cooldownUntil: this.cooldownUntil }); }
        };
        const result = this.tail.then(execute); this.tail = result.catch(() => {}); return result;
    }
}
