# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Sitio estático en español de **SafeRoute** (campaña de educación vial juvenil del **Colectivo VIALYS**) más un juego/simulador de conducción en canvas. No hay `package.json`, build, linter ni tests.

## Ejecutar

- `node server.js` — servidor estático sin dependencias en `http://localhost:3000` (`PORT` configurable; sirve `index.html` en `/`, con `Cache-Control: no-cache`).
- También se puede abrir cualquier HTML directamente con `file://` (hay una config en `.vscode/launch.json`).

## Arquitectura

- `index.html` — sitio principal (CSS y JS inline, ~2500 líneas). Embebe el juego con `<iframe src="vialys.juego.html">` y lo enlaza en pestaña nueva.
- `index.saferoute.html` — copia idéntica de `index.html`. Si cambias uno, mantén el otro sincronizado (o confirma cuál es el vigente).
- `vialys.juego.html` — **versión de un solo archivo del juego** (CSS, JS y sprites de autos en base64 `data:` inline). Es la que usa el sitio principal.
- `vialys.juego.fuentes/` — versión separada del mismo juego (`index.html`, `style.css`, `game.js`, `images/`). Los sprites de autos viven como PNG aquí, pero inline en base64 en `vialys.juego.html`. Los dos pueden desincronizarse: al modificar la lógica del juego, aplica el cambio en ambos.
- Logos en la raíz, referenciados por `index.html`: `saferoute-logo.jpg` (SafeRoute) y `logo.png` (emblema VIALYS). `vialys.juego.fuentes/images/` tiene sus propias copias; las rutas son relativas, así que cada HTML necesita los logos junto a él o en su `images/`.
