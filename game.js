/**
 * game.js
 * Main game logic, rendering, and input handling.
 * ES module — imports parsePuz from puz-parser.js
 */

import { parsePuz } from './puz-parser.js';

// ── DOM references ─────────────────────────────────────────────
const loadScreen    = document.getElementById('load-screen');
const dropZone      = document.getElementById('drop-zone');
const fileInput     = document.getElementById('file-input');
const loadError     = document.getElementById('load-error');
const app           = document.getElementById('app');
const header        = document.getElementById('header');
const puzzleTitle   = document.getElementById('puzzle-title');
const timerBtn      = document.getElementById('timer');
const timerDisplay  = document.getElementById('timer-display');
const timerIcon     = document.getElementById('timer-icon');
const helpBtn       = document.getElementById('help-btn');
const helpModal     = document.getElementById('help-modal');
const helpCloseBtn  = document.getElementById('help-close-btn');
const menuWrapper   = document.getElementById('menu-wrapper');
const menuToggleBtn = document.getElementById('menu-toggle');
const menu          = document.getElementById('menu');
const gridContainer = document.getElementById('grid-container');
const acrossSection = document.getElementById('across-section');
const downSection   = document.getElementById('down-section');
const acrossListEl  = document.getElementById('across-list');
const downListEl    = document.getElementById('down-list');
const activeClueBar = document.getElementById('active-clue-bar');
const scrambleWarn  = document.getElementById('scramble-warning');
const puzzleBanner  = document.getElementById('puzzle-banner');
const bannerLogo    = document.getElementById('banner-logo');
const bannerNumber  = document.getElementById('banner-number');
const bannerAuthor  = document.getElementById('banner-author');
const winModal      = document.getElementById('win-modal');
const winTitle      = document.getElementById('win-title');
const winAuthor     = document.getElementById('win-author');
const winTime       = document.getElementById('win-time');
const shareBtn      = document.getElementById('share-btn');
const winCloseBtn   = document.getElementById('win-close-btn');
const resetModal    = document.getElementById('reset-modal');
const resetConfBtn  = document.getElementById('reset-confirm-btn');
const resetCancelBtn= document.getElementById('reset-cancel-btn');
const clueTabAcross = document.getElementById('clue-tab-across');
const clueTabDown   = document.getElementById('clue-tab-down');

// ── Game State ─────────────────────────────────────────────────
let puzzle = null;           // PuzzleObject from parsePuz
let playerGrid = null;       // (string|null)[][] — null=black, ''=empty, letter=filled
let cellState = null;        // string[][] — 'normal'|'incorrect'|'revealed'|'checked'
let selection = null;        // { row, col, dir }
let cellElements = null;     // (HTMLElement|null)[][] for O(1) access
let clueElements = { across: {}, down: {} }; // number → <li> element
let wordOrder = [];          // [{dir, number, cells:[row,col][]}] for Tab nav
let solved = false;

// Timer
let timerElapsed  = 0;   // seconds
let timerRunning  = false;
let timerStarted  = false;
let timerInterval = null;

// ── Utilities ──────────────────────────────────────────────────
function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function isBlack(row, col) {
  return puzzle.solution[row * puzzle.width + col] === '.';
}

function solutionLetter(row, col) {
  return puzzle.solution[row * puzzle.width + col];
}

function activeClueNumber() {
  return puzzle.wordMap[selection.dir][selection.row][selection.col];
}

function getCellsInWord(dir, clueNum) {
  const w = wordOrder.find(w => w.dir === dir && w.number === clueNum);
  return w ? w.cells : [];
}

function storageKey() {
  return `puzzle:${puzzle.title}:${puzzle.author}`;
}

// ── Timer ──────────────────────────────────────────────────────
function updateTimerUI() {
  // Show ⏸ when running (click to pause), ▶ when paused (click to resume),
  // no icon before the timer has started.
  if (!timerStarted) {
    timerIcon.textContent = '';
  } else {
    timerIcon.textContent = timerRunning ? '⏸' : '▶';
  }
  timerBtn.classList.toggle('paused', !timerRunning && timerStarted);
  timerBtn.setAttribute('aria-label', timerRunning ? 'Timer — click to pause' : 'Timer — click to resume');
}

function startTimer() {
  if (timerRunning) return;
  timerStarted = true;
  timerRunning = true;
  timerInterval = setInterval(() => {
    timerElapsed++;
    timerDisplay.textContent = formatTime(timerElapsed);
  }, 1000);
  updateTimerUI();
}

function pauseTimer() {
  if (!timerRunning) return;
  timerRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  updateTimerUI();
}

function stopTimer() {
  pauseTimer();
  timerStarted = true;
}

// Click the timer button to pause/resume
timerBtn.addEventListener('click', () => {
  if (!timerStarted || solved) return;
  if (timerRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseTimer();
  } else if (timerStarted && !solved) {
    startTimer();
  }
});

// ── Save / Restore ─────────────────────────────────────────────
function saveState() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify({
      playerGrid,
      cellState,
      elapsed: timerElapsed,
      solved
    }));
  } catch { /* quota exceeded or private mode — silently ignore */ }
}

function restoreState() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved.playerGrid ||
        saved.playerGrid.length !== puzzle.height ||
        saved.playerGrid[0].length !== puzzle.width) {
      localStorage.removeItem(storageKey());
      return false;
    }
    playerGrid   = saved.playerGrid;
    cellState    = saved.cellState;
    timerElapsed = saved.elapsed ?? 0;
    solved       = saved.solved  ?? false;
    timerDisplay.textContent = formatTime(timerElapsed);
    return true;
  } catch {
    return false;
  }
}

// ── Grid Rendering ─────────────────────────────────────────────
function renderGrid() {
  gridContainer.innerHTML = '';
  gridContainer.style.gridTemplateColumns = `repeat(${puzzle.width}, 1fr)`;

  cellElements = Array.from({ length: puzzle.height }, () => Array(puzzle.width).fill(null));

  for (let row = 0; row < puzzle.height; row++) {
    for (let col = 0; col < puzzle.width; col++) {
      const div = document.createElement('div');
      div.className = 'cell';
      div.dataset.row = row;
      div.dataset.col = col;

      if (isBlack(row, col)) {
        div.classList.add('black');
      } else {
        const num = puzzle.cellNumbers[row][col];
        if (num !== null) {
          const numSpan = document.createElement('span');
          numSpan.className = 'cell-number';
          numSpan.textContent = num;
          div.appendChild(numSpan);
        }

        const letterSpan = document.createElement('span');
        letterSpan.className = 'cell-letter';
        div.appendChild(letterSpan);

        div.addEventListener('click', handleCellClick);
      }

      gridContainer.appendChild(div);
      cellElements[row][col] = div;
    }
  }
}

function updateCell(row, col) {
  const el = cellElements[row][col];
  if (!el || isBlack(row, col)) return;
  const letterSpan = el.querySelector('.cell-letter');
  letterSpan.textContent = playerGrid[row][col] ?? '';

  el.classList.remove('incorrect', 'revealed', 'checked');
  const cs = cellState[row][col];
  if (cs !== 'normal') el.classList.add(cs);
}

function updateAllCells() {
  for (let r = 0; r < puzzle.height; r++) {
    for (let c = 0; c < puzzle.width; c++) {
      if (!isBlack(r, c)) updateCell(r, c);
    }
  }
}

// ── Selection ──────────────────────────────────────────────────
function clearSelectionHighlights() {
  if (!selection) return;
  const num = puzzle.wordMap[selection.dir][selection.row][selection.col];
  if (num !== null) {
    for (const [r, c] of getCellsInWord(selection.dir, num)) {
      cellElements[r][c].classList.remove('active-word', 'active-cell');
    }
  } else {
    // Isolated cell
    cellElements[selection.row][selection.col].classList.remove('active-word', 'active-cell');
  }
}

function applySelectionHighlights() {
  const num = puzzle.wordMap[selection.dir][selection.row][selection.col];
  if (num !== null) {
    for (const [r, c] of getCellsInWord(selection.dir, num)) {
      cellElements[r][c].classList.add('active-word');
    }
    // Highlight the active clue in the list
    highlightActiveClue(selection.dir, num);
  }
  cellElements[selection.row][selection.col].classList.add('active-cell');
}

function setSelection(row, col, dir) {
  clearSelectionHighlights();
  // Deactivate old clue
  if (selection) {
    const oldNum = puzzle.wordMap[selection.dir][selection.row][selection.col];
    if (oldNum !== null && clueElements[selection.dir][oldNum]) {
      clueElements[selection.dir][oldNum].classList.remove('active-clue');
    }
  }
  selection = { row, col, dir };
  applySelectionHighlights();
  updateActiveClueBar();
}

function highlightActiveClue(dir, num) {
  const el = clueElements[dir][num];
  if (el) {
    el.classList.add('active-clue');
    el.scrollIntoView({ block: 'nearest' });
  }
}

function updateActiveClueBar() {
  const num = activeClueNumber();
  if (num === null) { activeClueBar.textContent = ''; return; }
  const clueList = puzzle.clues[selection.dir];
  const clue = clueList.find(c => c.number === num);
  if (clue) {
    activeClueBar.textContent = `${num} ${selection.dir === 'across' ? 'Across' : 'Down'}: ${clue.text}`;
  }
}

// ── Clue Panel Rendering ───────────────────────────────────────
function renderClues() {
  acrossListEl.innerHTML = '';
  downListEl.innerHTML = '';
  clueElements = { across: {}, down: {} };

  for (const [dir, listEl] of [['across', acrossListEl], ['down', downListEl]]) {
    for (const clue of puzzle.clues[dir]) {
      const li = document.createElement('li');
      li.className = 'clue-item';
      li.dataset.dir = dir;
      li.dataset.num = clue.number;

      const numSpan = document.createElement('span');
      numSpan.className = 'clue-num';
      numSpan.textContent = clue.number;

      const textSpan = document.createElement('span');
      textSpan.className = 'clue-text';
      textSpan.textContent = clue.text;

      li.appendChild(numSpan);
      li.appendChild(textSpan);
      li.addEventListener('click', () => handleClueClick(dir, clue.number));
      listEl.appendChild(li);
      clueElements[dir][clue.number] = li;
    }
  }
}

function updateCompletedClues() {
  for (const [dir, clues] of [['across', puzzle.clues.across], ['down', puzzle.clues.down]]) {
    for (const clue of clues) {
      const cells = getCellsInWord(dir, clue.number);
      const done = cells.length > 0 && cells.every(([r, c]) => playerGrid[r][c] !== '');
      const el = clueElements[dir][clue.number];
      if (el) el.classList.toggle('completed-clue', done);
    }
  }
}

// ── Word Order (for Tab navigation) ───────────────────────────
function buildWordOrder() {
  wordOrder = [];

  // Across words in row-major order (= clue number order)
  for (let row = 0; row < puzzle.height; row++) {
    for (let col = 0; col < puzzle.width; col++) {
      const num = puzzle.cellNumbers[row][col];
      if (num !== null && puzzle.wordMap.across[row][col] === num) {
        const cells = [];
        let c = col;
        while (c < puzzle.width && !isBlack(row, c)) {
          cells.push([row, c]);
          c++;
        }
        if (cells.length >= 2) wordOrder.push({ dir: 'across', number: num, cells });
      }
    }
  }

  // Down words in column-major-within-row-major order (= clue number order)
  for (let row = 0; row < puzzle.height; row++) {
    for (let col = 0; col < puzzle.width; col++) {
      const num = puzzle.cellNumbers[row][col];
      if (num !== null && puzzle.wordMap.down[row][col] === num) {
        const cells = [];
        let r = row;
        while (r < puzzle.height && !isBlack(r, col)) {
          cells.push([r, col]);
          r++;
        }
        if (cells.length >= 2) wordOrder.push({ dir: 'down', number: num, cells });
      }
    }
  }
}

// ── Input Handling ─────────────────────────────────────────────
function handleCellClick(e) {
  const el = e.currentTarget;
  const row = parseInt(el.dataset.row, 10);
  const col = parseInt(el.dataset.col, 10);

  if (solved) return;

  // If clicking the already-active cell, toggle direction
  if (selection && selection.row === row && selection.col === col) {
    const newDir = selection.dir === 'across' ? 'down' : 'across';
    // Only toggle if the cell is part of a word in that direction
    if (puzzle.wordMap[newDir][row][col] !== null) {
      setSelection(row, col, newDir);
    }
    return;
  }

  // Determine direction: prefer current direction if cell is part of a word in it
  let dir = selection ? selection.dir : 'across';
  if (puzzle.wordMap[dir][row][col] === null) {
    dir = dir === 'across' ? 'down' : 'across';
  }
  if (puzzle.wordMap[dir][row][col] === null) {
    dir = 'across'; // isolated cell, just pick across
  }

  setSelection(row, col, dir);
}

function handleClueClick(dir, num) {
  const cells = getCellsInWord(dir, num);
  if (cells.length === 0) return;
  // Find first empty cell, or fall back to first cell
  const target = cells.find(([r, c]) => playerGrid[r][c] === '') ?? cells[0];
  setSelection(target[0], target[1], dir);
}

function handleKeyDown(e) {
  if (!puzzle || solved) return;
  // Don't capture when a modal is open
  if (winModal.classList.contains('open') || resetModal.classList.contains('open') || helpModal.classList.contains('open')) return;
  // Don't capture when menu is open (except Escape)
  if (menu.classList.contains('open') && e.key !== 'Escape') return;

  if (e.key === 'Escape') {
    menu.classList.remove('open');
    return;
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    handleTab(e.shiftKey);
    return;
  }

  if (e.key.startsWith('Arrow')) {
    e.preventDefault();
    handleArrow(e.key);
    return;
  }

  if (e.key === 'Backspace') {
    e.preventDefault();
    handleBackspace();
    return;
  }

  if (/^[a-zA-Z]$/.test(e.key)) {
    e.preventDefault();
    handleLetter(e.key.toUpperCase());
    return;
  }
}

function handleLetter(letter) {
  const { row, col } = selection;
  if (cellState[row][col] === 'revealed') {
    // Can't overwrite revealed — just advance
    advanceInWord();
    return;
  }
  if (!timerStarted) startTimer();
  playerGrid[row][col] = letter;
  cellState[row][col] = 'normal';
  updateCell(row, col);
  updateCompletedClues();
  saveState();
  if (checkWin()) return;
  advanceInWord();
}

function handleBackspace() {
  if (!timerStarted) startTimer();
  const { row, col } = selection;
  if (playerGrid[row][col] !== '' && cellState[row][col] !== 'revealed') {
    playerGrid[row][col] = '';
    cellState[row][col] = 'normal';
    updateCell(row, col);
    updateCompletedClues();
    saveState();
  } else {
    retreatInWord();
  }
}

function advanceInWord() {
  const { row, col, dir } = selection;
  const num = puzzle.wordMap[dir][row][col];
  if (num === null) return;
  const cells = getCellsInWord(dir, num);
  const idx = cells.findIndex(([r, c]) => r === row && c === col);

  // Find next empty cell in the word
  for (let i = idx + 1; i < cells.length; i++) {
    const [r, c] = cells[i];
    if (playerGrid[r][c] === '' || cellState[r][c] !== 'revealed') {
      setSelection(r, c, dir);
      return;
    }
  }
  // No empty cell found — advance to next word's first empty or first cell
  // (Optional behavior: stay at end of word if all filled)
  // NYT convention: stop at end
}

function retreatInWord() {
  const { row, col, dir } = selection;
  const num = puzzle.wordMap[dir][row][col];
  if (num === null) return;
  const cells = getCellsInWord(dir, num);
  const idx = cells.findIndex(([r, c]) => r === row && c === col);
  if (idx > 0) {
    const [r, c] = cells[idx - 1];
    setSelection(r, c, dir);
  }
}

function handleArrow(key) {
  const { row, col, dir } = selection;
  const arrowDir = {
    ArrowLeft: 'across', ArrowRight: 'across',
    ArrowUp: 'down', ArrowDown: 'down'
  }[key];
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[key];

  if (arrowDir !== dir) {
    // Perpendicular arrow: switch direction if possible, don't move
    if (puzzle.wordMap[arrowDir][row][col] !== null) {
      setSelection(row, col, arrowDir);
    }
    return;
  }

  // Move in current direction, skip black squares
  let r = row, c = col;
  if (dir === 'across') {
    c += delta;
    while (c >= 0 && c < puzzle.width && isBlack(r, c)) c += delta;
    if (c >= 0 && c < puzzle.width) setSelection(r, c, dir);
  } else {
    r += delta;
    while (r >= 0 && r < puzzle.height && isBlack(r, c)) r += delta;
    if (r >= 0 && r < puzzle.height) setSelection(r, c, dir);
  }
}

function handleTab(shift) {
  const num = activeClueNumber();
  const currentIdx = wordOrder.findIndex(w => w.dir === selection.dir && w.number === num);
  const len = wordOrder.length;
  if (len === 0) return;

  const delta = shift ? -1 : 1;
  const nextIdx = ((currentIdx === -1 ? 0 : currentIdx) + delta + len) % len;
  const nextWord = wordOrder[nextIdx];

  const target = nextWord.cells.find(([r, c]) => playerGrid[r][c] === '') ?? nextWord.cells[0];
  setSelection(target[0], target[1], nextWord.dir);

  // On mobile, switch the tab to match new direction
  switchClueTab(nextWord.dir);
}

// ── Check & Reveal ─────────────────────────────────────────────
function checkCell(row, col) {
  if (playerGrid[row][col] === '') return;
  const correct = playerGrid[row][col] === solutionLetter(row, col);
  cellState[row][col] = correct ? 'checked' : 'incorrect';
  updateCell(row, col);
}

function revealCell(row, col) {
  playerGrid[row][col] = solutionLetter(row, col);
  cellState[row][col] = 'revealed';
  updateCell(row, col);
}

function checkWord() {
  const num = activeClueNumber();
  if (num === null) return;
  for (const [r, c] of getCellsInWord(selection.dir, num)) checkCell(r, c);
  updateCompletedClues();
  saveState();
}

function checkAllPuzzle() {
  for (let r = 0; r < puzzle.height; r++) {
    for (let c = 0; c < puzzle.width; c++) {
      if (!isBlack(r, c)) checkCell(r, c);
    }
  }
  updateCompletedClues();
  saveState();
  checkWin();
}

function revealWord() {
  const num = activeClueNumber();
  if (num === null) return;
  for (const [r, c] of getCellsInWord(selection.dir, num)) revealCell(r, c);
  updateCompletedClues();
  saveState();
  checkWin();
}

function revealAllPuzzle() {
  for (let r = 0; r < puzzle.height; r++) {
    for (let c = 0; c < puzzle.width; c++) {
      if (!isBlack(r, c)) revealCell(r, c);
    }
  }
  updateCompletedClues();
  saveState();
  checkWin();
}

function revealCurrentCell() {
  revealCell(selection.row, selection.col);
  updateCompletedClues();
  saveState();
  checkWin();
}

function checkCurrentCell() {
  checkCell(selection.row, selection.col);
  saveState();
}

// ── Win Condition ──────────────────────────────────────────────
function checkWin() {
  for (let r = 0; r < puzzle.height; r++) {
    for (let c = 0; c < puzzle.width; c++) {
      if (!isBlack(r, c)) {
        if (playerGrid[r][c] !== solutionLetter(r, c)) return false;
      }
    }
  }
  // All cells match!
  solved = true;
  stopTimer();
  saveState();
  showWinModal();
  return true;
}

function showWinModal() {
  winTitle.textContent  = puzzle.title  || 'Crossword';
  winAuthor.textContent = puzzle.author ? `by ${puzzle.author}` : '';
  winTime.textContent   = formatTime(timerElapsed);
  winModal.classList.add('open');
}

// ── Reset ──────────────────────────────────────────────────────
function resetPuzzle() {
  playerGrid = Array.from({ length: puzzle.height }, (_, r) =>
    Array.from({ length: puzzle.width }, (_, c) =>
      isBlack(r, c) ? null : ''
    )
  );
  cellState = Array.from({ length: puzzle.height }, () =>
    Array(puzzle.width).fill('normal')
  );
  solved = false;
  timerElapsed = 0;
  timerStarted = false;
  pauseTimer();
  timerDisplay.textContent = '00:00';
  updateTimerUI();
  updateAllCells();
  updateCompletedClues();
  saveState();
  const [resetRow, resetCol] = findFirstWhiteCell();
  setSelection(resetRow, resetCol, 'across');
}

function findFirstWhiteCell() {
  for (let r = 0; r < puzzle.height; r++) {
    for (let c = 0; c < puzzle.width; c++) {
      if (!isBlack(r, c)) return [r, c];
    }
  }
  return [0, 0];
}

// ── Menu ───────────────────────────────────────────────────────
menuToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  menu.classList.toggle('open');
});

document.addEventListener('click', () => menu.classList.remove('open'));
menu.addEventListener('click', e => e.stopPropagation());

document.getElementById('menu-check-cell').addEventListener('click', () => {
  menu.classList.remove('open');
  checkCurrentCell();
});
document.getElementById('menu-check-word').addEventListener('click', () => {
  menu.classList.remove('open');
  checkWord();
});
document.getElementById('menu-check-puzzle').addEventListener('click', () => {
  menu.classList.remove('open');
  checkAllPuzzle();
});
document.getElementById('menu-reveal-cell').addEventListener('click', () => {
  menu.classList.remove('open');
  revealCurrentCell();
});
document.getElementById('menu-reveal-word').addEventListener('click', () => {
  menu.classList.remove('open');
  revealWord();
});
document.getElementById('menu-reveal-puzzle').addEventListener('click', () => {
  menu.classList.remove('open');
  revealAllPuzzle();
});
document.getElementById('menu-reset').addEventListener('click', () => {
  menu.classList.remove('open');
  resetModal.classList.add('open');
});

// ── Modals ─────────────────────────────────────────────────────
// Help modal
helpBtn.addEventListener('click', () => helpModal.classList.add('open'));
helpCloseBtn.addEventListener('click', () => helpModal.classList.remove('open'));
helpModal.addEventListener('click', e => { if (e.target === helpModal) helpModal.classList.remove('open'); });

winCloseBtn.addEventListener('click', () => winModal.classList.remove('open'));
winModal.addEventListener('click', e => { if (e.target === winModal) winModal.classList.remove('open'); });

shareBtn.addEventListener('click', () => {
  const text = `I solved "${puzzle.title}"${puzzle.author ? ` by ${puzzle.author}` : ''} in ${formatTime(timerElapsed)}!`;
  navigator.clipboard.writeText(text).then(() => {
    shareBtn.textContent = 'Copied!';
    setTimeout(() => { shareBtn.textContent = 'Share Result'; }, 2000);
  }).catch(() => {
    shareBtn.textContent = 'Copy failed';
    setTimeout(() => { shareBtn.textContent = 'Share Result'; }, 2000);
  });
});

resetConfBtn.addEventListener('click', () => {
  resetModal.classList.remove('open');
  resetPuzzle();
});
resetCancelBtn.addEventListener('click', () => resetModal.classList.remove('open'));
resetModal.addEventListener('click', e => { if (e.target === resetModal) resetModal.classList.remove('open'); });

// ── Mobile Clue Tabs ───────────────────────────────────────────
function switchClueTab(dir) {
  if (window.innerWidth > 640 || document.body.classList.contains('embed-mode')) return;
  clueTabAcross.classList.toggle('active', dir === 'across');
  clueTabDown.classList.toggle('active', dir === 'down');
  acrossSection.classList.toggle('tab-active', dir === 'across');
  downSection.classList.toggle('tab-active', dir === 'down');
}

clueTabAcross.addEventListener('click', () => switchClueTab('across'));
clueTabDown.addEventListener('click', () => switchClueTab('down'));

// ── Drag & Drop / File Input ───────────────────────────────────
function setupLoadUI() {
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadFile(fileInput.files[0]);
    fileInput.value = '';
  });
}

function loadFile(file) {
  loadError.textContent = '';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const puz = parsePuz(e.target.result);
      initGame(puz);
    } catch (err) {
      loadError.textContent = `Could not parse puzzle: ${err.message}`;
    }
  };
  reader.onerror = () => { loadError.textContent = 'Could not read file.'; };
  reader.readAsArrayBuffer(file);
}

async function loadFromUrl(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    return parsePuz(buf);
  } catch (err) {
    throw new Error(`Could not load puzzle from URL: ${err.message}`);
  }
}

// ── Init Game ──────────────────────────────────────────────────
function initGame(puz) {
  puzzle = puz;

  // Show scramble warning if needed
  if (puzzle.isScrambled) {
    scrambleWarn.style.display = 'block';
    scrambleWarn.textContent = 'This puzzle is scrambled and cannot be played.';
  } else {
    scrambleWarn.style.display = 'none';
  }

  // Initialize fresh state
  playerGrid = Array.from({ length: puzzle.height }, (_, r) =>
    Array.from({ length: puzzle.width }, (_, c) =>
      isBlack(r, c) ? null : ''
    )
  );
  cellState = Array.from({ length: puzzle.height }, () =>
    Array(puzzle.width).fill('normal')
  );
  solved = false;
  timerElapsed = 0;
  timerStarted = false;
  timerRunning = false;
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  timerDisplay.textContent = '00:00';
  updateTimerUI();

  // Build word order for Tab navigation
  buildWordOrder();

  // Render grid and clues
  renderGrid();
  renderClues();

  // Try to restore saved state
  const restored = restoreState();
  if (restored) {
    updateAllCells();
    updateCompletedClues();
    if (solved) {
      stopTimer();
    }
  }

  // Set puzzle title in header
  puzzleTitle.textContent = puzzle.title || 'Crossword';

  // Show the app
  loadScreen.style.display = 'none';
  app.classList.add('visible');

  // Set initial selection
  const [firstRow, firstCol] = findFirstWhiteCell();
  setSelection(firstRow, firstCol, 'across');

  // Mobile: default to across tab
  switchClueTab('across');
  acrossSection.classList.add('tab-active');

  // Attach keyboard listener (remove first to prevent accumulation on re-load)
  document.removeEventListener('keydown', handleKeyDown);
  document.addEventListener('keydown', handleKeyDown);
}

// ── URL Params & Boot ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const embedMode = params.get('embed') === '1';
  const puzzleUrl = params.get('puz');
  const puzzleType   = params.get('type');   // 'dimi' | 'crossword'
  const puzzleNum    = params.get('num');    // e.g. '139'
  const puzzleAuthor = params.get('author'); // e.g. 'Jane Smith'
  const puzzlePubTitle = params.get('title'); // optional display title

  // Populate banner when type param is present
  if (puzzleType) {
    const logoSrc  = puzzleType === 'dimi' ? 'assets/dailydimi.png' : 'assets/dailycrossword.png';
    const typeName = puzzleType === 'dimi' ? 'Daily Diminutive' : 'Daily Crossword';

    bannerLogo.src = logoSrc;
    bannerLogo.alt = typeName;
    if (puzzleNum) bannerNumber.textContent = `#${puzzleNum}`;
    if (puzzlePubTitle || puzzleAuthor) {
      bannerAuthor.textContent = [
        puzzlePubTitle ? `"${puzzlePubTitle}"` : '',
        puzzleAuthor ? `by ${puzzleAuthor}` : ''
      ].filter(Boolean).join(' ');
    }
    puzzleBanner.classList.add('visible');
  }

  if (embedMode) {
    document.body.classList.add('embed-mode');
  }

  if (puzzleUrl) {
    // Fetch and load puzzle directly, skip load screen
    try {
      const puz = await loadFromUrl(puzzleUrl);
      initGame(puz);
    } catch (err) {
      if (embedMode) {
        // In embed mode, show inline error
        app.classList.add('visible');
        loadScreen.style.display = 'none';
        gridContainer.textContent = err.message;
      } else {
        loadScreen.style.display = '';
        loadError.textContent = err.message;
        setupLoadUI();
      }
    }
  } else {
    // No puzzle URL — show load screen
    setupLoadUI();
  }
});
