# REA Diagnosis — 28 Oct 2026

Ran: `npx -y rea-agents@latest doctor --client opencode --json`
Then: `npx -y rea-agents@latest setup --client opencode --dry-run --json`

## Findings
- REA CLI v6.8.0 works via npx; no `rea` on PATH.
- **OpenCode MCP registration: MISSING** (`C:\Users\DELL\.config\opencode\opencode.jsonc`). REA MCP is not connected to this session.
- **Node too old:** v22.19.0 installed; REA needs >=22.23.4 (or 24.x). Dry-run setup returns `needs_human` and refuses to plan writes until Node is upgraded.
- Shared skill copy missing at `C:\Users\DELL\.agents\skills\reverse-engineer-anything` (a copy exists in the parent workspace `.agents/`). Setup would repair it.
- Hopper/Ghidra/IDA/JADX unavailable — **not needed** for Ava: Ava is a web/JS target; REA static JavaScript inspection needs no native engine.

## To unblock (user approval + restart required)
1. Upgrade Node to >=22.23.4 (e.g. `winget upgrade OpenJS.NodeJS.LTS` or nodejs.org installer).
2. `npx -y rea-agents@latest setup --client opencode --yes` (writes OpenCode MCP config; backs up first per REA design).
3. Restart OpenCode; verify REA tools appear.
4. Then analyse Ava's public/account flow + Ava MCP (`AVA_API_KEY`) and write patterns into `worker/src/agents.js` Researcher prompts.

Until then: Researcher uses the brief's category intelligence + Exa/Firecrawl. This does not block the product build.
