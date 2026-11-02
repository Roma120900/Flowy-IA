# Flowy.ai

Web de Flowy (una sola página, `index.html`) con generador de guiones conectado a Gemini y Claude.

## Arrancar en local

Necesitas Node 22 o superior.

1. `npm install`
2. Configura el `.env` (siguiente sección).
3. `npm start` y abre http://localhost:3000

Si abres `index.html` con doble clic, la web se ve, pero la IA no funciona: necesita el servidor.

## Configurar el `.env`

1. Copia la plantilla: `cp .env.example .env` (en PowerShell: `Copy-Item .env.example .env`).
2. Rellena al menos una clave de IA. Con las dos, una hace de respaldo de la otra.
   - `GEMINI_API_KEY`: se crea en https://aistudio.google.com/apikey
   - `ANTHROPIC_API_KEY`: se crea en https://platform.claude.com/
3. Elige la IA principal con `AI_PROVIDER` (`gemini` o `claude`).
4. Reinicia `npm start` cada vez que cambies el `.env`.

El `.env` está en `.gitignore` y `.vercelignore`: nunca se sube a git ni a Vercel. No pegues claves en `index.html` ni en ningún archivo que llegue al navegador.

| Variable | Para qué | ¿Puede llegar al navegador? |
|---|---|---|
| `AI_PROVIDER` | IA principal: `gemini` o `claude` (por defecto `gemini`) | No |
| `GEMINI_API_KEY` | Clave de Gemini | **Nunca** |
| `GEMINI_MODEL` | Modelo de Gemini (vacío = `gemini-3.6-flash`; `gemini-3.8-flash` va muy lento en cuentas nuevas) | No |
| `GEMINI_MODEL_RESPALDO` | Modelo de Gemini que se usa si el principal está saturado (vacío = `gemini-3.5-flash`) | No |
| `GEMINI_TTS_MODEL` | Modelo de voz para los videos (vacío = `gemini-3.8-flash-lite-tts`; si está saturado, `gemini-3.8-flash-tts`) | No |
| `ANTHROPIC_API_KEY` | Clave de Claude | **Nunca** |
| `CLAUDE_MODEL` | Modelo de Claude (vacío = `claude-opus-5-5`) | No |
| `SUPABASE_URL` | URL del proyecto de Supabase | Sí, por `/api/config` |
| `SUPABASE_ANON_KEY` | Clave pública (anon) de Supabase | Sí, por `/api/config` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secreta de Supabase: se salta las reglas RLS | **Nunca** |
| `GUIONES_POR_HORA` | Guiones por IP y hora (10 por defecto) | No |
| `VOCES_POR_HORA` | Voces para videos por IP y hora (20 por defecto; un video de 30–60 s usa una) | No |
| `PORT` | Puerto local (3000 por defecto) | No |

`/api/config` solo devuelve `SUPABASE_URL` y `SUPABASE_ANON_KEY`. Si la anon key resulta ser una clave secreta (`sb_secret_…` o un JWT con rol `service_role`), no la envía y lo avisa en la consola del servidor.

## Cómo funciona la IA

- `api/guion.js` recibe la idea y las opciones (objetivo, tono, tipo de gancho, plataforma, duración y un dato real opcional), pide el guion a la IA principal y devuelve los bloques. Si la principal falla (error, saturación, bloqueo o respuesta vacía), lo intenta con la otra. Las claves solo viven en el servidor.
- La respuesta incluye `proveedor` (`gemini` o `claude`) para saber cuál contestó.
- Estructura de cada guion: gancho → promesa → desarrollo → giro → llamada. El formato sale del objetivo (guardar → Pasos o Lista, compartir → Antes y después, comentar → Opinión, seguir → Caso). Además devuelve 2 ganchos alternativos, la leyenda y una revisión calculada en el servidor (no la inventa la IA).
- En la portada (sección «Generador de Guiones AI en Vivo») cada visitante tiene 3 guiones gratis sin registrarse. Después, el botón lleva a crear cuenta.
- El generador del panel usa el mismo endpoint (5 créditos por guion, que de momento se guardan solo en el navegador).
- Límite de abuso: `GUIONES_POR_HORA` por IP. Se guarda en memoria, así que es una protección básica. Pon también límites de gasto en Google AI Studio y en la consola de Anthropic.
- En el plan gratis de Gemini cada modelo tiene un cupo diario para todo el proyecto (por ejemplo, 20 peticiones al día con `gemini-3.6-flash`). Con la web publicada, ese cupo se acaba rápido: activa la facturación en Google AI Studio.

## Videos

Debajo de cada guion, el botón «Crear video» abre un panel con la vista previa y la descarga.

- Reels / TikTok: video vertical 1080×1920. YouTube: horizontal 1920×1080. Carrusel: una imagen JPG de 1080×1350 por slide, en un ZIP.
- El video lleva el texto en pantalla de cada bloque, subtítulos con la palabra clave resaltada, un cambio visual cada 2,5 s, barra de progreso, música original sintetizada (sin derechos de autor) y la marca «Hecho con Flowy.ai».
- Se crea en el navegador del visitante (Canvas, Web Audio y WebCodecs con [Mediabunny](https://mediabunny.dev)), así que no gasta servidor. Mediabunny se descarga de jsDelivr solo al pulsar «Descargar MP4».
- Voz en off (opcional, 4 voces): `api/voz.js` pide la voz a Gemini de una sola vez para todo el guion (o en tramos de hasta 1.400 caracteres si es largo) y devuelve un WAV. El navegador sincroniza cada bloque con las pausas de la voz.
- En la portada el botón funciona también con el guion de ejemplo, sin gastar ninguno de los 3 guiones gratis.

## Probar

1. `npm start`. La consola dice qué IA es la principal y cuál el respaldo, por ejemplo `IA principal: gemini · respaldo: claude`.
2. Abre http://localhost:3000, ve a «Generador de Guiones AI en Vivo», escribe una idea y pulsa «Generar guion gratis».
3. Para ver qué IA contestó sin usar la web (PowerShell):

   ```powershell
   Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/guion -ContentType "application/json" -Body '{"idea":"3 errores al editar tu primer reel"}' | Select-Object proveedor, titulo
   ```

4. Para probar el respaldo sin tocar el `.env`, arranca con una clave de Gemini falsa (las variables de la terminal tienen prioridad sobre el `.env`). Debe contestar `claude`, y en la consola verás `[api/guion] gemini falló`:

   ```powershell
   $env:GEMINI_API_KEY = "clave-falsa"; npm start
   # al terminar:
   Remove-Item Env:GEMINI_API_KEY
   ```

## Publicar

La carpeta está lista para Vercel: `index.html` se sirve como estático y `api/guion.js`, `api/voz.js` y `api/config.js` como funciones. Añade las variables del `.env` en Settings → Environment Variables del proyecto (no subas el archivo).
