from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from uuid import uuid4

from .database import find_matches, get_audit_log, initialize_database, save_audit, verify_audit_log

app = FastAPI(title="HelixHash API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class HashRequest(BaseModel):
    hashes: list[str]


# Learning-only placeholder. Never use this as a real medical risk database.
DEMO_RISK_HASHES = {"demo-risk-hash"}
AUDIT_LOG: list[dict[str, str | int]] = []


@app.on_event("startup")
def startup() -> None:
    """Create MySQL tables when a configured database is available."""
    initialize_database()


@app.get("/health")
def health_check() -> dict[str, str]:
    """Return a small response to confirm that the API is running."""
    return {"status": "ok"}


@app.post("/hashes")
def receive_hashes(request: HashRequest) -> dict[str, int | str]:
    """Receive anonymous hashes without receiving raw DNA."""
    database_matches = find_matches(request.hashes)
    matches = (
        database_matches
        if database_matches is not None
        else [item for item in request.hashes if item in DEMO_RISK_HASHES]
    )
    audit_id = str(uuid4())
    result_status = "WARNING" if matches else "SAFE"
    AUDIT_LOG.append({"audit_id": audit_id, "status": result_status})
    chain_record = save_audit(audit_id, result_status, len(matches), 0)
    return {
        "status": result_status,
        "received": len(request.hashes),
        "matched_chunks": len(matches),
        "off_targets": 0,
        "audit_id": audit_id,
        "entry_hash": chain_record["entry_hash"],
    }


@app.get("/audit-log")
def audit_log() -> list[dict]:
    return get_audit_log()


@app.get("/audit-log/verify")
def audit_log_verify() -> dict[str, object]:
    return verify_audit_log()
