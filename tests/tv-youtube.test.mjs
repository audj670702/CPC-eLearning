// Monitor TV · canales de YouTube sin "Reproducir" (v0.5.35). DOM simulado con jsdom:
// valida los mensajes al reproductor, no la política real de cada navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://lot.example/', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
for (const k of ['window', 'document', 'history', 'navigator', 'location', 'MutationObserver', 'HTMLElement']) {
  Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
}
const now = Date.now();
const schedule = (id, start = now - 5000) => ({ ok: true, transmision: { activa: true, inicioEmision: new Date(start).toISOString() },
  elementos: [{ id, referenciaVideo: `https://youtu.be/${id}`, duracionSegundos: 3600, orden: 1 }] });
let program = schedule('J8iuaBiKIsk');
globalThis.fetch = async url => {
  const body = String(url).includes('tvdCanales')
    ? { ok: true, canales: [{ codigo: 'CH03', numero: 3, nombre: 'Música', tipo: 'VIRTUAL' }] }
    : program;
  return { ok: true, headers: { get: () => null }, json: async () => body };
};
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const { tvMarkup, initCpcTv, setTvActive } = await import('../cpc-tv.js');
const $ = s => document.querySelector(s);

document.body.innerHTML = tvMarkup({ eoChannel: false, staticEffect: true });
initCpcTv({ eoChannel: false, staticEffect: true });
await tick();

let sent = [];
function player() {
  const frame = $('#tvCommunityFrame');
  frame.contentWindow.postMessage = msg => sent.push(JSON.parse(msg));
  return frame;
}
function fromYoutube(frame, data) {
  window.dispatchEvent(new window.MessageEvent('message', { origin: 'https://www.youtube.com', source: frame.contentWindow, data: JSON.stringify(data) }));
}
const funcs = () => sent.filter(m => m.event === 'command').map(m => m.func);

test('sin canal de la EO: arranca en CH 01 y no lista CH 00', () => {
  assert.equal($('#tvChannelNumber').textContent, 'CH 01');
  const codes = [...document.querySelectorAll('#tvChannelList [data-channel]')].map(b => b.dataset.channel);
  assert.deepEqual(codes, ['CH01', 'CH02', 'CH03']);
});

test('estática breve al sintonizar', async () => {
  $('#tvStatic').classList.remove('on');
  $('#tvChannelList [data-channel="CH03"]').click();
  assert.equal($('#tvStatic').classList.contains('on'), true);
  await tick(60);
});

test('YouTube se crea silenciado aunque el usuario haya pedido sonido, y el sonido se activa al estar al aire', async () => {
  $('#btnTvMute').click(); // sonido activado
  // Volver a sintonizar crea un reproductor nuevo
  $('#tvChannelList [data-channel="CH01"]').click(); await tick();
  $('#tvChannelList [data-channel="CH03"]').click(); await tick(60);
  const frame = player();
  assert.match(frame.src, /[?&]mute=1(&|$)/);
  assert.equal(frame.getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin');
  sent = [];
  fromYoutube(frame, { event: 'onReady' });
  fromYoutube(frame, { event: 'onStateChange', info: 1 });
  assert.deepEqual(funcs(), ['unMute']);
  assert.equal($('#tvResume').hidden, true);
});

test('si el navegador bloquea el sonido, el video sigue en silencio en vez de pedir Reproducir', () => {
  const frame = player(); sent = [];
  fromYoutube(frame, { event: 'onStateChange', info: 2 });
  assert.deepEqual(funcs(), ['mute', 'playVideo']);
  assert.equal($('#tvResume').hidden, true);
  assert.equal($('#btnTvMute').getAttribute('aria-label'), 'Activar sonido');
  assert.equal($('#tvLoadText').textContent, 'Toca 🔊 para activar el sonido');
});

test('autoplay bloqueado incluso en silencio: reintenta reproducir sin mostrar el botón', () => {
  const frame = player(); sent = [];
  fromYoutube(frame, { event: 'onAutoplayBlocked' });
  assert.deepEqual(funcs(), ['mute', 'playVideo']);
  assert.equal($('#tvResume').hidden, true);
});

test('el cambio de programa reutiliza el mismo reproductor (sin iframe nuevo)', async () => {
  const frame = player(); sent = [];
  program = schedule('kDXoRrnq7pA');
  // El siguiente programa llega con la consulta periódica (estado 0 = terminó el video).
  fromYoutube(frame, { event: 'onStateChange', info: 0 });
  await tick(1200);
  assert.equal($('#tvCommunityFrame'), frame);
  const load = sent.find(m => m.func === 'loadVideoById');
  assert.equal(load?.args?.[0]?.videoId, 'kDXoRrnq7pA');
});

test('monitor fuera de pantalla: libera el reproductor y no lo recrea hasta volver', async () => {
  setTvActive(false);
  assert.equal($('#tvCommunityFrame'), null);
  await tick(1200); // el ciclo de 1 s no debe volver a crear el iframe
  assert.equal($('#tvCommunityFrame'), null);
  setTvActive(true); await tick(60);
  assert.ok($('#tvCommunityFrame'));
  assert.equal($('#tvChannelNumber').textContent, 'CH 03');
  const frame = player();
  fromYoutube(frame, { event: 'onReady' });
});

test('una pausa del usuario sí muestra Reproducir', () => {
  const frame = player();
  fromYoutube(frame, { event: 'onStateChange', info: 1 });
  fromYoutube(frame, { event: 'onStateChange', info: 2 });
  assert.equal($('#tvResume').hidden, false);
  setTimeout(() => process.exit(0), 10); // el monitor deja temporizadores activos
});
