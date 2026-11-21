# HelixHash — Step 1

This prototype demonstrates the privacy boundary in the workflow: a FASTA file is parsed, split into chunks, and hashed with SHA-256 entirely in the browser.

## Run it

Open `index.html` in a modern browser. Because this step uses the browser Web Crypto API, use `http://localhost` if a browser blocks cryptography for local files.

From this directory, one option is:

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Current assumptions

- Chunks are 100 bases long.
- FASTA headers begin with `>` and are ignored.
- Only `A`, `C`, `G`, `T`, and `N` are retained.
- No network request is made by this prototype.
