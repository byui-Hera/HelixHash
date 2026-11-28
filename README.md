# HelixHash

HelixHash is a beginner-friendly DNA file screening demo. It reads FASTA files in the browser, creates anonymous codes from the DNA, and uses those codes to perform a simple risk check.

## How it works

The basic flow is:

1. You choose a FASTA file.
2. The browser reads the file on your computer.
3. The DNA is split into small pieces.
4. Each piece is turned into a long code called a hash.
5. Only the hashes are sent to the optional backend.
6. The dashboard displays a `SAFE` or `WARNING` result.

The original DNA file is not sent to the backend. This is the project's privacy-first design.

GitHub Pages should use the `frontend/` folder as its publishing source. Local hashing and the sample demo work without the backend; the optional risk check requires the local FastAPI server.

## Features

Local FASTA parsing, SHA-256 hashing, sample loading, SAFE/WARNING results, session reset, responsive layout, a tamper-evident audit log, and a local-only constellation visualization. When the optional backend is unavailable, the dashboard still shows a local SAFE result and verifies the browser audit chain.

## How the audit hash chain works

Each audit record stores its own `entry_hash` and the previous record's hash in `previous_hash`.

```text
Entry 1: hash(GENESIS + entry 1) = AAA
Entry 2: hash(AAA     + entry 2) = BBB
Entry 3: hash(BBB     + entry 3) = CCC
```

Think of the log as dominoes: changing an older record breaks the link to the next record. `Check audit log` detects the broken chain.

Python's built-in `hashlib.sha256` creates the stamps, which are stored in the SQLite `audit_log` table. Legacy rows without chain fields are backfilled once; existing stamped rows are not silently repaired during startup.

## Tamper & Verify demo mode

After at least one analysis, `Break Log demo` only alters the selected early, middle, or late row; it does not verify the result. `Check audit log` is a separate action that recomputes every row from oldest to newest. The next verification reports the first broken row; the constellation turns green for an intact chain and red when the audit chain is broken. `Reset Session` clears the browser chain and the local demo audit table so you can repeat the exercise.

The important distinction is that a changed row fails its own recomputed hash, while changing an earlier row also causes later links to fail when the verifier propagates the recomputed hash forward. The verifier checks both conditions for each row:

```text
previous_hash == hash saved by the preceding row
entry_hash == SHA-256(previous_hash + current audit fields)
```

## Run locally

From the `frontend/` folder, start the website:

```powershell
Set-Location frontend
python -m http.server 8000
```

Open <http://127.0.0.1:8000>. In a second terminal from the project root, start the optional backend:

```powershell
python -m pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8001
```

The API runs at <http://127.0.0.1:8001>.

## Try it

Open the website and click `Load Sample FASTA`. Review the hash results, start the backend for the optional SAFE/WARNING check, use `Check audit log` to verify history, and use `Reset Session` to clear the result.

This is a learning prototype, not a clinical screening system. The risk database contains demonstration data only.
