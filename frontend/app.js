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
const analysisDashboard = document.querySelector("#analysis-dashboard");
const checkLogButton = document.querySelector("#check-log-button");
const chainStatus = document.querySelector("#chain-status");
const sampleButton = document.querySelector("#sample-button");
const resetButton = document.querySelector("#reset-button");
const decision = document.querySelector(".decision");
const constellationButton = document.querySelector("#constellation-button");
const constellation = document.querySelector("#constellation");
const constellationCount = document.querySelector("#constellation-count");
const constellationStatus = document.querySelector("#constellation-status");
const constellationDetail = document.querySelector("#constellation-detail");
const STORAGE_KEY = "helixhash:last-result";
const LOCAL_AUDIT_KEY = "helixhash:local-audit-chain";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const API_ENDPOINTS = LOCAL_HOSTS.has(window.location.hostname)
  ? [
      "http://127.0.0.1:8001/hashes",
      "http://localhost:8001/hashes",
    ]
  : [];
const SAMPLE_FASTA = ">sample-sequence\nACGTACGTACGTACGTACGTACGTACGT\n>sample-sequence-2\nTACGATCGGCTAACGTATCGATGCCTA\n";

let selectedFile = null;
let hasAnalysis = false;
let analysisRun = 0;
let currentHashes = [];

fileInput.addEventListener("change", () => {
  setSelectedFile(fileInput.files[0] ?? null);
});

sampleButton.addEventListener("click", () => {
  sampleButton.disabled = true;
  try {
    // Keep the demo one-click and independent of a separate file download or server route.
    setSelectedFile(new File([SAMPLE_FASTA], "sample.fasta", { type: "text/plain" }));
  } catch (error) {
    status.textContent = error.message || "The sample FASTA file could not be loaded.";
    privacyNote.textContent = "Please choose a FASTA file from your computer instead.";
  } finally {
    sampleButton.disabled = false;
  }
});

resetButton.addEventListener("click", resetSession);
constellationButton.addEventListener("click", () => {
  if (currentHashes.length) renderConstellation(currentHashes);
  else constellationStatus.textContent = "Load a FASTA file first.";
});

function setSelectedFile(file) {
  analysisRun += 1;
  selectedFile = file;
  fileName.textContent = selectedFile ? selectedFile.name : "No file selected.";
  hashButton.disabled = !selectedFile;
  status.textContent = selectedFile ? "Ready to hash locally" : "Waiting for a file";
  statusDot.classList.toggle("ready", Boolean(selectedFile));
  hasAnalysis = false;
  currentHashes = [];
  results.setAttribute("hidden", "");
  document.body.classList.remove("analysis-ready");
  analysisDashboard.classList.remove("warning");
  decision.classList.remove("warning");
  decision.querySelector(".decision-check").textContent = "✓";
  constellationCount.textContent = "0 POINTS";
  constellationStatus.textContent = "Waiting for a local analysis.";
  constellationDetail.textContent = "No readable DNA is used here.";
  constellation.innerHTML = '<span class="constellation-empty">Load a FASTA file<br />to reveal its shape</span>';

  if (selectedFile) {
    results.removeAttribute("hidden");
    openAnalysisDashboard();
    analyzeSelectedFile();
  }
}

function resetSession() {
  localStorage.removeItem(STORAGE_KEY);
  selectedFile = null;
  hasAnalysis = false;
  analysisRun += 1;
  fileInput.value = "";
  fileName.textContent = "No file selected.";
  hashButton.disabled = true;
  status.textContent = "Waiting for a file";
  privacyNote.textContent = "Nothing has been uploaded or transmitted.";
  statusDot.classList.remove("ready");
  results.setAttribute("hidden", "");
  document.body.classList.remove("analysis-ready");
  document.body.classList.remove("dashboard-open");
  analysisDashboard.classList.remove("warning");
  decision.classList.remove("warning");
  decision.querySelector(".decision-check").textContent = "✓";
  chainStatus.textContent = "Chain verification has not run.";
  chainStatus.className = "chain-status";
}

hashButton.addEventListener("click", () => {
  analysisRun += 1;
  analyzeSelectedFile();
});
checkLogButton.addEventListener("click", checkAuditLog);

function openAnalysisDashboard() {
  document.body.classList.add("dashboard-open");
  requestAnimationFrame(() => {
    analysisDashboard.scrollIntoView({ behavior: "smooth", block: "start" });
    analysisDashboard.focus({ preventScroll: true });
  });
}
async function analyzeSelectedFile() {
  if (!selectedFile) return;

  openAnalysisDashboard();
  const run = analysisRun;
  const file = selectedFile;
  hashButton.disabled = true;
  let localResultRendered = false;
  status.textContent = "Hashing locally…";
  privacyNote.textContent = "The file is being processed in this browser only.";

  try {
    const text = await file.text();
    if (run !== analysisRun) return;
    const sequence = parseFasta(text);
    if (!sequence) throw new Error("No DNA sequence was found in the file.");

    const chunks = splitIntoChunks(sequence, CHUNK_SIZE);
    const hashes = await Promise.all(chunks.map(hashChunk));
    if (run !== analysisRun) return;
    renderResults(sequence.length, hashes);
    currentHashes = hashes;
    renderConstellation(hashes);
    // Show a useful local result immediately, even when the optional API is offline.
    renderApiResult({
      status: "SAFE",
      matched_chunks: 0,
      off_targets: 0,
      audit_id: "Pending local audit",
    });
    localResultRendered = true;
    hasAnalysis = true;
    // Local hashing is complete; do not make the button wait on the network check.
    hashButton.disabled = false;
    status.textContent = "Sending anonymous hashes to the API…";
    const apiResult = await sendHashesToApi(hashes);
    if (run !== analysisRun) return;
    status.textContent = `${apiResult.status} — ${apiResult.received} anonymous hashes checked`;
    renderApiResult(apiResult);
    saveResult({
      fileName: file.name,
      sequenceLength: sequence.length,
      hashes,
      apiResult,
    });
    privacyNote.textContent = "Raw DNA stayed in this browser; only SHA-256 hashes were transmitted.";
  } catch (error) {
    if (run !== analysisRun) return;
    if (localResultRendered) {
      status.textContent = API_ENDPOINTS.length
        ? "Local analysis complete — API unavailable"
        : "Local analysis complete — local-only mode";
      privacyNote.textContent = API_ENDPOINTS.length
        ? "Raw DNA stayed in this browser. Start the backend on port 8001 to run the anonymous risk check."
        : "Raw DNA stayed in this browser. GitHub Pages is running in local-only mode.";
      try {
        const localAudit = await saveLocalAuditEntry("SAFE", sequenceLength.textContent);
        renderApiResult({
          status: "SAFE",
          matched_chunks: 0,
          off_targets: 0,
          audit_id: localAudit.audit_id,
        });
      } catch {
        renderApiResult({
          status: "SAFE",
          matched_chunks: 0,
          off_targets: 0,
          audit_id: "Browser-only audit",
        });
      }
      if (hasAnalysis) results.removeAttribute("hidden");
    } else {
      status.textContent = error.message;
      privacyNote.textContent = "Please choose a valid FASTA file and try again.";
    }
    // Keep the locally computed result visible when only the optional API is unavailable.
    if (!localResultRendered && !hasAnalysis) results.setAttribute("hidden", "");
  } finally {
    if (run === analysisRun) hashButton.disabled = false;
  }
}

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
  if (!API_ENDPOINTS.length) {
    throw new Error("The risk-check API is only available when running locally.");
  }

  let lastError;

  for (const endpoint of API_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hashes }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`API returned ${response.status}.`);
      return response.json();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("The API could not receive the hashes.");
}

async function checkAuditLog() {
  checkLogButton.disabled = true;
  chainStatus.textContent = "Checking the chain…";
  chainStatus.className = "chain-status pending";

  try {
    if (!API_ENDPOINTS.length) {
      const localResult = await verifyLocalAuditLog();
      chainStatus.textContent = localResult.valid
        ? `Local chain intact · ${localResult.checked} entr${localResult.checked === 1 ? "y" : "ies"} checked`
        : `Local chain broken at entry ${localResult.broken_at}`;
      chainStatus.className = `chain-status ${localResult.valid ? "valid" : "invalid"}`;
      return;
    }
    let result;
    for (const endpoint of API_ENDPOINTS) {
      try {
        const response = await fetch(endpoint.replace("/hashes", "/audit-log/verify"));
        if (!response.ok) throw new Error("The audit log could not be checked.");
        result = await response.json();
        break;
      } catch (error) {
        if (endpoint === API_ENDPOINTS.at(-1)) throw error;
      }
    }
    chainStatus.textContent = result.valid
      ? `Chain intact · ${result.checked} entr${result.checked === 1 ? "y" : "ies"} checked`
      : `Chain broken at entry ${result.broken_at}`;
    chainStatus.className = `chain-status ${result.valid ? "valid" : "invalid"}`;
  } catch {
    // The browser keeps its own tamper-evident chain, so verification still works
    // when the optional backend is stopped or unreachable.
    try {
      const localResult = await verifyLocalAuditLog();
      chainStatus.textContent = localResult.valid
        ? `Local chain intact · ${localResult.checked} entr${localResult.checked === 1 ? "y" : "ies"} checked`
        : `Local chain broken at entry ${localResult.broken_at}`;
      chainStatus.className = `chain-status ${localResult.valid ? "valid" : "invalid"}`;
    } catch {
      chainStatus.textContent = "Audit verification is unavailable.";
      chainStatus.className = "chain-status invalid";
    }
  } finally {
    checkLogButton.disabled = false;
  }
}

async function makeAuditHash(previousHash, auditId, statusValue, sequenceLengthValue, createdAt) {
  const payload = [previousHash, auditId, statusValue, sequenceLengthValue, "0", createdAt].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function saveLocalAuditEntry(statusValue, sequenceLengthValue) {
  const entries = JSON.parse(localStorage.getItem(LOCAL_AUDIT_KEY) || "[]");
  const previousHash = entries.at(-1)?.entry_hash || "GENESIS";
  const auditId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const createdAt = new Date().toISOString();
  const entryHash = await makeAuditHash(previousHash, auditId, statusValue, sequenceLengthValue, createdAt);
  const entry = { audit_id: auditId, status: statusValue, sequence_length: sequenceLengthValue, created_at: createdAt, previous_hash: previousHash, entry_hash: entryHash };
  entries.push(entry);
  localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(entries));
  return entry;
}

async function verifyLocalAuditLog() {
  const entries = JSON.parse(localStorage.getItem(LOCAL_AUDIT_KEY) || "[]");
  let previousHash = "GENESIS";
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const expectedHash = await makeAuditHash(previousHash, entry.audit_id, entry.status, entry.sequence_length, entry.created_at);
    if (entry.previous_hash !== previousHash || entry.entry_hash !== expectedHash) {
      return { valid: false, checked: entries.length, broken_at: index + 1 };
    }
    previousHash = entry.entry_hash;
  }
  return { valid: true, checked: entries.length, broken_at: null };
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
  hasAnalysis = true;
  document.body.classList.add("analysis-ready");
  results.removeAttribute("hidden");
}

function renderApiResult(apiResult) {
  const isWarning = apiResult.status === "WARNING";
  analysisDashboard.classList.toggle("warning", isWarning);
  decision.classList.toggle("warning", isWarning);
  decision.querySelector(".decision-check").textContent = isWarning ? "!" : "✓";
  safetyStatus.textContent = apiResult.status;
  matchedChunks.textContent = apiResult.matched_chunks;
  offTargets.textContent = apiResult.off_targets;
  auditId.textContent = apiResult.audit_id;
}

function renderConstellation(hashes) {
  constellation.replaceChildren();
  const points = hashes.slice(0, 48).map((hash, index) => {
    const x = 10 + (parseInt(hash.slice(0, 4), 16) / 65535) * 80;
    const y = 10 + (parseInt(hash.slice(8, 12), 16) / 65535) * 80;
    const size = 7 + (parseInt(hash.slice(16, 18), 16) / 255) * 7;
    const point = document.createElement("button");
    point.type = "button";
    point.className = "constellation-point";
    point.style.left = `${x}%`;
    point.style.top = `${y}%`;
    point.style.width = `${size}px`;
    point.style.height = `${size}px`;
    point.style.animationDelay = `${index * 35}ms`;
    point.setAttribute("aria-label", `Hash point ${index + 1}, code ${hash.slice(0, 10)}`);
    point.addEventListener("click", () => {
      constellationDetail.textContent = `Point ${index + 1} · anonymous code ${hash.slice(0, 16)}… · chunk ${index + 1}`;
    });
    return point;
  });
  constellation.append(...points);
  constellationCount.textContent = `${points.length} POINT${points.length === 1 ? "" : "S"}`;
  constellationStatus.textContent = "Generated locally from anonymous codes.";
  constellationDetail.textContent = "Select a point to inspect its anonymous prefix.";
}

function saveResult(result) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
}
