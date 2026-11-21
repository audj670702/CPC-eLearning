// cpc-mi-personal.js · v0.3.1 · "Mi personal": consulta de solo lectura para el enlace de un cliente.
// Aparece sólo si cpcPwaContext devuelve miPersonal = true.
// Mismas tres vistas que el Panel CPC: Inscripciones, Asistencia y Evaluaciones,
// con búsqueda, filtros, orden por columna y exportación a Excel y PDF.

const CPC_MI_PERSONAL_URL = 'https://www.scad.mx/_functions/cpcMiPersonal';
const MP_XLSX_SRC = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const MP_JSPDF_SRC = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
const MP_AUTOTABLE_SRC = 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js';

const MP_TABS = {
  inscripciones: {
    label: 'Inscripciones',
    cols: [['codigo', 'Código'], ['nombre', 'Nombre'], ['email', 'Email'], ['curso', 'Curso'], ['cursoCodigo', 'Código curso'], ['reportes', 'En reportes']]
  },
  asistencia: {
    label: 'Asistencia',
    cols: [['clase', 'Clase'], ['curso', 'Curso'], ['codigo', 'Código'], ['nombre', 'Nombre'], ['estatus', 'Asistencia'], ['justificada', 'Justificada']],
    estados: [['', 'Todas'], ['Asistencia', 'Asistencia'], ['Inasistencia', 'Inasistencia'], ['Sin registrar', 'Sin registrar']]
  },
  evaluaciones: {
    label: 'Evaluaciones',
    cols: [['codigo', 'Código'], ['nombre', 'Nombre'], ['curso', 'Curso'], ['tipo', 'Tipo'], ['tema', 'Tema'], ['calificacion', 'Calificación'], ['resultado', 'Resultado'], ['intentos', 'Intentos'], ['fecha', 'Fecha']],
    estados: [['', 'Todos'], ['Aprobado', 'Aprobado'], ['No aprobado', 'No aprobado']]
  }
};

const mpState = { data: null, tab: 'inscripciones', q: '', curso: '', estado: '', sort: { key: '', dir: 1 } };
let mpLibsPromise = null;
const mpTables = {};
function mpTable(){return mpTables[mpState.tab] ||= {selected:new Set(),columns:null,mode:'all',panel:false};}
function mpColumns(){return MP_TABS[mpState.tab].cols.filter(([k])=>!mpTable().columns||mpTable().columns.has(k));}
function mpCourse(c){return [c.codigo,c.nombre].filter(Boolean).join(' · ')||'—';}
function mpIcon(kind){if(kind==='xlsx'||kind==='pdf')return '<img src="assets/'+(kind==='xlsx'?'excel':'pdf')+'.svg" alt="" aria-hidden="true">';const paths={print:'M6 8V2h12v6 M6 17H3V8h18v9h-3 M6 14h12v8H6z',columns:'M3 3h18v18H3z M9 3v18 M15 3v18'};return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+paths[kind]+'"/></svg>';}

function mpEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function mpFecha(value) {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d) ? '—' : d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function mpLoadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}

function mpLoadLibs() {
  if (!mpLibsPromise) {
    mpLibsPromise = (async () => {
      if (!window.ExcelJS) await mpLoadScript(MP_XLSX_SRC);
      if (!(window.jspdf && window.jspdf.jsPDF)) await mpLoadScript(MP_JSPDF_SRC);
      if (!(window.jspdf && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable)) await mpLoadScript(MP_AUTOTABLE_SRC);
    })().catch(error => { mpLibsPromise = null; throw error; });
  }
  return mpLibsPromise;
}

function mpStyles() {
  if (document.getElementById('miPersonalStyles')) return;
  const st = document.createElement('style');
  st.id = 'miPersonalStyles';
  st.textContent = `
    .mp-modal{width:min(1120px,100%);display:flex;flex-direction:column;gap:10px;max-height:calc(100vh - 36px)}
    .mp-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .mp-head strong{font-size:1.05rem;color:#12335c}
    .mi-personal-close{border:0;background:transparent;font-size:1.5rem;line-height:1;cursor:pointer;color:#475569;padding:0 4px}
    .mp-cliente{font-size:.85rem;color:#64748b}
    .mp-tabs{display:flex;gap:6px;flex-wrap:wrap}
    .mp-tab{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:6px 12px;font-size:.85rem;cursor:pointer;color:#334155}
    .mp-tab.active{background:#24539a;border-color:#24539a;color:#fff}
    .mp-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .mp-toolbar input,.mp-toolbar select{padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;font-size:.85rem;background:#fff}
    .mp-toolbar input[type=search]{min-width:200px;flex:1}
    .mp-spacer{flex:1}
    .mp-btn{padding:6px 12px;border:1px solid #24539a;background:#24539a;color:#fff;border-radius:8px;font-size:.85rem;cursor:pointer}
    .mp-btn:disabled{opacity:.5;cursor:default}
    .mp-count{font-size:.8rem;color:#64748b}
    .mp-body{overflow:auto;border:1px solid #e2e8f0;border-radius:8px;min-height:120px;max-height:60vh}
    .mp-table{width:100%;border-collapse:collapse;font-size:.83rem}
    .mp-table th{position:sticky;top:0;background:#f1f5f9;text-align:left;padding:7px 8px;border-bottom:1px solid #cbd5e1;cursor:pointer;white-space:nowrap;color:#1e293b}
    .mp-table td{padding:6px 8px;border-bottom:1px solid #eef2f6;vertical-align:top;color:#0f172a}
    .mp-table tr:nth-child(even) td{background:#fafcff}
    .mp-empty{padding:18px;color:#64748b;font-size:.9rem}
    .mp-icon{width:34px;height:34px;padding:7px;display:inline-grid;place-items:center;background:#fff;color:#24539a}
    .mp-icon img{width:23px;height:23px;object-fit:contain}.mp-icon svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linejoin:round;stroke-linecap:round}
    .mp-table .mp-line{font-size:.68rem;color:#8993a1;width:32px;text-align:right}
    .mp-table .mp-check{width:30px;cursor:default}.mp-table input[type=checkbox]{accent-color:#24539a}
    .mp-table tr.mp-selected td{background:#edf4fc}.mp-columns{display:flex;flex-wrap:wrap;gap:8px 16px;padding:8px;border:1px solid #e2e8f0;border-radius:8px}.mp-columns[hidden]{display:none}.mp-columns label{font-size:.8rem;display:flex;align-items:center;gap:5px}
    .mp-count{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.mp-count select{font:inherit;padding:4px;border:1px solid #cbd5e1;border-radius:6px;background:white}
    .mp-head small{font-size:10px;color:#94a3b8;margin-left:8px}
    .mp-msg{padding:18px;color:#b91c1c;font-size:.9rem}
  `;
  document.head.appendChild(st);
}

function miPersonalModal() {
  let modal = document.getElementById('miPersonalModal');
  if (modal) return modal;
  mpStyles();
  modal = document.createElement('div');
  modal.id = 'miPersonalModal';
  modal.className = 'profile-backdrop';
  modal.hidden = true;
  modal.innerHTML = '<section class="profile-modal mp-modal" role="dialog" aria-modal="true" aria-labelledby="miPersonalTitle">'
    + '<header class="mp-head"><strong id="miPersonalTitle">Mi personal <small>v0.3.1</small></strong><button type="button" class="mi-personal-close" aria-label="Cerrar">×</button></header>'
    + '<div class="mp-cliente" id="miPersonalCliente"></div>'
    + '<nav class="mp-tabs" id="miPersonalTabs"></nav>'
    + '<div class="mp-toolbar">'
    + '<input type="search" id="miPersonalBuscar" placeholder="Buscar por nombre, código o curso">'
    + '<select id="miPersonalCurso" aria-label="Curso"></select>'
    + '<select id="miPersonalEstado" aria-label="Estado"></select>'
    + '<span class="mp-spacer"></span>'
    + ['columns','xlsx','pdf','print'].map((kind,i)=>'<button type="button" class="mp-btn mp-icon" id="'+['miPersonalColumns','miPersonalXlsx','miPersonalPdf','miPersonalPrint'][i]+'" title="'+['Mostrar columnas','Exportar Excel','Exportar PDF','Imprimir'][i]+'" aria-label="'+['Mostrar columnas','Exportar Excel','Exportar PDF','Imprimir'][i]+'">'+mpIcon(kind)+'</button>').join('')
    + '</div>'
    + '<div class="mp-columns" id="miPersonalColumnas" hidden></div>'
    + '<div class="mp-count"><label>Mostrar <select id="miPersonalMostrar"><option value="all">Todos</option><option value="selected">Seleccionados</option><option value="unselected">No seleccionados</option></select></label><span id="miPersonalCuenta"></span></div>'
    + '<div class="mp-body" id="miPersonalBody"></div>'
    + '</section>';
  document.body.appendChild(modal);
  modal.querySelector('.mi-personal-close').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', event => { if (event.target === modal) modal.hidden = true; });
  document.getElementById('miPersonalBuscar').addEventListener('input', e => { mpState.q = e.target.value; mpRender(); });
  document.getElementById('miPersonalCurso').addEventListener('change', e => { mpState.curso = e.target.value; mpRender(); });
  document.getElementById('miPersonalEstado').addEventListener('change', e => { mpState.estado = e.target.value; mpRender(); });
  document.getElementById('miPersonalXlsx').addEventListener('click', () => mpExport('xlsx'));
  document.getElementById('miPersonalPdf').addEventListener('click', () => mpExport('pdf'));
  document.getElementById('miPersonalColumns').addEventListener('click',()=>{mpTable().panel=!mpTable().panel;mpRender();});
  document.getElementById('miPersonalMostrar').addEventListener('change',e=>{mpTable().mode=e.target.value;mpRender();});
  document.getElementById('miPersonalPrint').addEventListener('click',()=>mpExport('print'));
  return modal;
}

// Convierte los datos del servidor en filas planas por vista.
function mpFilas(tab, data) {
  const cursoNombre = new Map((data.cursos || []).map(c => [c.id, mpCourse(c)]));
  if (tab === 'inscripciones') {
    const porUsuario = new Map();
    for (const i of data.inscripciones || []) {
      if (!porUsuario.has(i.usuarioId)) porUsuario.set(i.usuarioId, []);
      porUsuario.get(i.usuarioId).push(i);
    }
    const filas = [];
    for (const p of data.personal || []) {
      const lista = porUsuario.get(p.id) || [];
      if (!lista.length) {
        filas.push({ codigo: p.codigo, nombre: p.nombre, email: p.email, curso: '—', cursoCodigo: '—', reportes: '—', _curso: '' });
      }
      for (const i of lista) {
        filas.push({ codigo: p.codigo, nombre: p.nombre, email: p.email, curso: cursoNombre.get(i.cursoId) || [i.cursoCodigo,i.curso].filter(Boolean).join(' · ') || '—', cursoCodigo: i.cursoCodigo || '—', reportes: i.considerarReportes ? 'Sí' : 'No', _curso: i.cursoId || '' });
      }
    }
    return filas;
  }
  if (tab === 'asistencia') {
    return (data.asistencias || []).map(a => ({
      clase: a.clase || '—',
      curso: cursoNombre.get(a.cursoId) || a.curso || '—',
      codigo: a.codigo,
      nombre: a.nombre,
      estatus: a.status === 'PRESENTE' ? 'Asistencia' : a.status === 'AUSENTE' ? 'Inasistencia' : 'Sin registrar',
      justificada: a.status === 'AUSENTE' && a.justified ? 'Sí' : '—',
      _curso: a.cursoId || '',
      _estado: a.status === 'PRESENTE' ? 'Asistencia' : a.status === 'AUSENTE' ? 'Inasistencia' : 'Sin registrar'
    }));
  }
  return (data.evaluaciones || []).map(e => ({
    codigo: e.codigo,
    nombre: e.nombre,
    curso: cursoNombre.get(e.cursoId) || e.curso || '—',
    tipo: e.tipo === 'FINAL' ? 'Final' : e.tipo === 'DIAGNOSTICA' ? 'Diagnóstica' : (e.tipo || '—'),
    tema: e.temaId || '—',
    calificacion: e.calificacion != null ? e.calificacion : '—',
    resultado: e.aprobado ? 'Aprobado' : 'No aprobado',
    intentos: e.intentos,
    fecha: mpFecha(e.fecha),
    _curso: e.cursoId || '',
    _estado: e.aprobado ? 'Aprobado' : 'No aprobado'
  }));
}

function mpFiltradas() {
  const tab = MP_TABS[mpState.tab];
  let filas = mpFilas(mpState.tab, mpState.data);
  filas=filas.map((f,i)=>({...f,_key:String(i)}));
  const q = mpState.q.trim().toLowerCase();
  if (q) filas = filas.filter(f => tab.cols.some(([k]) => String(f[k] ?? '').toLowerCase().includes(q)));
  if (mpState.curso) filas = filas.filter(f => f._curso === mpState.curso);
  if (mpState.estado && tab.estados) filas = filas.filter(f => f._estado === mpState.estado);
  if (mpState.sort.key) {
    const k = mpState.sort.key, dir = mpState.sort.dir;
    filas = [...filas].sort((a, b) => String(a[k] ?? '').localeCompare(String(b[k] ?? ''), 'es', { numeric: true }) * dir);
  }
  return filas.filter(f=>mpTable().mode==='all'||(mpTable().mode==='selected'?mpTable().selected.has(f._key):!mpTable().selected.has(f._key))).map((f,i)=>({...f,_line:i+1}));
}

function mpRender() {
  const body = document.getElementById('miPersonalBody');
  const tabs = document.getElementById('miPersonalTabs');
  const tab = MP_TABS[mpState.tab];
  tabs.innerHTML = Object.keys(MP_TABS).map(k => '<button type="button" class="mp-tab' + (k === mpState.tab ? ' active' : '') + '" data-tab="' + k + '">' + MP_TABS[k].label + '</button>').join('');
  tabs.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    mpState.tab = b.dataset.tab; mpState.estado = ''; mpState.sort = { key: '', dir: 1 }; mpRender();
  }));

  const cursoSel = document.getElementById('miPersonalCurso');
  const cursos = (mpState.data.cursos || []);
  cursoSel.innerHTML = '<option value="">Todos los cursos</option>' + cursos.map(c => '<option value="' + mpEscape(c.id) + '"' + (c.id === mpState.curso ? ' selected' : '') + '>' + mpEscape(mpCourse(c)) + '</option>').join('');

  const estadoSel = document.getElementById('miPersonalEstado');
  estadoSel.hidden = !tab.estados;
  if (tab.estados) estadoSel.innerHTML = tab.estados.map(([v, t]) => '<option value="' + mpEscape(v) + '"' + (v === mpState.estado ? ' selected' : '') + '>' + mpEscape(t) + '</option>').join('');

  const table=mpTable(), cols=mpColumns(), panel=document.getElementById('miPersonalColumnas');
  panel.hidden=!table.panel;
  document.getElementById('miPersonalColumns').setAttribute('aria-expanded',String(table.panel));
  panel.innerHTML=tab.cols.map(([k,t])=>'<label><input type="checkbox" data-column="'+k+'" '+(cols.some(([x])=>x===k)?'checked':'')+'>'+mpEscape(t)+'</label>').join('');
  panel.querySelectorAll('[data-column]').forEach(input=>input.addEventListener('change',()=>{table.columns ||= new Set(tab.cols.map(([k])=>k));if(input.checked)table.columns.add(input.dataset.column);else if(table.columns.size>1)table.columns.delete(input.dataset.column);mpRender();}));
  document.getElementById('miPersonalMostrar').value=table.mode;
  const filas = mpFiltradas();
  document.getElementById('miPersonalCuenta').textContent = filas.length + ' registros visibles · '+table.selected.size+' seleccionados';
  document.getElementById('miPersonalXlsx').disabled = !filas.length;
  document.getElementById('miPersonalPdf').disabled = !filas.length;
  document.getElementById('miPersonalPrint').disabled = !filas.length;

  if (!filas.length) {
    body.innerHTML = '<div class="mp-empty">Sin registros con estos filtros.</div>';
    return;
  }
  const th = ([k, t]) => {
    const marca = mpState.sort.key === k ? (mpState.sort.dir === 1 ? ' ▲' : ' ▼') : '';
    return '<th data-sort="' + k + '">' + mpEscape(t) + marca + '</th>';
  };
  body.innerHTML = '<table class="mp-table"><thead><tr><th class="mp-check"><input type="checkbox" id="mpSelectAll" aria-label="Seleccionar todos los registros visibles"></th><th class="mp-line">N.º</th>' + cols.map(th).join('') + '</tr></thead><tbody>'
    + filas.map(f => '<tr class="'+(table.selected.has(f._key)?'mp-selected':'')+'"><td class="mp-check"><input type="checkbox" data-row="'+f._key+'" aria-label="Seleccionar registro '+f._line+'" '+(table.selected.has(f._key)?'checked':'')+'></td><td class="mp-line">'+f._line+'</td>' + cols.map(([k]) => '<td>' + mpEscape(f[k]) + '</td>').join('') + '</tr>').join('')
    + '</tbody></table>';
  const all=body.querySelector('#mpSelectAll'),selected=filas.filter(f=>table.selected.has(f._key)).length;all.checked=selected===filas.length;all.indeterminate=selected>0&&selected<filas.length;
  all.addEventListener('change',()=>{filas.forEach(f=>all.checked?table.selected.add(f._key):table.selected.delete(f._key));mpRender();});
  body.querySelectorAll('[data-row]').forEach(input=>input.addEventListener('change',()=>{input.checked?table.selected.add(input.dataset.row):table.selected.delete(input.dataset.row);mpRender();}));
  body.querySelectorAll('th[data-sort]').forEach(h => h.addEventListener('click', () => {
    const k = h.dataset.sort;
    mpState.sort = mpState.sort.key === k ? { key: k, dir: -mpState.sort.dir } : { key: k, dir: 1 };
    mpRender();
  }));
}

let mpLogoPromise;
async function mpLogos(){
 if(!mpLogoPromise)mpLogoPromise=Promise.all(['assets/icon-192.png','assets/logo_scad_hub.png'].map(src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);resolve({data:canvas.toDataURL('image/png'),ratio:canvas.width/canvas.height});};image.onerror=()=>reject(new Error('No se pudo cargar el logotipo.'));image.src=new URL(src,location.href).href;}))).catch(error=>{mpLogoPromise=null;throw error;});
 return mpLogoPromise;
}
function mpDownload(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function mpReport(){
 const filas=mpFiltradas(),cols=mpColumns(),course=(mpState.data.cursos||[]).find(c=>c.id===mpState.curso);
 return {title:'Mi personal · '+MP_TABS[mpState.tab].label,client:mpState.data.cliente||'—',date:new Date().toLocaleString('es-MX'),headers:['N.º',...cols.map(([,t])=>t)],rows:filas.map(f=>[f._line,...cols.map(([k])=>String(f[k]??''))]),reference:['Curso: '+(course?mpCourse(course):'Todos los cursos'),'Mostrar: '+({all:'Todos',selected:'Seleccionados',unselected:'No seleccionados'}[mpTable().mode]),mpState.q?'Búsqueda: '+mpState.q:'',mpState.estado?'Estado: '+mpState.estado:'',filas.length+' registros'].filter(Boolean).join(' | ')};
}
async function mpExport(tipo){
 const report=mpReport();if(!report.rows.length)return;
 const printWindow=tipo==='print'?window.open('','_blank'):null;
 if(tipo==='print'&&!printWindow){alert('Permite abrir la ventana de impresión.');return;}
 const buttons=['miPersonalXlsx','miPersonalPdf','miPersonalPrint'].map(id=>document.getElementById(id));buttons.forEach(b=>b.disabled=true);
 try{
  await mpLoadLibs();const logos=await mpLogos();
  const name='Mi_personal_'+mpState.tab+'_'+new Date().toISOString().slice(0,10);
  if(tipo==='xlsx'){
   const book=new window.ExcelJS.Workbook();book.creator='CPC · Centro Privado de Capacitación';book.created=new Date();
   const sheet=book.addWorksheet(MP_TABS[mpState.tab].label,{pageSetup:{paperSize:1,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0},headerFooter:{oddHeader:'&C&BCPC · Centro Privado de Capacitación',oddFooter:'&LPowered by SCaD HUB · www.scad.mx&Ccpc.scad.mx&RPágina &P de &N'}});
   const n=report.headers.length;
   sheet.columns=report.headers.map((h,i)=>({width:i===0?6:h==='Nombre'||h==='Curso'?36:22}));
   sheet.getRow(1).height=46;sheet.getRow(2).height=22;
   sheet.mergeCells(1,2,1,n);sheet.getCell(1,2).value='CPC · Centro Privado de Capacitación';sheet.getCell(1,2).font={bold:true,size:16,color:{argb:'FF173F68'}};sheet.getCell(1,2).alignment={vertical:'middle',wrapText:true};
   [report.title,'Cliente: '+report.client,'Emitido: '+report.date,report.reference,'Referencia: https://cpc.scad.mx/ · Consulta de solo lectura'].forEach((value,i)=>{const row=i+3;sheet.mergeCells(row,1,row,n);sheet.getCell(row,1).value=value;sheet.getRow(row).height=i===3?32:24;sheet.getCell(row,1).alignment={wrapText:true,vertical:'middle'};});
   const headerRow=9;report.headers.forEach((value,i)=>{sheet.getRow(headerRow).getCell(i+1).value=value;});
   sheet.getRow(headerRow).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF173F68'}};cell.font={bold:true,color:{argb:'FFFFFFFF'},size:10};});
   report.rows.forEach((values,i)=>{const row=sheet.getRow(headerRow+i+1);values.forEach((value,col)=>{row.getCell(col+1).value=value;});row.eachCell((cell,col)=>{cell.font={size:col===1?9:10,color:{argb:col===1?'FF8993A1':'FF122033'}};cell.alignment={wrapText:true,vertical:'top'};if(i%2===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F7FB'}};});});
   const foot=headerRow+report.rows.length+2;sheet.mergeCells(foot,1,foot,n);sheet.getCell(foot,1).value='Powered by SCaD HUB · https://www.scad.mx/';sheet.getRow(foot).height=24;sheet.getRow(foot+1).height=40;
   const cpc=book.addImage({base64:logos[0].data,extension:'png'}),hub=book.addImage({base64:logos[1].data,extension:'png'});
   sheet.addImage(cpc,{tl:{col:0,row:0},ext:{width:44,height:44}});const w=Math.min(130,36*logos[1].ratio);sheet.addImage(hub,{tl:{col:1,row:foot},ext:{width:w,height:w/logos[1].ratio}});
   sheet.views=[{state:'frozen',ySplit:headerRow}];sheet.autoFilter={from:{row:headerRow,column:1},to:{row:headerRow+report.rows.length,column:n}};sheet.pageSetup.printArea='A1:'+sheet.getRow(foot+1).getCell(n).address;sheet.pageSetup.printTitlesRow='1:9';
   mpDownload(new Blob([await book.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name+'.xlsx');
  }else{
   const doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'pt',format:'letter'}),width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight();
   const header=()=>{doc.addImage(logos[0].data,'PNG',30,20,44,44);doc.setTextColor(23,63,104);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text('CPC · Centro Privado de Capacitación',84,34);doc.setFontSize(11);doc.text(report.title,84,51);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(50,65,82);doc.text(doc.splitTextToSize('Cliente: '+report.client,width-60),30,81);doc.setFontSize(7.5);doc.text('Emitido: '+report.date+' · cpc.scad.mx',30,105);doc.text(doc.splitTextToSize(report.reference,width-60),30,118);};
   doc.autoTable({startY:146,head:[report.headers],body:report.rows,margin:{left:30,right:30,top:146,bottom:64},styles:{fontSize:7.5,cellPadding:4,overflow:'linebreak'},headStyles:{fillColor:[23,63,104]},alternateRowStyles:{fillColor:[245,248,251]},columnStyles:{0:{cellWidth:27,textColor:[137,147,161],fontSize:6.5}},willDrawPage:header});
   const total=doc.internal.getNumberOfPages();for(let page=1;page<=total;page++){doc.setPage(page);doc.setDrawColor(220,225,231);doc.line(30,height-49,width-30,height-49);doc.setTextColor(105,115,125);doc.setFontSize(7);doc.text('Powered by',30,height-31);const w=Math.min(85,23*logos[1].ratio);doc.addImage(logos[1].data,'PNG',77,height-43,w,w/logos[1].ratio);doc.text('www.scad.mx',77,height-15);doc.text('CPC · Consulta de personal',width/2,height-30,{align:'center'});doc.text('Página '+page+' de '+total,width-30,height-30,{align:'right'});}
   if(tipo==='print'){doc.autoPrint();const url=doc.output('bloburl');printWindow.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),300000);}else doc.save(name+'.pdf');
  }
 }catch(error){if(printWindow)printWindow.close();console.error('Mi personal · exportar:',error);alert('No se pudo generar el reporte: '+error.message);}finally{buttons.forEach(b=>b.disabled=!mpFiltradas().length);}
}

async function fetchMiPersonal(getToken) {
  const token = await getToken();
  if (!token) throw new Error('Inicia sesión para continuar.');
  const response = await fetch(CPC_MI_PERSONAL_URL + '?t=' + Date.now(), {
    cache: 'no-store',
    headers: { 'X-CPC-Session': token }
  });
  const data = await response.json().catch(() => ({ ok: false, mensaje: 'HTTP ' + response.status }));
  if (!response.ok || !data?.ok) throw new Error(data?.mensaje || ('Mi personal ' + response.status));
  return data;
}

// loadContext: () => Promise<contexto cpcPwaContext>; getToken: () => Promise<string>.
export function initMiPersonal({ loadContext, getToken }) {
  loadContext().then(ctx => {
    if (!ctx?.miPersonal) return;
    const section = document.querySelector('.modules-section');
    if (!section || section.querySelector('[data-mi-personal]')) return;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'module-card accent-navy';
    card.dataset.miPersonal = 'true';
    card.innerHTML = '<span class="module-icon">👥</span><span class="module-copy"><strong>MI PERSONAL</strong><small>Consulta de tu personal</small></span><span class="arrow">›</span>';
    section.prepend(card);
    card.addEventListener('click', async () => {
      const modal = miPersonalModal();
      modal.hidden = false;
      document.getElementById('miPersonalBody').innerHTML = '<div class="mp-empty">Consultando…</div>';
      try {
        mpState.data = await fetchMiPersonal(getToken);
        Object.keys(mpTables).forEach(k=>delete mpTables[k]);
        mpState.tab = 'inscripciones';
        mpState.q = ''; mpState.curso = ''; mpState.estado = ''; mpState.sort = { key: '', dir: 1 };
        document.getElementById('miPersonalBuscar').value = '';
        document.getElementById('miPersonalCliente').textContent = mpState.data.cliente ? 'Cliente: ' + mpState.data.cliente : '';
        mpRender();
      } catch (error) {
        console.error('Mi personal:', error);
        document.getElementById('miPersonalBody').innerHTML = '<div class="mp-msg">' + mpEscape(error.message) + '</div>';
      }
    });
  }).catch(error => console.error('Mi personal · contexto:', error));
}
