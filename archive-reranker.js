/** Optional cross-encoder service, independent of embeddings and generation. */
import * as M from './memory-engine.js';
import * as Debug from './debug-log.js';

export const RERANK_DEFAULTS = Object.freeze({
    archiveRerankEnabled: false, archiveRerankProvider: 'compatible',
    archiveRerankUrl: 'http://127.0.0.1:7997/rerank', archiveRerankModel: '',
    archiveRerankTransport: 'direct', archiveRerankCandidates: 24,
    archiveRerankResults: 10, archiveRerankChars: 1600, archiveRerankTimeout: 20,
});
const integer = (value, fallback, min, max) => Number.isFinite(Number(value)) && Number(value)>0 ? Math.max(min,Math.min(max,Math.floor(Number(value)))) : fallback;
export function rerankLimits(options={}) {
    const candidates=integer(options.archiveRerankCandidates,24,2,40);
    return {candidates, results:Math.min(candidates,integer(options.archiveRerankResults,10,1,20)), chars:integer(options.archiveRerankChars,1600,400,4000), timeout:integer(options.archiveRerankTimeout,20,3,60)};
}
// Secrets live only in the current JS session, never ST settings, exports, logs, or requests to other URLs.
const credentials=new WeakMap();
export function setRerankKey(w,value){
    if(!String(value||'').trim()){credentials.delete(w);return;}
    const config=rerankConfig(w);
    credentials.set(w,{url:config.url,provider:config.provider,transport:config.transport,key:String(value).trim()});
}
export function clearRerankKey(w){credentials.delete(w);}
export function rerankConfig(w){
    const o=w.options(),provider=o.archiveRerankProvider||'compatible',transport=o.archiveRerankTransport||'direct';
    if(!['compatible','tei','ollama'].includes(provider)||!['direct','server'].includes(transport))throw new Error('Select a supported reranker API format and connection route.');
    let url;try{url=new URL(String(o.archiveRerankUrl||'').trim());}catch{throw new Error('Enter the full reranker endpoint URL.');}
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||url.search)throw new Error('Use an HTTP(S) reranker endpoint without credentials, query parameters, or fragments.');
    const model=String(o.archiveRerankModel||'').trim();
    if(provider!=='tei'&&!model)throw new Error('Enter the reranker model ID.');
    if(provider==='ollama'){
        if(/(?:^|[-:])cloud(?:$|:)/i.test(model)||url.hostname==='ollama.com'||url.hostname.endsWith('.ollama.com'))throw new Error('Use a locally installed Qwen3 rank model, not an Ollama cloud model.');
        // Accept a base URL or a previously entered API URL. Never POST to the root.
        url.pathname=url.pathname.replace(/\/(?:api\/(?:embed|embeddings|show)|v1\/rerank|rerank)\/?$/,'').replace(/\/+$/,'')+'/';
    }else if(url.pathname==='/'||!url.pathname){
        throw new Error('This is a server base URL, not a rerank endpoint. For local Ollama choose Ollama (Qwen3 rank scores). For a dedicated rerank server enter its full endpoint.');
    }
    return {provider,transport,url:url.href,model,...rerankLimits(o)};
}
// Reranking only receives the already scoped candidate content. Do not send parent
// record history, raw chat, full memory lists, source receipts, or hidden metadata.
export function rerankDocument(row,query,limit){
    const r=M.record(row.entry), text=String(row.rerankText||row.entry.content||'');
    const prefix=[r.type,r.subject].filter(Boolean).join(' · ').slice(0,180);
    const room=Math.max(1,limit-prefix.length-1);
    let best=text.slice(0,room);
    if(text.length>room){
        const terms=M.queryTerms(query),stride=Math.max(1,Math.floor(room/2));let highest=-1;
        for(let i=0;i<text.length;i+=stride){
            const part=text.slice(i,i+room),words=new Set(M.queryTerms(part));
            const score=terms.reduce((n,t)=>n+(words.has(t)?1:0),0);
            if(score>highest){best=part;highest=score;}
            if(i+room>=text.length)break;
        }
    }
    return (prefix?prefix+'\n':'')+best;
}
export function parseRerankScores(payload,count){
    const rows=Array.isArray(payload)?payload:payload?.results;
    if(!Array.isArray(rows)||rows.length!==count)throw new Error('Reranker returned an incomplete result set.');
    const seen=new Set();
    const scores=rows.map(row=>{
        const index=row?.index,score=row?.relevance_score??row?.score;
        if(!Number.isInteger(index)||index<0||index>=count||seen.has(index)||typeof score!=='number'||!Number.isFinite(score))throw new Error('Reranker returned invalid candidate indices or scores.');
        seen.add(index);return {index,score};
    });
    return scores.sort((a,b)=>b.score-a.score||a.index-b.index);
}
// Qwen3 rank-pooled GGUFs expose a two-class head (yes, no). Ollama
// /api/embed normalizes the vector; the ratio is invariant to positive L2 scaling.
// Never treat a normal embedding, scalar sign, logits or arbitrary vector as a score.
export function parseOllamaRankScores(payload,count,yesIndex=0){
    const rows=payload?.embeddings;
    if(!Array.isArray(rows)||rows.length!==count)throw new Error('Ollama returned an incomplete rank-score batch.');
    return rows.map((pair,index)=>{
        if(!Array.isArray(pair)||pair.length!==2||pair.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0)||pair[0]+pair[1]<=0)
            throw new Error('Ollama did not expose the Qwen3 two-class rank head. This runtime/model combination cannot be used as a native reranker; use a rank-capable server (e.g. llama.cpp).');
        return {index,score:pair[yesIndex]/(pair[0]+pair[1])};
    }).sort((a,b)=>b.score-a.score||a.index-b.index);
}
const ollamaVerified=new WeakMap();
const probeQuery='Which fruit is red and commonly used in apple pie?';
const probeDocs=['A train arrives at noon.','Apples are red fruits commonly baked into pies.','A notebook has blue covers.'];
function rankPrompt(query,document){
    // Use Qwen's trained classification frame; escape literal control tokens in untrusted story data.
    const clean=s=>String(s).replace(/<\|[^<>]*\|>/g,' ').replace(/<\/?think>/gi,' ');
    return '<|im_start|>system\nJudge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "yes" or "no".<|im_end|>\n<|im_start|>user\n<Instruct>: Retrieve relevant narrative evidence that answers the query.\n<Query>: '+clean(query)+'\n<Document>: '+clean(document)+'<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n';
}
async function postRerank(w,config,url,body,fetcher,signal){
    const c=credentials.get(w),key=c?.url===config.url&&c.provider===config.provider&&c.transport===config.transport?c.key:'';
    const headers=config.transport==='server'?{...w.h.requestHeaders()}:{'Content-Type':'application/json'};
    if(key)headers.Authorization='Bearer '+key;
    const endpoint=config.transport==='server'?'/proxy/'+encodeURIComponent(url):url;
    let response;
    try{response=await fetcher(endpoint,{method:'POST',headers,body:JSON.stringify(body),signal,redirect:'error',credentials:config.transport==='server'?'same-origin':'omit',cache:'no-store'});}
    catch(error){throw new Error(signal.aborted||error?.name==='TimeoutError'||error?.name==='AbortError'?'Reranker timed out.':'Cannot reach the reranker. Check the endpoint, network and CORS configuration.');}
    if(!response.ok){
        const hint=config.provider==='ollama'?` Ollama ${new URL(url).pathname} failed. Confirm the local model is installed and your runtime supports its rank head.`:response.status===405?' Check the full rerank endpoint and API format (Ollama requires its own mode).':'';
        throw new Error(`Reranker HTTP ${response.status}.${hint}${config.transport==='server'?' Verify the ST server proxy is enabled and can reach the endpoint.':''}`);
    }
    let data;try{data=await response.json();}catch{throw new Error('Reranker did not return JSON.');}
    return data;
}
async function ollamaScores(w,config,query,documents,fetcher,signal,yesIndex){
    const data=await postRerank(w,config,new URL('api/embed',config.url).href,{model:config.model,input:documents.map(d=>rankPrompt(query,d)),truncate:false,options:{num_ctx:4096},keep_alive:'5m'},fetcher,signal);
    return parseOllamaRankScores(data,documents.length,yesIndex);
}
async function verifyOllama(w,config,fetcher,signal){
    const info=await postRerank(w,config,new URL('api/show',config.url).href,{model:config.model},fetcher,signal);
    const meta=info?.model_info||{}, labels=meta['qwen3.classifier.output_labels'];
    if(meta['general.architecture']!=='qwen3'||![4,'4','rank','Rank'].includes(meta['qwen3.pooling_type'])||!Array.isArray(labels)||labels.length!==2||!labels.includes('yes')||!labels.includes('no'))
        throw new Error('Ollama model is not a verified Qwen3 rank-pooled GGUF with yes/no labels. Ordinary embedding and chat models are not supported in this mode.');
    const yesIndex=labels.indexOf('yes');
    const scores=await ollamaScores(w,config,probeQuery,probeDocs,fetcher,signal,yesIndex);
    if(scores[0]?.index!==1||scores[0].score-scores[1].score<0.05)throw new Error('Ollama rank-head test failed: relevant evidence did not score distinctly above irrelevant evidence. Original search ranking will be used. Use a rank-capable server if this persists.');
    ollamaVerified.set(w,{config:JSON.stringify(config),yesIndex});
    return {scores,yesIndex};
}
export async function requestRerank(w,config,query,documents,fetcher=globalThis.fetch,current=()=>true){
    const signal=AbortSignal.timeout(config.timeout*1000);
    if(config.provider==='ollama'){
        let verified=ollamaVerified.get(w);
        if(verified?.config!==JSON.stringify(config)){
            const {yesIndex}=await verifyOllama(w,config,fetcher,signal);
            verified={yesIndex};
        }
        if(!current()||JSON.stringify(config)!==JSON.stringify(rerankConfig(w)))throw new Error('Archive scope or reranker settings changed during calibration.');
        const scores=await ollamaScores(w,config,query,documents,fetcher,signal,verified.yesIndex);
        if(scores.length>1&&scores[0].score-scores.at(-1).score<1e-7)throw new Error('Ollama returned indistinguishable relevance scores; original ranking retained.');
        return scores;
    }
    const body=config.provider==='tei'?{query,texts:documents,truncate:true}:{model:config.model,query,documents,top_n:documents.length,return_documents:false};
    return parseRerankScores(await postRerank(w,config,config.url,body,fetcher,signal),documents.length);
}
export async function rerankRows(w,rows,topic,{current=()=>true,request=requestRerank}={}){
    const o=w.options();
    if(o.archiveRerankEnabled!==true)return {rows,notice:'',used:false};
    const limits=rerankLimits(o),shortlist=rows.slice(0,limits.candidates),fallback=shortlist.slice(0,limits.results);
    if(shortlist.length<2)return {rows:fallback,notice:'',used:false};
    const fail=message=>{w.rerankProgress?.('Fallback · '+message);Debug.warn('RERANK_FALLBACK',message,{candidates:shortlist.length});return {rows:fallback,notice:'Reranker unavailable; original search ranking used.\n',used:false};};
    try{
        if(!current())return {rows:[],notice:'',used:false};
        const config=rerankConfig(w),query=String(topic||'').trim().slice(0,200);
        if(!query)return {rows:fallback,notice:'',used:false};
        const documents=shortlist.map(row=>rerankDocument(row,query,config.chars));
        w.rerankProgress?.(`Ranking ${shortlist.length} eligible candidates…`);
        const ranked=await request(w,config,query,documents,globalThis.fetch,current);
        if(!current())return {rows:[],notice:'',used:false};
        if(JSON.stringify(config)!==JSON.stringify(rerankConfig(w))||w.options().archiveRerankEnabled!==true)return fail('Settings changed during reranking.');
        const checked=parseRerankScores(ranked,shortlist.length);
        const out=checked.slice(0,limits.results).map(({index,score})=>({...shortlist[index],rerankScore:score}));
        w.rerankProgress?.(`Ranked ${shortlist.length} candidates · ${out.length} selected before tool-output limit.`);
        Debug.info('RERANK_COMPLETE','Archive evidence reranked.',{candidates:shortlist.length,selected:out.length});
        return {rows:out,notice:'',used:true};
    }catch(error){if(!current())return {rows:[],notice:'',used:false};return fail(error.message);}
}
export async function testRerankConnection(w){
    const config=rerankConfig(w);
    if(config.provider==='ollama'){ollamaVerified.delete(w);return (await verifyOllama(w,config,globalThis.fetch,AbortSignal.timeout(config.timeout*1000))).scores;}
    return requestRerank(w,config,'red apple',['A red apple is a fruit.','The train arrives at noon.','A blue notebook.']);
}
