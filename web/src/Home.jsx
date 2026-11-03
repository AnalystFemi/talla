import { useEffect, useRef, useState } from "react";
import { AGENTS, PIPELINE } from "./content.js";

const byKey = Object.fromEntries(AGENTS.map((a) => [a.key, a]));
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" });

const Head = ({ k }) => <img className="h-head" src={byKey[k].img} alt="" width="320" height="380" />;

// Talla's own mark: indigo speech bubble + coral dot, lowercase wordmark.
export function Logo({ onClick, label }) {
  const inner = (<><svg className="logo-mark" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
    <path d="M15 4C8.4 4 3 8.9 3 15c0 3.4 1.7 6.4 4.4 8.4L6.5 29l5.6-3c.9.2 1.9.3 2.9.3 6.6 0 12-4.9 12-11S21.6 4 15 4z" fill="var(--accent)" />
    <circle cx="10" cy="15.2" r="1.7" fill="#fff" /><circle cx="15" cy="15.2" r="1.7" fill="#fff" />
    <circle cx="26" cy="7" r="4.2" fill="var(--coral)" stroke="#fff" strokeWidth="1.6" />
  </svg><span className="logo-word">talla</span></>);
  return onClick
    ? <button type="button" className="logo" aria-label={label} onClick={onClick}>{inner}</button>
    : <span className="logo" aria-label="Talla">{inner}</span>;
}

// Thin Ankara-style geometric strip (inline SVG pattern, see .ankara in styles.css).
export const Ankara = ({ className = "" }) => <div className={"ankara " + className} aria-hidden="true" />;

// Adds .in to every .reveal element as it scrolls into view (staggered via --i).
function useReveal() {
  useEffect(() => {
    const els = [...document.querySelectorAll(".reveal")];
    if (reducedMotion() || !("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return undefined; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    }), { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
}

// The illustrative rcpt run shown in the hero panel — types in message by message, on a loop.
const THREAD = [
  { who: "me", text: "Make a Pidgin UGC video for rcpt — receipts for WhatsApp & Instagram vendors in Lagos." },
  { who: "researcher", text: "Found 3 pain points for rcpt: buyers don't trust vendors without a proper receipt, handwritten ones look unserious, and sales get lost in chats." },
  { who: "scriptwriter", text: "Storyboard ready — confession format, 6 scenes. Hook in Pidgin: “I no dey send receipt before. Na why customers no trust me.”", cards: true },
  { who: "me", text: "Approved. Film scene 1 first." },
  { who: "voice", text: "Scene 1 voiced in Nigerian Pidgin. Handing it to the Editor." },
  { who: "critic", label: "Critic · advisory", text: "Note on the plan: scene 3's line is long for a ~5 second clip — trim it so the voice doesn't rush." },
  { who: "editor", text: "Filming scene 1 (portrait 9:16), then stitching the captions." },
];
const SCENES = [["1", "Hook", "Close-up, talking to camera"], ["2", "Pain", "Scrolling unpaid WhatsApp chats"], ["3", "Switch", "Opens rcpt on her phone"], ["4", "Proof", "Branded receipt, real screen"]];

function DemoPanel() {
  const [shown, setShown] = useState(() => (reducedMotion() ? THREAD.length : 1));
  const [typing, setTyping] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (reducedMotion()) return undefined;
    let visible = true;
    const io = "IntersectionObserver" in window ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; }) : null;
    if (io && root.current) io.observe(root.current);
    let n = 1; let t;
    const step = () => {
      if (!visible) { t = setTimeout(step, 800); return; }
      if (n >= THREAD.length) { t = setTimeout(() => { n = 1; setShown(1); setTyping(false); t = setTimeout(step, 900); }, 4200); return; }
      setTyping(true);
      t = setTimeout(() => { n += 1; setShown(n); setTyping(false); t = setTimeout(step, 1300); }, 1100);
    };
    t = setTimeout(step, 1200);
    return () => { clearTimeout(t); io?.disconnect(); };
  }, []);
  const msgs = THREAD.slice(0, shown);
  const next = THREAD[shown];
  const lastAgent = [...msgs].reverse().find((m) => m.who !== "me")?.who;
  const activeKey = typing && next && next.who !== "me" ? next.who : lastAgent || "researcher";
  const active = byKey[activeKey];
  // The thread renders a fixed window of the last 3 messages plus the typing
  // row. Older messages leave the DOM (with a 300ms fade handled by .msg-out),
  // so a new message can never paint over the previous tail mid-animation.
  const windowed = msgs.slice(-3);
  return (
    <div className="app-demo" ref={root} role="img" aria-label="Illustrative example: the Talla team turning rcpt into a Pidgin UGC video">
      <aside className="demo-side">
        <p className="demo-side-title">Your agents</p>
        {AGENTS.map((a) => (
          <div className={"demo-agent" + (a.key === activeKey ? " on" : "")} key={a.key}>
            <img src={a.img} alt="" width="34" height="34" />
            <div><b>{a.name}</b><span>{a.key === activeKey && typing ? "Working…" : a.status}</span></div>
          </div>))}
      </aside>
      <div className="demo-chat">
        <div className="demo-head">
          <div className="demo-badge"><img key={activeKey} src={active.img} alt="" width="56" height="56" />
            <div><b>{active.name}</b><span>{active.short}</span></div></div>
          <p className="demo-time"><span className="live-dot" /> Example run · Today at 10:15 AM</p>
        </div>
        <div className="demo-thread" aria-hidden="true">
          {windowed.map((m) => { const gi = msgs.indexOf(m); return m.who === "me"
            ? <div className="demo-msg me" key={gi}><p>{m.text}</p></div>
            : <div key={gi}>
                <div className="demo-msg"><img src={byKey[m.who].img} alt="" width="28" height="28" />
                  <p><b>{m.label || byKey[m.who].name}</b>{m.text}</p></div>
                {m.cards && <div className="demo-cards">{SCENES.map(([n, t, d]) => (
                  <div className="demo-card" key={n}><span>Scene {n}</span><b>{t}</b><small>{d}</small></div>))}</div>}
              </div>; })}
          {typing && next && <div className={"demo-msg typing" + (next.who === "me" ? " me" : "")}>
            {next.who !== "me" && <img src={byKey[next.who].img} alt="" width="28" height="28" />}
            <p><span className="dots"><span></span><span></span><span></span></span></p></div>}
        </div>
      </div>
    </div>
  );
}

const HANDOFF = [
  ["Market research", "researcher", "Your Researcher finds the pain points, hooks and angles that sell in your category — no link hunting."],
  ["Scripts in your customers' language", "scriptwriter", "Hooks and scenes written in Pidgin, Yoruba, Hausa, Igbo or Nigerian English, one idea per scene."],
  ["Voices in Pidgin, Yoruba, Hausa & Igbo", "voice", "Natural West African voices speak every line in Pidgin, Yoruba, Hausa, or Igbo. The first voiced scene is verified against your script."],
  ["Filming without a shoot", "editor", "Persona-locked creator portraits, lip-synced to the voice with realistic product cutaways."],
  ["A second opinion on every scene", "critic", "The Critic leaves advisory notes on each scene's plan and spoken line. It never blocks a run — you decide."],
  ["Captions & posting", "editor", "Captions burnt in, 9:16 for TikTok, Reels and Shorts — plus a caption and 5–8 hashtags to paste. No auto-posting."],
];

function HandOff({ go }) {
  const [open, setOpen] = useState(0);
  const agent = byKey[HANDOFF[open][1]];
  return (
    <section className="sec sec-111" id="handoff">
      <div className="wrap">
        <h2 className="h2 center reveal">What you can hand off</h2>
        <div className="handoff">
          <div>
            <h3 className="handoff-title">For Nigerian businesses</h3>
            <ul className="handoff-list">
              {HANDOFF.map(([t, , d], i) => (
                <li key={t} className={i === open ? "on" : ""}>
                  <button type="button" aria-expanded={i === open} aria-controls={`ho-${i}`} onClick={() => setOpen(i)}
                    onMouseEnter={() => setOpen(i)} onFocus={() => setOpen(i)}>
                    <span className="arrow" aria-hidden="true">→</span>{t}</button>
                  <p id={`ho-${i}`} hidden={i !== open}>{d}</p>
                </li>))}
            </ul>
            <button className="btn accent" onClick={() => go("studio")}>Hand it off</button>
          </div>
          <div className="handoff-art" aria-hidden="true">
            <img key={open} src={agent.lg} alt="" width="800" height="800" loading="lazy" />
            <span>{agent.name}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home({ go }) {
  useReveal();
  return (<div className="home">
    <header className="site-nav">
      <div className="nav-inner">
        <Logo />
        <nav className="nav-links" aria-label="Main">
          <a href="#team" onClick={(e) => { e.preventDefault(); scrollTo("team"); }}>Team</a>
          <a href="#how" onClick={(e) => { e.preventDefault(); scrollTo("how"); }}>How it works</a>
          <a href="#handoff" onClick={(e) => { e.preventDefault(); scrollTo("handoff"); }}>What you hand off</a>
        </nav>
        <div className="nav-right">
          <button type="button" className="nav-text" onClick={() => go("studio")}>Open Studio</button>
          <button type="button" className="btn small" onClick={() => go("studio")}>Start creating</button>
        </div>
      </div>
    </header>

    <main>
      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="wrap hero-inner">
          <h1 className="hero-h1">Your <Head k="researcher" /> product, researched <Head k="scriptwriter" /> storyboarded
            and <Head k="voice" /> filmed by your <Head k="critic" /><Head k="editor" /> AI&nbsp;UGC&nbsp;team</h1>
          <p className="hero-sub">No creators, no camera, no editor. You approve the plan — Talla&apos;s agents research, script, voice and film your advert in Pidgin, Yoruba, Hausa, Igbo or Nigerian English.</p>
          <div className="hero-ctas">
            <button className="btn accent big" onClick={() => go("studio")}>Create my first video</button>
            <button className="btn ghost big" onClick={() => scrollTo("team")}>Meet the team</button>
          </div>
          <DemoPanel />
        </div>
      </section>

      <section className="team-sec" id="team">
        <Ankara className="team-edge" />
        <div className="wrap">
          <h2 className="h2 center reveal">Meet your team</h2>
          <p className="lead center reveal">From product to post, five specialists hand work to each other — and you approve the storyboard before a single credit is spent on video.</p>
          <div className="team-cards">
            {AGENTS.map((a, i) => (
              <div className="team-card reveal" style={{ "--i": i }} key={a.key}>
                <img src={a.img} alt="" width="56" height="56" loading="lazy" />
                <h3>{a.name}</h3><p>{a.short}</p>
              </div>))}
          </div>
        </div>
        <div className="peek" aria-hidden="true">
          {AGENTS.map((a, i) => <div className="peek-item reveal" style={{ "--i": i }} key={a.key}><img src={a.lg} alt="" width="800" height="800" loading="lazy" /></div>)}
        </div>
        <div className="center team-cta"><button className="btn accent big" onClick={() => go("studio")}>Create my first video</button></div>
      </section>

      <section className="sec sec-111">
        <div className="wrap">
          <div className="split-head reveal">
            <h2 className="h2">A specialist<br />for every stage<br />of your advert</h2>
            <p className="body-l">Each agent does one job and hands it on. Under the hood: AI creative intelligence plans and critiques, photorealistic portrait engines shoot the stills, vision checks verify them, natural West African voices speak, high-fidelity lip sync brings the creator to life and audio QA verifies the words.</p>
          </div>
          <div className="spec-grid">
            {[
              ["Research that knows your buyers", "Pain points, hooks and angles for your category — before a single scene is planned.", "researcher", "Top hook for rcpt: “Customer ask for receipt, I no get. E shame me.”", "10:15 AM"],
              ["Scripts in your customers' language", "Pidgin, Yoruba, Hausa, Igbo or Nigerian English — spoken with authentic local cadence.", "voice", "Scene 1 voiced in Pidgin. Ready for film.", "10:21 AM"],
              ["Review before you spend", "You approve the storyboard first. The Critic leaves advisory notes on each scene's plan and script.", "critic", "Trim scene 3 — too long for ~5 seconds.", "10:24 AM"],
            ].map(([t, d, k, msg, time], i) => (
              <div className="spec-card reveal" style={{ "--i": i }} key={t}>
                <h3>{t}</h3><p>{d}</p>
                <div className="spec-bubble"><img src={byKey[k].img} alt="" width="48" height="48" loading="lazy" />
                  <div><span className="bub">{msg}</span><small>{time}</small></div></div>
              </div>))}
          </div>
        </div>
      </section>

      <section className="sec sec-1d statement">
        <div className="wrap center">
          <div className="stack-pill reveal" aria-hidden="true">{AGENTS.map((a) => <img key={a.key} src={a.img} alt="" width="40" height="40" loading="lazy" />)}</div>
          <h2 className="statement-h reveal">General-purpose AI does a bit of everything.<br /><span>Talla only makes <u>Nigerian</u> UGC.</span></h2>
          <button className="btn accent big" onClick={() => go("studio")}>Start creating</button>
        </div>
      </section>

      <Ankara />

      <section className="sec sec-000" id="how">
        <div className="wrap how">
          <div className="reveal">
            <h2 className="h2">How it works</h2>
            <p className="body-l">Product in, posting package out. Every stage is visible and reviewable, and nothing paid runs until you approve the storyboard.</p>
            <button className="btn accent" onClick={() => go("studio")}>Open the Studio</button>
          </div>
          <ol className="pipeline reveal">
            {PIPELINE.map(([t, d], i) => (
              <li key={t}><span className="num">{String(i + 1).padStart(2, "0")}</span><div><b>{t}</b><small>{d}</small></div></li>))}
          </ol>
        </div>
      </section>

      <HandOff go={go} />

      <Ankara />

      <section className="final">
        <div className="wrap center">
          <h2 className="final-h reveal">Your next product<br />is the team&apos;s first job.</h2>
          <button className="btn accent big" onClick={() => go("studio")}>Start creating</button>
        </div>
        <div className="wordmark" aria-hidden="true">
          <span>talla</span>
          {/* Heads sit in the gaps AROUND the wordmark, never over the "t"/"a":
              two flanking left, two flanking right, bottoms tucked below the
              baseline so the word stays readable at every width. */}
          <img className="wm wm1" src={byKey.researcher.lg} alt="" width="800" height="800" loading="lazy" />
          <img className="wm wm2" src={byKey.critic.lg} alt="" width="800" height="800" loading="lazy" />
          <img className="wm wm3" src={byKey.scriptwriter.lg} alt="" width="800" height="800" loading="lazy" />
          <img className="wm wm4" src={byKey.editor.lg} alt="" width="800" height="800" loading="lazy" />
        </div>
      </section>
    </main>

    <footer className="site-foot">
      <div className="wrap foot-inner">
        <div><Logo /><p>Research in detail. Film in your language.</p></div>
        <div className="foot-links">
          <button type="button" onClick={() => go("studio")}>Studio</button>
          <button type="button" onClick={() => scrollTo("team")}>Team</button>
          <button type="button" onClick={() => scrollTo("how")}>How it works</button>
        </div>
      </div>
      <div className="wrap foot-bottom">© 2026 Talla. Built for West African social commerce. All rights reserved.</div>
    </footer>
  </div>);
}
