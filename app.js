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
const STORAGE_KEY = "helixhash:last-result";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const API_ENDPOINTS = LOCAL_HOSTS.has(window.location.hostname)
  ? [
      "http://127.0.0.1:8001/hashes",
      "http://localhost:8001/hashes",
    ]
  : [];
const SAMPLE_FASTA = ">sample-sequence\nACGTACGTACGTACGTACGTACGTACGT\n";

let selectedFile = null;
let hasAnalysis = false;
let analysisRun = 0;

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

function setSelectedFile(file) {
  analysisRun += 1;
  selectedFile = file;
  fileName.textContent = selectedFile ? selectedFile.name : "No file selected.";
  hashButton.disabled = !selectedFile;
  status.textContent = selectedFile ? "Ready to hash locally" : "Waiting for a file";
  statusDot.classList.toggle("ready", Boolean(selectedFile));
  hasAnalysis = false;
  results.setAttribute("hidden", "");
  document.body.classList.remove("analysis-ready");
  analysisDashboard.classList.remove("warning");
  decision.classList.remove("warning");
  decision.querySelector(".decision-check").textContent = "✓";

  if (selectedFile) {
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
        : "Raw DNA stayed in this browser. Risk checks require the optional local API; GitHub Pages supports local analysis only.";
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
      throw new Error("The audit API is only available when running locally.");
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
    chainStatus.textContent = API_ENDPOINTS.length
      ? "Audit API unavailable."
      : "Audit checks require the local API.";
    chainStatus.className = "chain-status invalid";
  } finally {
    checkLogButton.disabled = false;
  }
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

function saveResult(result) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
}
