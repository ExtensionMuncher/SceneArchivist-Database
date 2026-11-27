import { escape as html } from './workflow-tools.js';

let converter, converterType, sanitizer;
const cache = new Map();
/** Read-only Markdown. No executable HTML, embeds, external images or active links. */
export function markdownPreview(value) {
    const text = String(value ?? '');
    const fallback = () => html(text).replace(/\r?\n/g, '<br>');
    const libs = globalThis.window || globalThis;
    if (!libs.showdown?.Converter || !libs.DOMPurify?.sanitize || libs.DOMPurify.isSupported === false) return fallback();
    try {
        if (converterType !== libs.showdown.Converter || sanitizer !== libs.DOMPurify.sanitize) {
            sanitizer = libs.DOMPurify.sanitize; cache.clear();
            converterType = libs.showdown.Converter;
            converter = new converterType({tables:true, strikethrough:true, simpleLineBreaks:true, literalMidWordUnderscores:true, ghCompatibleHeaderId:false, noHeaderId:true});
        }
        if(cache.has(text))return cache.get(text);
        // Parse Markdown, then enforce a strict formatting-only allowlist.
        const result = converter.makeHtml(text);
        const safe = libs.DOMPurify.sanitize(result, {ALLOWED_TAGS:['p','br','h1','h2','h3','h4','h5','h6','strong','b','em','i','del','s','blockquote','ul','ol','li','pre','code','hr','table','thead','tbody','tr','th','td'],ALLOWED_ATTR:[],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false,RETURN_TRUSTED_TYPE:false});
        if(text.length<=16000){if(cache.size>=256)cache.delete(cache.keys().next().value);cache.set(text,safe);}
        return safe;
    } catch { return fallback(); }
}
export function recordPreview(value, limit=1800) {
    const text=String(value??'').trim().replace(/^#{1,6}[^\n]*\n+/, '').trim();
    if(text.length<=limit)return markdownPreview(text);
    const boundary=text.lastIndexOf('\n',limit);
    return markdownPreview(text.slice(0,boundary>limit/2?boundary:limit)+'\n\n…');
}
