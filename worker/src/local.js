import { serve } from "@hono/node-server";
import app from "./index.js";

const port = Number(process.env.PORT || 8787);
// Pass process.env as Hono bindings (local equivalent of Worker env/secrets).
// No DB/MEDIA bindings locally -> in-memory storage + inline data-URL stills.
// A minimal executionCtx keeps any waitUntil() use from throwing under Node.
const executionCtx = { waitUntil: (p) => { Promise.resolve(p).catch((e) => console.error("[waitUntil]", e)); }, passThroughOnException() {}, props: {} };
serve({ fetch: (req) => app.fetch(req, { ...process.env }, executionCtx), port },
  () => console.log(`talla-api listening on http://localhost:${port} (access: ${process.env.TALLA_DEV_OPEN === "1" ? "DEV OPEN" : process.env.TALLA_ACCESS_CODE ? "code required" : "demo-only"})`));
