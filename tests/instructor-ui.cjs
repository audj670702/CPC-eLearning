const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div class="identity-copy"></div><section class="modules-section"></section>',{url:'https://cpc.scad.mx/'});
let saved=0,closed=false;const rows=[{key:'P:a',userId:'a',role:'PARTICIPANTE',name:'Participante uno',code:'2088',client:'Empresa',status:''},{key:'P:b',userId:'b',role:'PARTICIPANTE',name:'Participante dos',code:'2089',client:'Empresa',status:''},{key:'I:i',userId:'i',role:'INSTRUCTOR',name:'Instructor',code:'INSTRUCTOR',client:'',status:''}];
const loaded=()=>({classId:'class1',courseCode:'C-1234',courseName:'Programa',number:1,open:true,startAt:new Date(Date.now()-60000).toISOString(),endAt:new Date(Date.now()+3600000).toISOString(),rows:structuredClone(rows),evidence:[],batch:[],attendanceLocked:closed,evidenceLocked:false,maxBytes:10485760});
const ctx={console,document:dom.window.document,window:dom.window,localStorage:dom.window.localStorage,URL:dom.window.URL,crypto:require('crypto').webcrypto,setInterval:()=>0,Date,Intl,Map,Set,indexedDB:{}};vm.createContext(ctx);
const source=fs.readFileSync(path.join(__dirname,'../cpc-instructor.js'),'utf8').replace(/export /g,'');vm.runInContext(source,ctx);vm.runInContext('fileDraft=async()=>[]',ctx);
ctx.member={id:'member1'};ctx.apiMock=async(action,input)=>{if(action==='LIST')return {isInstructor:true,classes:[{id:'class1',number:1,courseCode:'C-1234',courseName:'Programa',attendanceState:'PENDIENTE',evidenceState:'PENDIENTE'}]};if(action==='LOAD')return loaded();if(action==='ATTENDANCE_SAVE'){saved++;assert.equal(input.rows.length,3);assert(input.rows.filter(r=>r.key.startsWith('P:')).every(r=>r.status==='PRESENTE'));closed=true;return {...loaded(),rows:input.rows.map(r=>({...rows.find(x=>x.key===r.key),...r})),attendanceSaved:true};}throw Error(action);};
(async()=>{
 await vm.runInContext('initInstructor(member,apiMock)',ctx);assert(dom.window.document.querySelector('.cpi-module'));assert.equal(dom.window.document.querySelector('.cpi-profile').textContent,'INSTRUCTOR');
 await vm.runInContext("openInstructorClass('class1')",ctx);
 assert.equal(dom.window.document.querySelectorAll('.cpi-table tbody tr').length,2);assert(!dom.window.document.body.textContent.includes('Exportar'));
 const toggle=dom.window.document.getElementById('cpiIncludeInstructors');toggle.checked=true;toggle.onchange({target:toggle});assert.equal(dom.window.document.querySelectorAll('.cpi-table tbody tr').length,3);
 for(const key of ['P:a','P:b']){const el=dom.window.document.querySelector(`[data-cpi-key="${key}"][data-status="PRESENTE"]`);el.checked=true;el.onchange();}
 await vm.runInContext('saveAttendance()',ctx);assert.equal(saved,1);assert(dom.window.document.getElementById('cpiSave').disabled);assert([...dom.window.document.querySelectorAll('[data-cpi-key]')].every(el=>el.disabled));await vm.runInContext('saveAttendance()',ctx);assert.equal(saved,1);
 await vm.runInContext('initInstructor(null,null)',ctx);assert(!dom.window.document.querySelector('.cpi-module'));assert(dom.window.document.getElementById('cpiModal').hidden);
 console.log('PASS UI: perfil, módulo, participantes/instructores opcionales, casillas, guardado cerrado, sin exportación y cierre de sesión. DOM simulado; no valida geometría.');
})().catch(e=>{console.error(e);process.exitCode=1});
