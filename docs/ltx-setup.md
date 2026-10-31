# Unlocking LTX 2.5 for Talla (about 2 minutes, done by the owner)

## Why LTX failed
The Talla Modal app downloads `Lightricks/LTX-2.5-Diffusers` from Hugging Face.
That repo is **gated**: Hugging Face only serves it to accounts that have accepted Lightricks' licence.
The token Modal uses belongs to the Hugging Face account **FemiML**, and FemiML hasn't accepted yet.
So every download returned `403 GatedRepoError`, and LTX never started rendering.
The gate is set to **auto-approve**, so access is granted the moment you accept.

## Steps
1. Open https://huggingface.co/login and sign in as **FemiML**.
   It must be this account, because it owns the token that Modal's `huggingface-secret` holds.
2. Open https://huggingface.co/Lightricks/LTX-2.5-Diffusers
3. A box near the top says *"You need to agree to share your contact information to access this model"*.
   - Read the licence. It's the LTX-2 community licence; check its commercial-use terms before any paid launch.
   - Fill in the short form, then click **"Agree and access repository"**.
4. Refresh the page. The box now says **"You have been granted access to this model"**, and the "Files and versions" tab opens.
5. Tell Claude "LTX access done". Claude then re-runs the LTX calibration with `node scripts/calibrate_engines.mjs --only=ltx`.
   You don't need to change any token or secret.

## Only if you'd rather use a different Hugging Face account
1. On that account, do steps 2–4 above.
2. Create a **read** token at https://huggingface.co/settings/tokens.
3. Replace the Modal secret. Use the Modal dashboard (Secrets → `huggingface-secret` → edit, key `HF_TOKEN`) so the token never appears in a terminal.
4. Tell Claude. The Wan app picks up the new secret on its next container start; no redeploy is needed.

## What it costs once unlocked
- The first LTX run downloads roughly 40–60 GB of weights into the `talla-weights` volume. That's a one-off cold start of several minutes on an A100-80GB.
- After that, the weights load from the volume.
- The cost per clip is measured by the calibration run and recorded in `data/calibration_engines.json`.
