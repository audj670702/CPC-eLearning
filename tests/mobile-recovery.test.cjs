const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/../cpc-tv.js','utf8');
const block=source.slice(source.indexOf('let digitalRetryTimer'),source.indexOf('function youtubeEmbedUrl'));
function setup(ua='Mozilla/5.0 (iPhone) Safari/605.1.15'){
 let now=0,id=0;const timers=new Map(),intervals=new Map(),button={hidden:true};
 const video={currentTime:0,currentSrc:'signal',error:null,paused:true,controls:false,playCalls:0,loads:0,play(){this.playCalls++;return this.reject?Promise.reject(this.reject):Promise.resolve()},pause(){},removeAttribute(){},setAttribute(){},load(){this.loads++},canPlayType(){return 'maybe'}};
 const center={innerHTML:'',hidden:false};let hlsCount=0;const states=[];
 class Hls{static isSupported(){return true}static Events={MANIFEST_PARSED:'manifest',ERROR:'error'};static ErrorTypes={MEDIA_ERROR:'media'};constructor(){hlsCount++}attachMedia(){}loadSource(){}on(){}destroy(){}recoverMediaError(){}}
 const context={Date:{now:()=>now},navigator:{userAgent:ua,maxTouchPoints:0},document:{visibilityState:'visible'},window:{Hls},Hls,currentChannel:()=>({tipo:'VPS',senal:'https://example.com/live.m3u8'}),setStreamState:(state,message)=>states.push({state,message}),communityVideoKey:'',hls:null,tvMuted:true,$:s=>s==='#tvVideo'?video:s==='#tvResume'?button:center,setTimeout:f=>{timers.set(++id,f);return id},clearTimeout:i=>timers.delete(i),setInterval:f=>{intervals.set(++id,f);return id},clearInterval:i=>intervals.delete(i)};
 vm.createContext(context);vm.runInContext(block,context);
 return {context,video,button,timers,intervals,states,hlsCount:()=>hlsCount,tick:ms=>{now+=ms;for(const f of intervals.values())f()},fire:()=>{const [i,f]=timers.entries().next().value;timers.delete(i);f()}};
}
test('iPhone autoplay denial waits for a tap without rebuilding the stream',async()=>{
 const x=setup();x.video.reject={name:'NotAllowedError'};x.context.playUrl('https://example.com/live.m3u8');await Promise.resolve();
 assert.equal(x.button.textContent,'▶ Reproducir');assert.equal(x.video.controls,true);x.tick(120000);assert.equal(x.timers.size,0);
 x.video.reject=null;const loads=x.video.loads;x.context.resumeDigital();assert.equal(x.video.loads,loads);assert.equal(x.video.playCalls,2);
});
test('Android prefers HLS.js even when native HLS reports support',()=>{
 const x=setup('Mozilla/5.0 Android Chrome/140');x.context.playUrl('https://example.com/live.m3u8');assert.equal(x.hlsCount(),1);
});
test('slow initial load is allowed and playing cancels a pending restart',()=>{
 const x=setup();x.context.playUrl('https://example.com/live.m3u8');x.tick(30000);assert.equal(x.timers.size,0);x.tick(35000);assert.equal(x.timers.size,1);
 x.video.onplaying();assert.equal(x.timers.size,0);assert.equal(x.button.hidden,true);
});
test('repeated native errors stop after three automatic reloads',()=>{
 const x=setup();x.context.playUrl('https://example.com/live.m3u8');
 for(let n=0;n<3;n++){x.video.onerror();assert.equal(x.timers.size,1);x.fire()}
 x.video.onerror();assert.equal(x.timers.size,0);assert.equal(x.button.textContent,'↻ Reintentar señal');
});
test('destroy cancels retries and an interrupted play promise is ignored',async()=>{
 const x=setup();x.video.reject={name:'AbortError'};x.context.playUrl('https://example.com/live.m3u8');await Promise.resolve();assert.equal(x.button.hidden,true);
 x.video.onerror();x.context.destroyHls();assert.equal(x.timers.size,0);assert.equal(x.intervals.size,0);
});

test('loading, buffering, playback and exhausted recovery have distinct states',()=>{
 const x=setup();x.context.playUrl('https://example.com/live.m3u8');
 assert.equal(x.states.at(-1).state,'loading');
 x.video.onwaiting();assert.equal(x.states.at(-1).state,'loading');
 x.video.onplaying();assert.equal(x.states.at(-1).state,'playing');
 x.video.onwaiting();assert.equal(x.states.at(-1).state,'reconnecting');
 for(let n=0;n<3;n++){x.video.onerror();x.fire()}
 x.video.onerror();assert.equal(x.states.at(-1).state,'error');
});
test('indicator hides on playback and reports busy only for active loading',()=>{
 const label={textContent:''},indicator={dataset:{},hidden:true},monitor={setAttribute:(key,value)=>monitor[key]=value};
 const context={$:selector=>selector==='#tvLoadIndicator'?indicator:selector==='#tvLoadText'?label:monitor};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('function setStreamState'),source.indexOf('let digitalRetryTimer')),context);
 context.setStreamState('loading','Cargando señal…');
 assert.equal(indicator.hidden,false);assert.equal(monitor['aria-busy'],'true');
 context.setStreamState('action','Pulsa Reproducir');
 assert.equal(monitor['aria-busy'],'false');
 context.setStreamState('playing');
 assert.equal(indicator.hidden,true);assert.equal(label.textContent,'');
});

test('an old CPC session response cannot update the next session',async()=>{
 let finish;const updates=[];
 const ctx={cpcLoading:false,contextGeneration:1,selected:'cpc',communityVideoKey:'',loadContext:()=>new Promise(resolve=>finish=resolve),$:()=>({dataset:{channel:'cpc'}}),setTvContext:x=>updates.push(x),setStreamState:()=>{},console};
 vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('async function refreshCpc'),source.indexOf('function startCpcPolling')),ctx);
 const pending=ctx.refreshCpc();
 ctx.contextGeneration=2;ctx.cpcLoading=false;
 finish({tv:{youtubeId:'old-session'}});
 await pending;
 assert.equal(updates.length,0);
});
