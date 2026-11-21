// Small chunks make the hashing process easier to observe while learning.
const CHUNK_SIZE = 5;

const fileInput = document.querySelector("#fasta-file");
const fileName = document.querySelector("#file-name");
const hashButton = document.querySelector("#hash-button");
const status = document.querySelector("#status");
const privacyNote = document.querySelector("#privacy-note");
const results = document.querySelector("#results");
const sequenceLength = document.querySelector("#sequence-length");
const chunkCount = document.querySelector("#chunk-count");
const safetyStatus = document.querySelector("#safety-status");
const matchedChunks = document.querySelector("#matched-chunks");
const offTargets = document.querySelector("#off-targets");
const auditId = document.querySelector("#audit-id");
const hashList = document.querySelector("#hash-list");
const statusDot = document.querySelector(".status-dot");
const STORAGE_KEY = "helixhash:last-result";

let selectedFile = null;

fileInput.addEventListener("change", () => {
  selectedFile = fileInput.files[0] ?? null;
  fileName.textContent = selectedFile ? selectedFile.name : "No file selected.";
  hashButton.disabled = !selectedFile;
  status.textContent = selectedFile ? "Ready to hash locally" : "Waiting for a file";
  statusDot.classList.toggle("ready", Boolean(selectedFile));
  results.hidden = true;
});

hashButton.addEventListener("click", async () => {
  if (!selectedFile) return;

  hashButton.disabled = true;
  status.textContent = "Hashing locally…";
  privacyNote.textContent = "The file is being processed in this browser only.";

  try {
    const text = await selectedFile.text();
    const sequence = parseFasta(text);
    if (!sequence) throw new Error("No DNA sequence was found in the file.");

    const chunks = splitIntoChunks(sequence, CHUNK_SIZE);
    const hashes = await Promise.all(chunks.map(hashChunk));
    renderResults(sequence.length, hashes);
    status.textContent = "Sending anonymous hashes to the API…";
    const apiResult = await sendHashesToApi(hashes);
    status.textContent = `${apiResult.status} — ${apiResult.received} anonymous hashes checked`;
    renderApiResult(apiResult);
    saveResult({
      fileName: selectedFile.name,
      sequenceLength: sequence.length,
      hashes,
      apiResult,
    });
    privacyNote.textContent = "Raw DNA stayed in this browser; only SHA-256 hashes were transmitted.";
  } catch (error) {
    status.textContent = error.message === "Failed to fetch"
      ? "Could not reach the HelixHash API"
      : error.message;
    privacyNote.textContent = error.message === "Failed to fetch"
      ? "Make sure the backend is running on port 8001, then refresh and try again."
      : "Please choose a valid FASTA file and try again.";
    results.hidden = true;
  } finally {
    hashButton.disabled = false;
  }
});

function parseFasta(text) { // removes FASTA headers and keeps DNA characters.
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith(">"))
    .join("")
    .replace(/\s/g, "")
    .toUpperCase()
    .replace(/[^ACGTN]/g, "");
}

async function sendHashesToApi(hashes) {
  const response = await fetch("http://127.0.0.1:8001/hashes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hashes }),
  });

  if (!response.ok) {
    throw new Error("The API could not receive the hashes.");
  }

  return response.json();
}

function splitIntoChunks(sequence, size) { // divides DNA into 100-base sections
  const chunks = [];
  for (let index = 0; index < sequence.length; index += size) {
    chunks.push(sequence.slice(index, index + size));
  }
  return chunks;
}

async function hashChunk(chunk) { // creates a SHA 256 hash using the browser
  const bytes = new TextEncoder().encode(chunk);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function renderResults(length, hashes) { // displays the results in the browser
  sequenceLength.textContent = length.toLocaleString();
  chunkCount.textContent = hashes.length.toLocaleString();
  hashList.replaceChildren(...hashes.map((hash) => {
    const item = document.createElement("li");
    item.textContent = hash;
    return item;
  }));
  results.hidden = false;
}

function renderApiResult(apiResult) {
  safetyStatus.textContent = apiResult.status;
  matchedChunks.textContent = apiResult.matched_chunks;
  offTargets.textContent = apiResult.off_targets;
  auditId.textContent = apiResult.audit_id;
}

function saveResult(result) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
}

function restoreSavedResult() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;

  try {
    const result = JSON.parse(saved);
    fileName.textContent = `${result.fileName} · saved result`;
    renderResults(result.sequenceLength, result.hashes);
    renderApiResult(result.apiResult);
    status.textContent = `${result.apiResult.status} · restored saved result`;
    privacyNote.textContent = "Restored locally. Raw DNA was never saved; choose the file again to re-analyze it.";
    statusDot.classList.add("ready");
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

restoreSavedResult();
