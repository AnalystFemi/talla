import { serve } from "@hono/node-server";
import app from "./index.js";

const port = Number(process.env.PORT || 8787);
// Pass process.env as Hono bindings (local equivalent of Worker env/secrets).
serve({ fetch: (req) => app.fetch(req, { ...process.env }), port },
  () => console.log(`talla-api listening on http://localhost:${port}`));
