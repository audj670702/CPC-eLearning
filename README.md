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
- **TV Capacitación** (predeterminado): se configura desde el Panel CPC y llega en `cpcPwaContext` → `tv` (`youtubeId`, `segundoInicio`, `modo`, `titulo`). Requiere sesión; se vuelve a consultar cada 10 s mientras el canal está al aire.

El monitor siempre abre en TV Capacitación (sin sesión pide iniciarla). El menú de opciones cambia de canal, activa el sonido y abre pantalla completa: API nativa en Android/escritorio/iPad; en iPhone, el reproductor nativo para TV Digital y pantalla completa dentro de la app para TV Capacitación. El botón Atrás cierra el menú y la pantalla completa, como en NEXUS.
