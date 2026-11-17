# Sentinel

> Prototipo web local para revisar los indicadores de salud de astronautas durante una misión espacial larga: ver qué cambió, por qué se marcó y registrar una decisión humana.

🇬🇧 [English version](README.md)

**NASA Space Apps Challenge 2026** · Reto: monitoreo de la salud de astronautas durante misiones
**Equipo:** `[NOMBRE DEL EQUIPO]` · **Demo en línea:** `[ENLACE DE LA DEMO]` · **Video:** `[ENLACE DEL VIDEO]`

## Autores

- `[NOMBRE 1]`
- `[NOMBRE 2]`

## Tabla de contenidos

- [Descripción](#descripción)
- [Características](#características)
- [Datos y recursos de la NASA](#datos-y-recursos-de-la-nasa)
- [Pruébalo en 90 segundos](#pruébalo-en-90-segundos)
- [Ejecución local](#ejecución-local)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Pruebas](#pruebas)
- [Tecnologías utilizadas](#tecnologías-utilizadas)
- [Uso de IA](#uso-de-ia)
- [Alcance y límites](#alcance-y-límites)
- [Trabajo futuro](#trabajo-futuro)

## Descripción

En misiones de larga duración, la tripulación no puede depender de un contacto constante con la Tierra. **Sentinel** es un prototipo que ayuda a revisar a bordo los indicadores personales de salud: compara a cada tripulante con su **propia** línea base, muestra la evidencia de cada aviso, deja visibles los datos ausentes en lugar de ocultarlos y deja toda decisión en manos de una persona.

Es una **reproducción de una misión simulada de 120 días** (no telemetría en vivo) con tres tripulantes ficticios y tres escenarios: misión nominal, cambio sostenido y datos incompletos. También permite importar tus propias mediciones desde un CSV.

La aplicación funciona en el navegador, sin servidor, cuentas ni instalación, y sigue disponible sin conexión (modo «a bordo»). Solo la consulta opcional a NASA RadLab usa la red.

```
Misión simulada o CSV  →  Validar y explorar  →  Añadir contexto  →  Registrar revisión / decisión  →  Guardar resumen local
```

## Características

- **Revisión explicable:** pulso, sueño y tiempo de reacción frente a una línea base personal, con la evidencia y la regla que originó cada aviso. Las lecturas ausentes aparecen como huecos y nunca se tratan como cero.
- **Línea temporal de misión:** 120 días con hitos clave (despegue, inserción orbital, EVA, reentrada, cierre). Al elegir un hito se inspecciona el día y se pueden comparar dos días (B menos A).
- **Resumen por sistemas:** cardiovascular, descanso y recuperación, acondicionamiento y ambiente/radiación, con las etiquetas «esperado en el guion / a revisar / no evaluable» en lugar de estados clínicos.
- **Decisiones humanas:** check-in diario, notas de revisión, opciones de seguimiento, bitácora y pendientes, guardados localmente por tripulante y escenario.
- **Datos propios:** importación de CSV con asignación de columnas y unidades, validación (fechas, duplicados, rangos), filtros por persona y período, comparación de dos períodos, archivos de misión en JSON e informe HTML autónomo.
- **Contexto opcional de NASA RadLab:** en el panel de datos propios se consultan lecturas históricas públicas de radiación de la ISS (instrumento DosTel) de hasta 7 días. Solo se envían las fechas y filtros fijos ISS/DosTel; tu CSV, nombres, notas y datos de salud nunca salen del navegador.
- **Resumen local:** un resumen imprimible o copiable preparado a bordo para una futura comunicación. No se transmite nada a la Tierra.
- **Ambiente sonoro (opcional):** sonido ambiental y señales de hitos sintetizados en el navegador con Web Audio. Apagado por defecto.
- **Demostración guiada:** un recorrido de seis pasos de unos 90 segundos, desde la línea base hasta el resumen.

## Datos y recursos de la NASA

- **NASA Open Science Data Repository (OSDR) · Environmental Data Application (EDA):** un snapshot local de CO₂ histórico de la cabina de la ISS de la misión RR-1 (21 sep 2014, 00:04–00:59 UTC, 12 lecturas entre 2.855 y 2.886 ppm). Se muestra como contexto ambiental independiente y **no** está asociado a los tripulantes ficticios.
- **NASA OSDR RadLab Data API:** consulta opcional en vivo de radiación histórica de la ISS (DosTel), separada de las mediciones propias del usuario.
- **Páginas de la NASA sobre ejercicio en la ISS:** enlazadas como referencia educativa general.
- Los indicadores personales, la radiación y los valores de cabina dentro de la simulación son **ficticios**, y las reglas de revisión son **didácticas, no umbrales de la NASA**.

## Pruébalo en 90 segundos

1. Abrir `dist/index.html` (redirige a `dist/replay.html`) o la demo en línea.
2. Elegir **Ver demostración guiada · 90 s** para seguir el recorrido de seis pasos con el tripulante A.
3. O elegir tripulante, escenario y día de inicio y pulsar **Entrar al panel de misión**.
4. Para probar tus datos, elegir **Importar y revisar datos propios** y descargar el CSV de ejemplo.

## Ejecución local

No requiere instalación. Abrir `index.html` (o `dist/index.html`) en un navegador moderno (Chrome, Edge, Brave, Firefox). Para publicarlo, subir el repositorio a cualquier hosting estático (por ejemplo GitHub Pages).

Para ejecutar las pruebas se necesita [Node.js](https://nodejs.org/) 18 o superior. Las pruebas de lógica no requieren paquetes.

## Estructura del proyecto

```
.
├── index.html            # Redirige a dist/ (permite servir la raíz con GitHub Pages)
├── dist/
│   ├── index.html        # Entrada (redirige a replay.html)
│   ├── replay.html       # Aplicación principal (HTML, CSS y JavaScript)
│   ├── audio.js          # Sonido ambiental y señales sintetizadas
│   └── assets/           # Imagen de fondo local (generada por IA, con marca de agua)
├── work/                 # Scripts de verificación (verify-*.cjs)
├── docs/                 # Prompt de la imagen y notas técnicas detalladas
├── README.md
└── README.es.md
```

## Pruebas

```bash
node work/verify-demo.cjs       # 53 comprobaciones: escenarios, gráficos, guardado, recorrido
node work/verify-data.cjs       # 21 comprobaciones: importación CSV, validación, exportación
node work/verify-followup.cjs   # 18 comprobaciones: misiones, informes, comparación
node work/verify-audio.cjs      # 20 comprobaciones: lógica de sonido
node work/verify-radlab.cjs     # 9 comprobaciones: manejo de la consulta RadLab (simulada)
```

Estas pruebas de lógica simulan el navegador. `work/verify-audio-browser.cjs` es una comprobación extra en Chrome que requiere Playwright (se pueden definir `PLAYWRIGHT_PATH` y `PW_CHANNEL`). La interfaz también se abrió en Chromium para revisar el diseño y los errores de consola. La conexión real con NASA RadLab depende del navegador y la red, y no está cubierta por las pruebas automáticas.

## Tecnologías utilizadas

- HTML, CSS y JavaScript sin frameworks (una sola aplicación estática, sin compilación)
- Web Audio API para el sonido
- `localStorage` para los registros locales; memoria del navegador para los datos importados
- Scripts de Node.js para la verificación

## Uso de IA

Se usaron herramientas de IA en este proyecto:

- **Código:** desarrollado con asistencia de IA (ChatGPT/Codex de OpenAI), luego revisado y corregido con Claude de Anthropic (incluida una corrección de desbordamiento del diseño). Tanto el código de la aplicación como las pruebas contaron con asistencia de IA.
- **Imagen:** la imagen de fondo `dist/assets/station-interior-v1.png` está **generada por IA** con la herramienta de generación de imágenes de ChatGPT (prompt en `docs/background-prompt.txt`). Lleva una marca de agua visible y una etiqueta en pantalla.
- **Audio:** todos los sonidos se sintetizan por código en el navegador (Web Audio); no se usan archivos de audio generados por IA.
- **Documentación:** los README se redactaron con asistencia de IA.

El equipo revisó los resultados y es responsable de la entrega final.

## Alcance y límites

- **No** es un dispositivo médico. No diagnostica, no predice resultados clínicos, no prescribe tratamiento ni controla ningún sistema de una nave.
- No afirma aprobación de la NASA ni cumplimiento total del reto.
- La misión es simulada y los datos son ficticios. Los datos importados no se verifican.
- La consulta opcional a RadLab necesita conexión a internet y un navegador con permiso para llamar a la API de NASA. Si falla, la app muestra un aviso y sigue funcionando en local.
- Las misiones importadas permanecen en memoria hasta descargarlas como JSON; los registros de la demo quedan en el navegador donde se guardaron.
- La interfaz está en español. El panel principal está pensado para pantallas de escritorio; el menú de entrada se adapta a pantallas estrechas.

## Trabajo futuro

- Validación de las reglas de revisión con expertos médicos y cirujanos de vuelo
- Uso de conjuntos de datos abiertos reales de la NASA sobre salud y ambiente
- Interfaz en inglés y selector de idioma
- Una vista simplificada para familiares o personal de apoyo en tierra
- Diseño móvil para el panel principal

## Licencia

`[LICENCIA]`
