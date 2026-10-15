// Matches backend/tvdNucleo.js ORIGEN_CICLO when no "Transmitir ahora" anchor exists.
const DEFAULT_ANCHOR = Date.parse('2026-10-13T06:00:00Z');
export function youtubeId(value) {
  const raw = String(value || '').trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname === 'youtu.be') return valid(url.pathname.split('/')[1]);
    if (!/(^|\.)youtube(?:-nocookie)?\.com$/.test(url.hostname)) return '';
    return valid(url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1]);
  } catch { return ''; }
}
function valid(id) { return /^[\w-]{11}$/.test(id || '') ? id : ''; }
export function resolveSysTransmission(data, now = Date.now()) {
  if (data?.ok !== true || data.transmision?.activa !== true) return null;
  const items = (data.elementos || []).filter(v => v.activo !== false && Number(v.duracionSegundos) > 0)
    .slice().sort((a,b) => Number(a.orden) - Number(b.orden));
  const total = items.reduce((sum,v) => sum + Number(v.duracionSegundos), 0);
  const anchor = data.transmision.inicioEmision ? Date.parse(data.transmision.inicioEmision) : DEFAULT_ANCHOR;
  if (!total || !Number.isFinite(anchor) || !Number.isFinite(now)) return null;
  let cursor = Math.max(0, Math.floor((now-anchor)/1000)) % total;
  for (const item of items) {
    const duration = Number(item.duracionSegundos);
    if (cursor < duration) {
      const id = youtubeId(item.referenciaVideo);
      return id ? { modo:'PARRILLA', youtubeId:id, titulo:item.titulo || '', segundoInicio:cursor, itemId:item.id, occurrence:Math.floor((now-anchor)/1000)-cursor } : null;
    }
    cursor -= duration;
  }
  return null;
}
