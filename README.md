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

## Monitor TV

`cpc-tv.js` + `cpc-tv.css` son una réplica del monitor de NEXUS (`js/tv.js`, `initTvOptions` de `js/modes.js`, `js/back-nav.js` y sus estilos). Es el modelo a replicar en otras apps.

- **TV Capacitación** (predeterminado): se configura desde el Panel CPC y llega en `cpcPwaContext` → `tv` (`youtubeId`, `segundoInicio`, `modo`, `titulo`). Requiere sesión; se vuelve a consultar cada 10 s mientras está al aire.
- **TV Digital**: señal HLS `motortv.scad.mx/hls/canal.m3u8`.

Pantalla completa como en NEXUS: API nativa (Android, escritorio, iPad); en iPhone, reproductor nativo para TV Digital y pantalla completa dentro de la app para TV Capacitación. El botón Atrás cierra el menú y la pantalla completa.
