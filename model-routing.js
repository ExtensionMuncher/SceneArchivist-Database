// Host adapters stay outside this module so routing can be tested without ST.
export function profileMessages(request) {
    const prompt = request.assembled ?? request.prompt;
    return Array.isArray(prompt) ? prompt : [
        ...(!request.assembled && request.system ? [{ role: 'system', content: request.system }] : []),
        { role: 'user', content: prompt },
    ];
}

export function completionReply(data, content) {
    const choice = data?.choices?.[0];
    const finishReason = choice?.finish_reason ?? choice?.stop_reason ?? data?.finish_reason ??
        data?.stop_reason ?? data?.stop_type ?? data?.candidates?.[0]?.finishReason;
    const reasoning = choice?.message?.reasoning_content ?? choice?.message?.reasoning ?? data?.reasoning_content ?? data?.reasoning;
    const reasoningTokens = Number(data?.usage?.completion_tokens_details?.reasoning_tokens ?? data?.usage?.output_tokens_details?.reasoning_tokens);
    const reasoningPresent = !!(typeof reasoning === 'string' && reasoning.trim() || Array.isArray(reasoning) && reasoning.length || reasoningTokens > 0);
    return { content, finishReason, ...(reasoningPresent ? {reasoningPresent:true} : {}), ...(Number.isFinite(reasoningTokens)&&reasoningTokens>=0?{reasoningTokens}:{}) };
}

export function outputLimitReached(reason) {
    return /^(?:length|max_tokens|max_output_tokens|max_length)$/i.test(reason ?? '');
}

export function createModelRouter({ current, sendProfile, describe = profile => ({ name: profile || 'Current SillyTavern model' }),
    assert = () => {}, onRoute = () => {}, clock = () => new Date().toISOString() }) {
    let latest = null;
    const snapshot = route => route ? { ...route } : null;
    const report = route => {
        // Diagnostic failures must not resend a request or discard a valid reply.
        try { onRoute(snapshot(route)); } catch { /* Routing remains authoritative. */ }
    };
    return {
        lastRoute: () => snapshot(latest),
        async request(request, profile = '') {
            const route = { profile: String(profile || ''), name: profile || 'Current SillyTavern model', at: clock(), state: 'requesting' };
            latest = route;
            try {
                assert();
                route.name = describe(route.profile)?.name || route.name;
                report(route);
                const result = route.profile
                    ? await sendProfile(route.profile, profileMessages(request), request.maxTokens, request.includeFinishReason, request)
                    : await current(request);
                assert();
                const text = typeof result === 'string' ? result : result?.content;
                const finishReason = request.includeFinishReason ? result?.finishReason : undefined;
                if ((typeof text !== 'string' || !text.trim()) && !outputLimitReached(finishReason)) throw new Error('The connection returned no visible text'+(finishReason?' (finish reason: '+String(finishReason).slice(0,60)+')':'')+(result?.reasoningPresent?'; reasoning was returned but no final answer':'')+'.');
                if (finishReason) route.finishReason = finishReason;
                route.state = 'received';
                return request.includeFinishReason ? { content: typeof text === 'string' ? text : '', finishReason, ...(result?.reasoningPresent?{reasoningPresent:true}:{}), ...(Number.isFinite(result?.reasoningTokens)?{reasoningTokens:result.reasoningTokens}:{}) } : text;
            } catch (cause) {
                route.state = 'failed';
                if (!route.profile) throw cause;
                throw new Error(`Connection profile "${route.name}" could not complete this request: ${cause?.message || cause}. Retry this profile, or explicitly choose Current SillyTavern model in Settings before retrying.`, { cause });
            } finally {
                route.ended = clock();
                report(route);
            }
        },
    };
}

/** Read an optional profile preset without invoking the host's error-logging lookup.
 * An omitted/deleted preset leaves capacity to the profile's explicit limits or
 * the caller's existing unknown-capacity fallback. Never select a live preset.
 */
export function optionalProfilePreset(context, api, name) {
    if (typeof name !== 'string' || !name.trim()) return undefined;
    const list = context.getPresetManager?.(api)?.getPresetList?.();
    const names = list?.preset_names, presets = list?.presets;
    if (!names || !presets) return undefined;
    const index = Array.isArray(names) ? names.indexOf(name)
        : Object.hasOwn(names, name) ? names[name] : -1;
    return index === -1 || index === undefined ? undefined : presets[index];
}
