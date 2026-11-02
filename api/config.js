/* ==========================================================
   FLOWY · api/config.js
   Configuración PÚBLICA para el navegador: solo la URL y la anon key
   de Supabase. Nunca la service role key ni las claves de IA.
   GET /api/config  →  { supabaseUrl, supabaseAnonKey }
   ========================================================== */
const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

/* La service role key se salta las reglas RLS: si por error está en SUPABASE_ANON_KEY, no se envía */
function esClaveSecreta(k) {
  if (k.startsWith("sb_secret_") || k === process.env.SUPABASE_SERVICE_ROLE_KEY) return true;
  try { return JSON.parse(Buffer.from(k.split(".")[1], "base64url").toString()).role === "service_role"; } catch { return false; }
}

export function GET() {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
  if (supabaseAnonKey && esClaveSecreta(supabaseAnonKey)) {
    console.error("[api/config] SUPABASE_ANON_KEY contiene una clave secreta: no se envía al navegador.");
    return json(500, { error: "La configuración de Supabase del servidor no es válida." });
  }
  return json(200, { supabaseUrl, supabaseAnonKey });
}
