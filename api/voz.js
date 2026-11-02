/* ==========================================================
   FLOWY · api/voz.js
   Pone voz al guion con Gemini (texto a voz).
   El video se monta en el navegador; aquí solo se genera el audio,
   así la clave GEMINI_API_KEY nunca sale del servidor.
   POST /api/voz  { texto, voz }  →  audio/wav
   El navegador manda varios bloques juntos (separados por una línea en
   blanco) y luego sincroniza cada bloque con las pausas de la voz.
   Formato de función de Vercel (export POST); en local lo sirve server.js.
   ========================================================== */
import { GoogleGenAI, ApiError as GeminiError } from "@google/genai";

// Si el modelo principal está saturado, se prueba el de respaldo
const VOZ_MODELOS = [...new Set([process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"])];
// Se cuenta por petición: un video de 30–60 s usa una
const LIMITE_POR_HORA = Number(process.env.VOCES_POR_HORA || 20);
// ~80 s de voz: el WAV queda por debajo de los 4,5 MB que admite una respuesta en Vercel
const MAX_CARACTERES = 1400;

/* Las mismas voces que muestra el panel de video */
const VOCES = ["Puck", "Kore", "Sulafat", "Achird"];

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

/* ---------- Límite de voces por IP (en memoria) ---------- */
const usos = new Map();
function consumir(ip) {
  const desde = Date.now() - 3600e3;
  if (usos.size > 5000) for (const [k, v] of usos) if (v.every((t) => t <= desde)) usos.delete(k);
  const lista = (usos.get(ip) || []).filter((t) => t > desde);
  usos.set(ip, lista);
  if (lista.length >= LIMITE_POR_HORA) return false;
  lista.push(Date.now());
  return true;
}
const liberar = (ip) => { const l = usos.get(ip); if (l) l.pop(); };

/* Algunos modelos devuelven PCM sin cabecera (audio/L16;rate=24000): se envuelve en WAV */
function aWav(pcm, mime) {
  if (/wav/i.test(mime)) return pcm;
  const rate = Number(/rate=(\d+)/i.exec(mime)?.[1] || 24000);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

let gemini;
async function hablar(texto, voz) {
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: 90_000 } });
  for (const [i, model] of VOZ_MODELOS.entries()) {
    let r;
    try {
      // Solo el texto: con instrucciones de estilo el modelo habla mucho más lento
      r = await gemini.models.generateContent({
        model,
        contents: texto,
        config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } } }
      });
    } catch (e) {
      const saturado = e instanceof GeminiError && [429, 500, 503, 504].includes(e.status);
      if (!saturado || i === VOZ_MODELOS.length - 1) throw e;
      console.error(`[api/voz] ${model} saturado (${e.status}), pruebo ${VOZ_MODELOS[i + 1]}`);
      continue;
    }
    const audio = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!audio) return null;
    return aWav(Buffer.from(audio.data, "base64"), audio.mimeType || "");
  }
}

export async function POST(request) {
  let datos;
  try { datos = await request.json(); } catch { return json(400, { error: "Petición no válida." }); }

  const texto = typeof datos?.texto === "string" ? datos.texto.trim() : "";
  if (!texto) return json(400, { error: "Falta el texto del guion." });
  if (texto.length > MAX_CARACTERES) return json(400, { error: `El texto es demasiado largo para una sola voz (máximo ${MAX_CARACTERES} caracteres).` });
  const voz = VOCES.includes(datos.voz) ? datos.voz : VOCES[0];

  if (!process.env.GEMINI_API_KEY) return json(500, { error: "La voz no está configurada en el servidor (falta GEMINI_API_KEY)." });

  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  if (!consumir(ip)) return json(429, { error: "Has llegado al límite de voces por ahora. Descarga el video sin voz o vuelve en un rato." });

  try {
    const wav = await hablar(texto, voz);
    if (!wav) { liberar(ip); return json(502, { error: "La voz llegó vacía. Inténtalo de nuevo." }); }
    return new Response(wav, { status: 200, headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/voz] falló:", e?.message || e);
    liberar(ip);
    if (e instanceof GeminiError && (e.status === 401 || e.status === 403)) return json(500, { error: "La clave de la IA no es válida. Revisa GEMINI_API_KEY en el servidor." });
    if (e instanceof GeminiError && [429, 503].includes(e.status)) return json(503, { error: "La voz está muy solicitada ahora. Prueba en un minuto." });
    return json(502, { error: "No pudimos generar la voz. Inténtalo de nuevo." });
  }
}
