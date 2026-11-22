import sqlite3
import hashlib
from datetime import datetime, timezone
from pathlib import Path


DB_PATH = Path(__file__).resolve().parent.parent / "helixhash.db"


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database() -> bool:
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS risk_hashes (
                hash_value TEXT PRIMARY KEY,
                label TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_log (
                audit_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                matched_chunks INTEGER NOT NULL,
                off_targets INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                previous_hash TEXT,
                entry_hash TEXT
            )
            """
        )
        columns = {row[1] for row in connection.execute("PRAGMA table_info(audit_log)")}
        if "previous_hash" not in columns:
            connection.execute("ALTER TABLE audit_log ADD COLUMN previous_hash TEXT")
        if "entry_hash" not in columns:
            connection.execute("ALTER TABLE audit_log ADD COLUMN entry_hash TEXT")

        rebuild_chain(connection)
        connection.execute(
            "INSERT OR IGNORE INTO risk_hashes (hash_value, label) VALUES (?, ?)",
            ("demo-risk-hash", "Learning-only demo record"),
        )
    return True


def find_matches(hashes: list[str]) -> list[str]:
    if not hashes:
        return []
    placeholders = ", ".join(["?"] * len(hashes))
    with get_connection() as connection:
        rows = connection.execute(
            f"SELECT hash_value FROM risk_hashes WHERE hash_value IN ({placeholders})",
            hashes,
        ).fetchall()
    return [row["hash_value"] for row in rows]


def save_audit(audit_id: str, status: str, matched_chunks: int, off_targets: int) -> dict[str, str]:
    created_at = datetime.now(timezone.utc).isoformat()
    with get_connection() as connection:
        previous = connection.execute(
            "SELECT entry_hash FROM audit_log ORDER BY rowid DESC LIMIT 1"
        ).fetchone()
        previous_hash = previous["entry_hash"] if previous else "GENESIS"
        entry_hash = make_entry_hash(
            previous_hash, audit_id, status, matched_chunks, off_targets, created_at
        )
        connection.execute(
            """
            INSERT INTO audit_log
                (audit_id, status, matched_chunks, off_targets, created_at, previous_hash, entry_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (audit_id, status, matched_chunks, off_targets, created_at, previous_hash, entry_hash),
        )

    return {"audit_id": audit_id, "entry_hash": entry_hash, "previous_hash": previous_hash}


def make_entry_hash(previous_hash: str, audit_id: str, status: str, matched_chunks: int,
                    off_targets: int, created_at: str) -> str:
    payload = "|".join(
        [previous_hash, audit_id, status, str(matched_chunks), str(off_targets), created_at]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def rebuild_chain(connection: sqlite3.Connection) -> None:
    """Backfill chain stamps for audit rows created before chain support existed."""
    rows = connection.execute(
        "SELECT rowid, audit_id, status, matched_chunks, off_targets, created_at, previous_hash, entry_hash "
        "FROM audit_log ORDER BY rowid"
    ).fetchall()
    previous_hash = "GENESIS"
    for row in rows:
        entry_hash = row["entry_hash"]
        if not row["previous_hash"] or not entry_hash:
            entry_hash = make_entry_hash(
                previous_hash, row["audit_id"], row["status"], row["matched_chunks"],
                row["off_targets"], row["created_at"]
            )
            connection.execute(
                "UPDATE audit_log SET previous_hash = ?, entry_hash = ? WHERE rowid = ?",
                (previous_hash, entry_hash, row["rowid"]),
            )
        previous_hash = entry_hash


def get_audit_log() -> list[dict]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT audit_id, status, matched_chunks, off_targets, created_at, previous_hash, entry_hash "
            "FROM audit_log ORDER BY rowid DESC"
        ).fetchall()
    return [dict(row) for row in rows]


def verify_audit_log() -> dict[str, object]:
    entries = list(reversed(get_audit_log()))
    previous_hash = "GENESIS"
    for index, entry in enumerate(entries, start=1):
        expected_hash = make_entry_hash(
            previous_hash, entry["audit_id"], entry["status"], entry["matched_chunks"],
            entry["off_targets"], entry["created_at"]
        )
        if entry["previous_hash"] != previous_hash or entry["entry_hash"] != expected_hash:
            return {"valid": False, "checked": len(entries), "broken_at": index}
        previous_hash = entry["entry_hash"]
    return {"valid": True, "checked": len(entries), "broken_at": None}
