# HelixHash

HelixHash is a privacy-focused prototype. The browser parses and hashes FASTA data locally; the Python API currently provides a health check.

## Project layout

```text
HelixHash/
├── index.html
├── app.js
├── styles.css
├── sample.fasta
├── requirements.txt
└── backend/
    ├── __init__.py
    └── main.py
```

## Run the frontend

From the project folder:

```powershell
python -m http.server 8000
```

Open http://localhost:8000.

## Run the backend

Open a second terminal in the project folder:

```powershell
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8001
```

Check the API at http://127.0.0.1:8001/health. It should return `{"status":"ok"}`.

The frontend uses port 8000 and the backend uses port 8001 so both can run at the same time.
