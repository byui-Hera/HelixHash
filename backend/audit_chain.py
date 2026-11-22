import hashlib
import json


def make_stamp(data: dict, prev_stamp: str) -> str:
    # Combine the log entry with the previous entry's stamp, then hash it
    payload = json.dumps(data, sort_keys=True) + prev_stamp
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# 1. Create a small chain of audit entries
logs = []
prev = "GENESIS"  # Starting stamp for the very first entry

entries = [
    {"id": 1, "status": "SAFE", "chunks_checked": 12},
    {"id": 2, "status": "WARNING", "chunks_checked": 8},
    {"id": 3, "status": "SAFE", "chunks_checked": 20},
]

for entry in entries:
    stamp = make_stamp(entry, prev)
    logs.append({"entry": entry, "prev_stamp": prev, "stamp": stamp})
    prev = stamp  # Next entry will use this stamp


def verify_chain(chain: list) -> bool:
    expected_prev = "GENESIS"
    for item in chain:
        # Check 1: Does this entry point to the right previous stamp?
        if item["prev_stamp"] != expected_prev:
            print(f"Tamper detected at log #{item['entry']['id']}: broken link.")
            return False

        # Check 2: Does recomputing this entry's stamp match what's saved?
        recomputed = make_stamp(item["entry"], item["prev_stamp"])
        if recomputed != item["stamp"]:
            print(f"Tamper detected at log #{item['entry']['id']}: entry data altered.")
            return False

        expected_prev = item["stamp"]

    print("Chain is valid: no entries have been tampered with.")
    return True


print("--- Before tampering ---")
verify_chain(logs)

# 2. Simulate someone sneaking in and changing log #1 from SAFE to WARNING
logs[0]["entry"]["status"] = "WARNING"

print("\n--- After tampering with log #1 ---")
verify_chain(logs)