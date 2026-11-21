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
const hashList = document.querySelector("#hash-list");
const statusDot = document.querySelector(".status-dot");

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
    status.textContent = "Complete — raw DNA stayed in this browser";
    privacyNote.textContent = "Only anonymous SHA-256 codes are shown. Nothing was transmitted.";
  } catch (error) {
    status.textContent = error.message;
    privacyNote.textContent = "Please choose a valid FASTA file and try again.";
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
