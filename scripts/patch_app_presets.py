with open('talla/web/src/App.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update imports
old_import = 'import { AGENTS, EMPTY_FORM, ENGINES, FORMATS, LANGS, LANG_LABELS, PERSONAS, SAMPLE_PRODUCT,'
new_import = 'import { AGENTS, AUDIENCE_PRESETS, CATEGORY_PRESETS, EMPTY_FORM, ENGINES, FORMATS, LANGS, LANG_LABELS, PERSONAS, PRODUCT_PRESETS, SAMPLE_PRODUCT,'
assert old_import in text, "old_import not found"
text = text.replace(old_import, new_import)

# 2. Add handleAutofill function
autofill_fn = '''  const handleAutofill = async () => {
    if (!form.url.trim()) return;
    setBusy("autofill");
    setError("");
    try {
      const data = await api("/api/autofill", {
        method: "POST",
        body: JSON.stringify({ url: form.url.trim() })
      });
      if (data?.ok) {
        setForm((prev) => ({
          ...prev,
          name: data.name || prev.name,
          description: data.description || prev.description,
          category: data.category || prev.category,
          audience: data.audience || prev.audience,
        }));
      }
    } catch (err) {
      setError(err.message || "Could not autofill from that website.");
    } finally {
      setBusy("");
    }
  };
'''

# Place right above `const create = () => run("create", async () => {`
target_fn = '  const create = () => run("create", async () => {'
assert target_fn in text, "target_fn not found"
text = text.replace(target_fn, autofill_fn + "\n" + target_fn)

# 3. Add busy text for autofill
old_busy_text = 'const activeRunText = busy === "research" ? "Researcher is studying your market…"'
new_busy_text = 'const activeRunText = busy === "autofill" ? "Scanning website and extracting details…"\n    : busy === "research" ? "Researcher is studying your market…"'
assert old_busy_text in text, "old_busy_text not found"
text = text.replace(old_busy_text, new_busy_text)

# 4. Update welcome card templates
old_welcome = '''            {!project && <div className="welcome card">
              <div className="welcome-heads" aria-hidden="true">{AGENTS.map((a, i) => <img key={a.key} src={a.img} alt="" width="64" height="64" style={{ "--i": i }} />)}</div>
              <div className="welcome-copy">
                <h2>Your team is ready when you are</h2>
                <ol className="welcome-steps"><li><b>Describe</b> what you sell</li><li><b>Approve</b> the research &amp; storyboard</li><li><b>Film</b> in your customers&apos; language</li></ol>
              </div>
              <button type="button" className="btn ghost" onClick={() => setForm({ ...SAMPLE_PRODUCT })}>Try a sample product</button>
            </div>}'''

new_welcome = '''            {!project && <div className="welcome card">
              <div className="welcome-heads" aria-hidden="true">{AGENTS.map((a, i) => <img key={a.key} src={a.img} alt="" width="64" height="64" style={{ "--i": i }} />)}</div>
              <div className="welcome-copy">
                <h2>Your team is ready when you are</h2>
                <ol className="welcome-steps"><li><b>Describe</b> what you sell or paste a website URL</li><li><b>Approve</b> the research &amp; storyboard</li><li><b>Film</b> in your customers&apos; language</li></ol>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 14 }}>
                <span className="hint" style={{ fontWeight: 600 }}>Quick templates:</span>
                {PRODUCT_PRESETS.map((p) => (
                  <button key={p.name} type="button" className="btn small ghost" onClick={() => setForm({ ...p })}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>}'''

assert old_welcome in text, "old_welcome not found"
text = text.replace(old_welcome, new_welcome)

# 5. Update The Product form section with URL autofill and category presets
old_form_product = '''            <section className="card form-card"><h2 className="card-title">The product</h2>
              <div className="row"><div><label htmlFor="f-name">Product / brand name</label>
                <input id="f-name" value={form.name} onChange={set("name")} placeholder="e.g. Ori Glow shea butter" /></div>
                <div><label htmlFor="f-url">Or product / brand URL</label>
                  <input id="f-url" type="url" value={form.url} onChange={set("url")} placeholder="https://…" /></div></div>
              <label htmlFor="f-desc">What does it do? Who is it for?</label>
              <textarea id="f-desc" value={form.description} onChange={set("description")} placeholder="Describe the product, its promise, and the customer…" />
              <label htmlFor="f-cat">Or just a category</label>
              <input id="f-cat" value={form.category} onChange={set("category")} placeholder="e.g. skincare, hair, food delivery" />
            </section>'''

new_form_product = '''            <section className="card form-card"><h2 className="card-title">The product</h2>
              <div className="row">
                <div>
                  <label htmlFor="f-name">Product / brand name</label>
                  <input id="f-name" value={form.name} onChange={set("name")} placeholder="e.g. Ori Glow shea butter" />
                </div>
                <div>
                  <label htmlFor="f-url">Website URL (we will autofill everything)</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input id="f-url" type="url" value={form.url} onChange={set("url")} placeholder="https://yourbrand.com" style={{ flex: 1 }} />
                    <button
                      type="button"
                      className="btn small accent"
                      disabled={!form.url.trim() || busy === "autofill"}
                      onClick={handleAutofill}
                      title="Scrapes the website and fills product details"
                    >
                      {busy === "autofill" ? "Scanning…" : "⚡ Autofill"}
                    </button>
                  </div>
                </div>
              </div>
              <label htmlFor="f-desc">What does it do? Who is it for?</label>
              <textarea id="f-desc" value={form.description} onChange={set("description")} placeholder="Describe the product, its promise, and the customer…" />
              <label htmlFor="f-cat">Or pick a category (click any to select)</label>
              <input id="f-cat" value={form.category} onChange={set("category")} placeholder="e.g. skincare, hair, food delivery" />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {CATEGORY_PRESETS.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={"chip" + (form.category === cat ? " accent" : "")}
                    onClick={() => setForm({ ...form, category: cat })}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </section>'''

assert old_form_product in text, "old_form_product not found"
text = text.replace(old_form_product, new_form_product)

# 6. Update Who it's for section with audience presets
old_form_audience = '''            <section className="card form-card"><h2 className="card-title">Who it&apos;s for</h2>
              <label htmlFor="f-aud">Who is it for? (audience)</label>
              <input id="f-aud" value={form.audience} onChange={set("audience")} placeholder="e.g. Instagram/WhatsApp buyers in Lagos" />
              <fieldset className="lang-pills"><legend id="lang-legend">Language your customers speak</legend>'''

new_form_audience = '''            <section className="card form-card"><h2 className="card-title">Who it&apos;s for</h2>
              <label htmlFor="f-aud">Target customer audience (pick or type)</label>
              <input id="f-aud" value={form.audience} onChange={set("audience")} placeholder="e.g. Instagram/WhatsApp buyers in Lagos" />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, marginBottom: 14 }}>
                {AUDIENCE_PRESETS.map((aud) => (
                  <button
                    key={aud}
                    type="button"
                    className={"chip" + (form.audience === aud ? " accent" : "")}
                    onClick={() => setForm({ ...form, audience: aud })}
                  >
                    {aud}
                  </button>
                ))}
              </div>
              <fieldset className="lang-pills"><legend id="lang-legend">Language your customers speak</legend>'''

assert old_form_audience in text, "old_form_audience not found"
text = text.replace(old_form_audience, new_form_audience)

with open('talla/web/src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("App.jsx updated with presets and URL autofill!")
