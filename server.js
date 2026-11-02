/* ==========================================================
   FLOWY · server.js
   Servidor local: sirve index.html y las APIs.
   Uso:  npm start  →  http://localhost:3000
   ========================================================== */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { POST as generarGuion, proveedoresActivos } from "./api/guion.js";
import { GET as configPublica } from "./api/config.js";

const PORT = Number(process.env.PORT || 3000);
const INDEX = new URL("./index.html", import.meta.url);

const enviar = async (res, r) => res.writeHead(r.status, Object.fromEntries(r.headers)).end(Buffer.from(await r.arrayBuffer()));

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));

    if (url.pathname === "/api/guion") {
      if (req.method !== "POST") { res.writeHead(405, { Allow: "POST" }).end(); return; }
      const partes = []; let peso = 0;
      for await (const c of req) {
        peso += c.length;
        if (peso > 16384) { res.writeHead(413).end(); return; }
        partes.push(c);
      }
      await enviar(res, await generarGuion(new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": req.socket.remoteAddress || "local" },
        body: Buffer.concat(partes)
      })));
      return;
    }

    if (url.pathname === "/api/config") {
      if (req.method !== "GET") { res.writeHead(405, { Allow: "GET" }).end(); return; }
      await enviar(res, configPublica());
      return;
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(await readFile(INDEX));
      return;
    }

    if (url.pathname === "/favicon.ico") { res.writeHead(204).end(); return; }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("No encontrado");
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500).end();
  }
}).listen(PORT, () => {
  console.log("Flowy listo en http://localhost:" + PORT);
  const ia = proveedoresActivos();
  if (ia.length) console.log("IA principal: " + ia[0] + (ia[1] ? " · respaldo: " + ia[1] : " · sin respaldo (falta la clave del otro proveedor)"));
  else console.warn("Aviso: faltan GEMINI_API_KEY y ANTHROPIC_API_KEY en .env — la web carga, pero la IA no generará guiones.");
});
