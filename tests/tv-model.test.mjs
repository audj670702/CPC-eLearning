import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSysTransmission, youtubeId } from '../cpc-tv-model.js';
const anchor=Date.parse('2026-10-13T06:00:00Z');
const schedule={ok:true,transmision:{activa:true,inicioEmision:null},elementos:[
{id:'a',referenciaVideo:'https://youtu.be/J8iuaBiKIsk',duracionSegundos:10,orden:1},
{id:'b',referenciaVideo:'https://youtube.com/live/kDXoRrnq7pA',duracionSegundos:20,orden:2}
]};
test('shared clock selects video and offset across boundaries and cycles',()=>{
assert.equal(resolveSysTransmission(schedule,anchor+9000).segundoInicio,9);
assert.equal(resolveSysTransmission(schedule,anchor+10000).itemId,'b');
assert.equal(resolveSysTransmission(schedule,anchor+35000).segundoInicio,5);
});
test('Transmitir ahora replaces default anchor',()=>{
const data={...schedule,transmision:{activa:true,inicioEmision:'2026-10-15T10:00:00Z'}};
assert.equal(resolveSysTransmission(data,Date.parse(data.transmision.inicioEmision)+12000).segundoInicio,2);
});
test('invalid or inactive schedules do not play arbitrary URLs',()=>{
assert.equal(resolveSysTransmission({...schedule,ok:false},anchor),null);
assert.equal(resolveSysTransmission({...schedule,elementos:[]},anchor),null);
assert.equal(youtubeId('https://example.com/watch?v=J8iuaBiKIsk'),'');
assert.equal(youtubeId('https://youtube.com/live/kDXoRrnq7pA'),'kDXoRrnq7pA');
});
import { resolvePanelVideo } from '../cpc-tv-model.js';
test('PLAYLIST_PANEL programacion follows the shared cycle',()=>{
const prog={cicloOrigen:'2026-10-13T06:00:00.000Z',videos:[{id:'J8iuaBiKIsk',titulo:'A',duracion:10},{id:'kDXoRrnq7pA',titulo:'B',duracion:20}]};
assert.equal(resolvePanelVideo(prog,anchor+9000).segundoInicio,9);
assert.equal(resolvePanelVideo(prog,anchor+10000).itemId,'kDXoRrnq7pA');
assert.equal(resolvePanelVideo(prog,anchor+35000).segundoInicio,5);
assert.equal(resolvePanelVideo({...prog,videos:[]},anchor),null);
});
