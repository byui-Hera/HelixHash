import sqlite3
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
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
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


def save_audit(audit_id: str, status: str, matched_chunks: int, off_targets: int) -> None:
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO audit_log (audit_id, status, matched_chunks, off_targets)
            VALUES (?, ?, ?, ?)
            """,
            (audit_id, status, matched_chunks, off_targets),
        )
