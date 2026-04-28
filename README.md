# Claude Usage Tracker

![Claude Usage Tracker icon](icons/icon128.png)

Una extensión chiquita que te dice cómo vas en Claude.ai sin que tengas que dejar lo que estás haciendo.

Mientras trabajás o navegás, la extensión revisa en silencio el uso cada cinco minutos, guarda todo en `chrome.storage`, y solo te manda un sonidito cuando uno de los límites sube o baja.

## Cómo probarla
1. Abrí `chrome://extensions` (o `edge://extensions`).
2. Activa el modo desarrollador.
3. Cargá esta carpeta como **extensión desempaquetada**.

## Qué te da
- Estado de los planes (5 horas, 7 días, diario y mensual).
- Avisos sonoros cuando una ventana se agota o vuelve a estar disponible.
- No pide claves privadas porque usa las cookies de tu sesión.

Si el sonido no suena o la info no actualiza, fijate en `background.js`: ahí están la cookie y la URL que usa para sacar los datos.
