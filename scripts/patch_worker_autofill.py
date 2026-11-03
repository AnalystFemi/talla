with open('talla/worker/src/index.js', 'r', encoding='utf-8') as f:
    text = f.read()

autofill_route = '''
app.post("/api/autofill", async (c) => {
  const body = await readJson(c);
  if (body === BAD_JSON || !body?.url) return c.json({ error: "Please enter a valid website URL" }, 400);
  let rawUrl = String(body.url).trim();
  if (!/^https?:\\/\\//i.test(rawUrl)) rawUrl = `https://${rawUrl}`;
  try {
    new URL(rawUrl);
  } catch {
    return c.json({ error: "Invalid website URL format" }, 400);
  }

  let text = "";
  if (has(c.env, "FIRECRAWL_API_KEY")) {
    try {
      text = await firecrawlScrape(c.env, rawUrl);
    } catch (e) {
      console.error("[autofill] firecrawl error:", e?.message || e);
    }
  }

  if (!text) {
    try {
      const res = await fetch(rawUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const html = await res.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\\/title>/i);
        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                          html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
        const cleanText = html.replace(/<script\\b[^<]*(?:(?!<\\/script>)<[^<]*)*<\\/script>/gi, "")
                              .replace(/<style\\b[^<]*(?:(?!<\\/style>)<[^<]*)*<\\/style>/gi, "")
                              .replace(/<[^>]+>/g, " ")
                              .replace(/\\s+/g, " ")
                              .trim()
                              .slice(0, 3000);
        text = `Title: ${titleMatch?.[1] || ""}\\nDescription: ${descMatch?.[1] || ""}\\nBody: ${cleanText}`;
      }
    } catch (e) {
      console.error("[autofill] direct fetch error:", e?.message || e);
    }
  }

  if (has(c.env, "BASETEN_API_KEY") && text.trim()) {
    try {
      const prompt = `You are a product researcher for a Nigerian video advertising platform. From the website content below, extract:
1. "name": Product or brand name (clean, 1-4 words)
2. "description": What it does and its key promise to customers (2-3 punchy, engaging sentences)
3. "category": 1-3 words (e.g. Business tools, Skincare, Fashion, Hair & Beauty, Food delivery, Logistics, Gadgets)
4. "audience": Target Nigerian customer persona (e.g. "WhatsApp & Instagram vendors in Lagos", "Lekki & Abuja professionals", "Everyday shoppers in Nigeria")

Return strictly JSON:
{
  "name": "...",
  "description": "...",
  "category": "...",
  "audience": "..."
}

Website content:
${text.slice(0, 3500)}`;

      const out = await basetenChat(c.env, [{ role: "user", content: prompt }], { json: true });
      if (out?.name) {
        return c.json({
          ok: true,
          name: String(out.name || "").trim(),
          description: String(out.description || "").trim(),
          category: String(out.category || "").trim(),
          audience: String(out.audience || "").trim()
        });
      }
    } catch (e) {
      console.error("[autofill] baseten error:", e?.message || e);
    }
  }

  try {
    const domain = new URL(rawUrl).hostname.replace(/^www\\./, "").split(".")[0];
    const capitalized = domain.charAt(0).toUpperCase() + domain.slice(1);
    const title = (text.match(/Title:\\s*([^|\\n-]+)/i)?.[1] || capitalized).trim();
    const desc = (text.match(/Description:\\s*([^\\n]+)/i)?.[1] || "").trim() ||
                 `${title} offers quality products and services built for everyday Nigerian customers.`;

    return c.json({
      ok: true,
      name: title,
      description: desc,
      category: "Business & Commerce",
      audience: "WhatsApp & Instagram buyers in Lagos"
    });
  } catch (err) {
    return c.json({ error: "Could not parse website details" }, 500);
  }
});
'''

target = 'app.post("/api/projects", async (c) => {'
assert target in text, "target not found"
text = text.replace(target, autofill_route + "\n" + target)

with open('talla/worker/src/index.js', 'w', encoding='utf-8') as f:
    f.write(text)

print("Worker index.js updated with /api/autofill endpoint!")
