const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function setup({standalone=false,ios=false}={}){
 const events={},mediaEvents={},button={style:{},dataset:{},setAttribute(){}};
 const media={matches:standalone,addEventListener:(n,f)=>mediaEvents[n]=f};
 const window={navigator:{standalone:ios},matchMedia:()=>media,addEventListener:(n,f)=>events[n]=f,dispatchEvent:e=>events[e.type]?.(e)};
 const ctx={window,navigator:{},document:{querySelector:()=>button,addEventListener(){}},CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts.detail}},console};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../cpc-install.js','utf8'),ctx);
 return {ctx,window,button,events,mediaEvents,media};
}
test('ordinary browser is Ap0 and retains install action',()=>{const x=setup();assert.equal(x.window.cpcIsAppInstalled(),false);assert.equal(x.button.hidden,false)});
test('standalone and iOS installed modes hide redundant install text',()=>{for(const opts of [{standalone:true},{ios:true}]){const x=setup(opts);assert.equal(x.window.cpcIsAppInstalled(),true);assert.equal(x.button.hidden,true);assert.equal(x.button.style.display,'none')}});
test('appinstalled updates the current browser immediately',()=>{const x=setup();x.events.appinstalled();assert.equal(x.window.cpcIsAppInstalled(),true);assert.equal(x.button.hidden,true)});
test('standalone mode changes refresh button state',()=>{const x=setup();x.media.matches=true;x.mediaEvents.change();assert.equal(x.button.hidden,true);x.media.matches=false;x.mediaEvents.change();assert.equal(x.button.hidden,false)});
test('diagnostic preserves authentication code and adds Ap0 or Ap1',()=>{
 const source=fs.readFileSync(__dirname+'/../cpc-context-diagnostic.js','utf8');const cca={textContent:''};let installed=false;
 const ctx={state:{se:1,us:1,eo:1,mns:0},document:{getElementById:id=>id==='cpcCca'?cca:null},window:{cpcIsAppInstalled:()=>installed}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function paint'),source.indexOf('function pick')),ctx);
 ctx.paint();assert.equal(cca.textContent,'Se1 · Us1 · EO1 · MNS0 · Ap0');installed=true;ctx.paint();assert.equal(cca.textContent,'Se1 · Us1 · EO1 · MNS0 · Ap1');
});
