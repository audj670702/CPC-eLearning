# CPC e-Learning

Aplicación dedicada de CPC e-Learning.

## Estado

Proyecto iniciado desde cero como aplicación independiente.

## Principios iniciales

- Repositorio público.
- No almacenar credenciales, tokens, claves privadas ni secretos en el código.
- Mantener separadas la interfaz pública y las operaciones sensibles de backend.
- No reutilizar componentes de `app.scad.mx` automáticamente; sólo integrar elementos previamente evaluados.
- La arquitectura funcional se definirá antes de incorporar módulos adicionales.

## Alcance inicial

Base técnica mínima para una PWA de CPC e-Learning. La integración con autenticación, Wix, CMS, progreso, contenidos y administración se incorporará conforme se cierre la arquitectura funcional.

## Módulo TV Capacitación

`cpc-tv.js` + `cpc-tv.css`. Mismo modelo que NEXUS: un monitor con dos canales.

- **TV Digital Internet**: señal HLS `motortv.scad.mx/hls/canal.m3u8`.
- **CPC**: se configura desde el Panel CPC y llega en `cpcPwaContext` → `tv` (`youtubeId`, `segundoInicio`, `modo`, `titulo`). Requiere sesión; se vuelve a consultar cada 10 s mientras el canal está al aire.

Con sesión abre en el canal CPC; sin sesión, en TV Digital Internet. El menú de opciones del monitor cambia de canal, activa el sonido y abre pantalla completa (en iPhone con YouTube, pantalla completa dentro de la app; Atrás la cierra).
