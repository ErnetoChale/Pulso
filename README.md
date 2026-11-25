# Pulso — simulador de casos clínicos

App web de código abierto para estudiar con pacientes virtuales: interrogas, exploras, pides estudios y das tratamiento mientras el paciente evoluciona con el tiempo y con tus decisiones. Al final te da retroalimentación: acciones críticas, errores con riesgo, diagnóstico y puntos clave con referencias.

Es un solo archivo (`index.html`), sin servidor ni base de datos.

## Publicarla en GitHub Pages

1. Crea un repositorio nuevo (por ejemplo `pulso`) y sube todo el contenido de esta carpeta.
2. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. En 1–2 minutos queda en `https://TU-USUARIO.github.io/pulso/`.

## Cuentas

Cada persona crea una cuenta con su nombre y un PIN de 4 a 6 números. La cuenta guarda:

- **Historial de puntajes:** cada caso resuelto con fecha, puntaje, si acertó el diagnóstico y los errores.
- **Casos propios:** los que agrega cada quien. Cada caso puede ser **público** o **privado**.

Las cuentas son **locales**: viven en el navegador y el dispositivo donde se crearon, sin servidor. El PIN se guarda cifrado con un hash, pero no es una medida de seguridad fuerte: no guardes datos de pacientes reales. Para pasar una cuenta a otro dispositivo, usa «Respaldar mi cuenta» y «Restaurar respaldo» en el perfil.

### Casos públicos

Un caso público se puede jugar de tres formas:

1. **Con un enlace:** en «Mi perfil» → «Enlace para compartir». El caso va comprimido dentro del enlace; quien lo abra lo juega sin cuenta y puede guardarlo en sus casos.
2. **Enviándolo a la biblioteca (para cualquier usuario):** en «Mi perfil» → «Enviar a la biblioteca». Se abre GitHub con un issue ya escrito; el usuario solo da clic en «Submit new issue» (necesita una cuenta gratis de GitHub). La automatización `.github/workflows/casos.yml`:
   - revisa el caso y responde en el issue si es válido o qué le falta;
   - cuando quien administra el repo agrega la etiqueta **`aprobado`**, lo guarda en `cases/`, actualiza `cases/index.json`, cierra el issue y el caso aparece para todos en 1–2 minutos;
   - los casos que envía el dueño del repositorio se publican sin esperar aprobación.
3. **Publicación directa (solo el dueño):** conectando un token en «Agregar caso» → «Conectar mi repositorio de GitHub».

## Agregar casos

Hay tres formas:

- **Desde la app:** entra a tu cuenta → «Agregar caso» → pega el JSON o sube el archivo, y elige si es público.
- **Desde la app, a GitHub (para todos tus dispositivos):** en «Agregar caso» abre «Conectar mi repositorio de GitHub», pon tu usuario, el repositorio y un token *fine-grained* con permiso **Contents: Read and write** solo para ese repo. Al agregar un caso con la casilla marcada, la app crea `cases/<id>.json` y actualiza `cases/index.json` con un commit. Pages lo publica en 1–2 minutos.
- **A mano:** sube el `.json` a la carpeta `cases/` y agrega su nombre a `cases/index.json`.

El token se guarda solo en el navegador donde lo escribes. No lo pongas en ningún archivo del repositorio.

## Sonido

El monitor hace un pitido por latido cuyo tono baja con la saturación, como un oxímetro real, y suena alarma media cuando algún signo sale de rango y alarma alta en paro. También hay tonos al recibir resultados, al cometer un error, al alcanzar el objetivo y si el paciente fallece. Se apaga con el botón «Sonido» del monitor. Todo se genera con Web Audio, sin archivos de audio.

## Agregar desde un DOI

En «Agregar caso» → «Desde un DOI», pega el DOI (o el enlace doi.org). La app, sin IA:

- busca el artículo en Europe PMC y, si no está, en Crossref (título, autores, revista, año, resumen y enlace al texto completo si es de acceso abierto);
- extrae del resumen, por patrones, edad, sexo, FC, PA, FR, SpO₂ y temperatura;
- arma un borrador del caso con esos datos y la referencia ya citada;
- copia la instrucción para Claude con el artículo y el resumen incluidos.

Convertir el artículo en un caso jugable (estados, decisiones, errores, retroalimentación) requiere que alguien lo interprete: tú completando el borrador o Claude con la instrucción. Esta función necesita internet, así que solo funciona en la app publicada en GitHub Pages.

## Crear casos a partir de artículos, libros o casos

Mándale el material a Claude con esta instrucción:

> Convierte este material en un caso para Pulso (formato v1, JSON). Incluye estados que evolucionen con el tiempo, interrogatorio, exploración, estudios con resultados por estado, tratamientos con efectos y errores, acciones críticas, diagnóstico con distractores y retroalimentación con referencias.

## Formato del caso (v1)

| Campo | Qué es |
|---|---|
| `id`, `title`, `specialty`, `level`, `source`, `setting` | Datos del caso |
| `patient` | `name`, `age`, `sex`, `weight`, `cc` (motivo de consulta) |
| `start` | Id del estado inicial |
| `states` | Cada estado: `label`, `v` (hr, sbp, dbp, rr, spo2, t), `rhythm` (`sinus`, `st`, `ectopia`, `fv`, `asistolia`), `d` (descripción), `worse: {after, to}` (minutos sin intervención y estado al que empeora), `goal: true` (objetivo terapéutico), `end: "muerte"` |
| `history` | `{id, q, a}` |
| `exam` | `{id, n, f}` |
| `tests` | `{id, n, min, r}`; `r` es texto o un objeto con un resultado por estado y `"*"` por defecto |
| `treatments` | `{id, n, min, goto, when, harm: {when, msg}, delay, needs, note}` |
| `diagnosis` | `{options: [...], correct: índice}` |
| `scoring.critical` | `{label, a: [ids], by: minutos, before: id, w: peso}` |
| `scoring.avoid` | `{state, label}`: estados que el estudiante debe evitar |
| `debrief` | `{summary, points: [...], refs: [...]}` |

Puntaje: porcentaje de acciones críticas cumplidas, −10 por cada error con riesgo, −10 por diagnóstico incorrecto y −30 si el paciente muere.

Los casos incluidos son material educativo de ejemplo. No sustituyen guías clínicas ni el juicio médico.

## Licencia

MIT
