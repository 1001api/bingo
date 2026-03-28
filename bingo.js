// ============ STATE ============
let words = [];
let grid = Array(25).fill(null);
let marked = Array(25).fill(false);
let completedLines = new Set();
let linesCount = 0;
let markHistory = [];
let gameActive = false;

// All 12 possible lines (indices into the 25-cell grid)
const LINES = [
  // Rows
  [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
  // Columns
  [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
  // Diagonals
  [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]
];

function announce(msg) {
  document.getElementById('announcer').textContent = msg;
}

// ============ PHASE 1: WORD SETUP ============
(function initWordInputs() {
  const container = document.getElementById('word-inputs');
  if (!container) return; // Guard for script loading

  for (let i = 0; i < 5; i++) {
    const cell = document.createElement('div');
    cell.className = 'word-otp';
    cell.innerHTML = `
      <span class="word-otp-index">${i + 1}</span>
      <input type="text" id="word-${i}" maxlength="20" placeholder="Word" 
             aria-label="Word ${i + 1}" autocomplete="off" spellcheck="false">
    `;
    container.appendChild(cell);
  }

  container.addEventListener('input', (e) => {
    const input = e.target;
    const idx = parseInt(input.id.split('-')[1]);
    
    // Force uppercase
    input.value = input.value.toUpperCase();
    const val = input.value.trim();

    // Toggle filled class
    if (val.length > 0) {
      input.classList.add('filled');
    } else {
      input.classList.remove('filled');
    }

    // Auto-advance: if user typed/pasted a word and there's a next field, jump
    if (val.length >= 1 && idx < 4) {
      const next = document.getElementById(`word-${idx + 1}`);
      if (next && next.value.trim() === '') {
        // Small delay so the value settles
        setTimeout(() => next.focus(), 50);
      }
    }

    validateWords();
  });

  container.addEventListener('keydown', (e) => {
    const input = e.target;
    const idx = parseInt(input.id.split('-')[1]);

    // Enter = advance to next
    if (e.key === 'Enter' && !e.ctrlKey) {
      e.preventDefault();
      if (idx < 4) {
        document.getElementById(`word-${idx + 1}`).focus();
      }
    }

    // Backspace on empty = go back
    if (e.key === 'Backspace' && input.value === '' && idx > 0) {
      e.preventDefault();
      const prev = document.getElementById(`word-${idx - 1}`);
      prev.focus();
      // Select all text in previous so user can retype
      prev.select();
    }

    // ArrowLeft on caret position 0 = go back
    if (e.key === 'ArrowLeft' && input.selectionStart === 0 && idx > 0) {
      e.preventDefault();
      document.getElementById(`word-${idx - 1}`).focus();
    }

    // ArrowRight on caret at end = go forward
    if (e.key === 'ArrowRight' && input.selectionStart === input.value.length && idx < 4) {
      e.preventDefault();
      document.getElementById(`word-${idx + 1}`).focus();
    }
  });

  // Handle paste: split pasted text by spaces/commas and fill fields
  container.addEventListener('paste', (e) => {
    const input = e.target;
    const idx = parseInt(input.id.split('-')[1]);
    const pasted = (e.clipboardData || window.clipboardData).getData('text').trim();
    const parts = pasted.split(/[\s,]+/).filter(Boolean);

    if (parts.length > 1) {
      e.preventDefault();
      for (let j = 0; j < parts.length && (idx + j) < 5; j++) {
        const target = document.getElementById(`word-${idx + j}`);
        target.value = parts[j].toUpperCase();
        target.classList.add('filled');
      }
      // Focus the next empty or the last filled
      const nextEmpty = Array.from({ length: 5 }, (_, k) => k)
        .find(k => document.getElementById(`word-${k}`).value.trim() === '');
      if (nextEmpty !== undefined) {
        document.getElementById(`word-${nextEmpty}`).focus();
      } else {
        document.getElementById(`word-4`).focus();
      }
      validateWords();
    }
  });
})();

function validateWords() {
  const inputs = [];
  for (let i = 0; i < 5; i++) {
    inputs.push(document.getElementById(`word-${i}`).value.trim());
  }
  const allFilled = inputs.every(w => w.length > 0);
  document.getElementById('btn-words-next').disabled = !allFilled;
}

function goToWordPhase() {
  switchPhase('phase-words');
  document.getElementById('word-0').focus();
}

function goToGridPhase() {
  words = [];
  for (let i = 0; i < 5; i++) {
    words.push(document.getElementById(`word-${i}`).value.trim());
  }
  if (words.some(w => w.length === 0)) return;

  switchPhase('phase-grid');
  initGridInputs();
  document.getElementById('grid-cell-0').focus();
  announce('Grid setup. Click cells to place numbers 1 to 25, or press R to randomize.');
}

// ============ PHASE 2: GRID SETUP ============
let gridPlacement = Array(25).fill(null); // gridPlacement[cellIndex] = number or null
let nextNumber = 1;
let gridPlaceHistory = []; // stack of cell indices placed

function initGridInputs() {
  const container = document.getElementById('grid-inputs');
  if (container.children.length > 0) return;

  for (let i = 0; i < 25; i++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'grid-place-cell';
    cell.id = `grid-cell-${i}`;
    cell.setAttribute('aria-label', `Row ${Math.floor(i / 5) + 1}, Column ${(i % 5) + 1} — empty`);
    cell.tabIndex = i === 0 ? 0 : -1;
    cell.addEventListener('click', () => placeNumber(i));
    container.appendChild(cell);
  }

  // Keyboard nav for grid cells
  container.addEventListener('keydown', (e) => {
    const focused = document.activeElement;
    if (!focused || !focused.classList.contains('grid-place-cell')) return;
    const idx = parseInt(focused.id.replace('grid-cell-', ''));
    const row = Math.floor(idx / 5);
    const col = idx % 5;
    let next = -1;

    if (e.key === 'ArrowRight' && col < 4) next = idx + 1;
    if (e.key === 'ArrowLeft' && col > 0) next = idx - 1;
    if (e.key === 'ArrowDown' && row < 4) next = idx + 5;
    if (e.key === 'ArrowUp' && row > 0) next = idx - 5;

    if (next >= 0) {
      e.preventDefault();
      focused.tabIndex = -1;
      const nextEl = document.getElementById(`grid-cell-${next}`);
      nextEl.tabIndex = 0;
      nextEl.focus();
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      placeNumber(idx);
    }
  });

  resetGridState();
}

function resetGridState() {
  gridPlacement = Array(25).fill(null);
  nextNumber = 1;
  gridPlaceHistory = [];
  for (let i = 0; i < 25; i++) {
    const cell = document.getElementById(`grid-cell-${i}`);
    cell.textContent = '';
    cell.className = 'grid-place-cell';
    cell.setAttribute('aria-label', `Row ${Math.floor(i / 5) + 1}, Column ${(i % 5) + 1} — empty`);
  }
  updateGridProgress();
}

function placeNumber(idx) {
  if (nextNumber > 25) return;
  if (gridPlacement[idx] !== null) return; // already placed

  gridPlacement[idx] = nextNumber;
  gridPlaceHistory.push(idx);

  const cell = document.getElementById(`grid-cell-${idx}`);
  cell.textContent = nextNumber;
  cell.classList.add('placed');

  // Remove last-placed highlight from previous
  document.querySelectorAll('.grid-place-cell.last-placed').forEach(c => c.classList.remove('last-placed'));
  cell.classList.add('last-placed');
  cell.setAttribute('aria-label', `Row ${Math.floor(idx / 5) + 1}, Column ${(idx % 5) + 1} — number ${nextNumber}`);

  nextNumber++;
  updateGridProgress();
  announce(nextNumber <= 25 ? `Placed ${nextNumber - 1}. Next: ${nextNumber}` : 'All 25 numbers placed! Ready to start.');
}

function undoGridPlace() {
  if (gridPlaceHistory.length === 0) return;

  const idx = gridPlaceHistory.pop();
  gridPlacement[idx] = null;
  nextNumber--;

  const cell = document.getElementById(`grid-cell-${idx}`);
  cell.textContent = '';
  cell.className = 'grid-place-cell';
  cell.setAttribute('aria-label', `Row ${Math.floor(idx / 5) + 1}, Column ${(idx % 5) + 1} — empty`);

  // Restore last-placed highlight to new last item
  document.querySelectorAll('.grid-place-cell.last-placed').forEach(c => c.classList.remove('last-placed'));
  if (gridPlaceHistory.length > 0) {
    const prevIdx = gridPlaceHistory[gridPlaceHistory.length - 1];
    document.getElementById(`grid-cell-${prevIdx}`).classList.add('last-placed');
  }

  updateGridProgress();
  announce(`Undid ${nextNumber}. Next: ${nextNumber}`);
}

function clearGrid() {
  resetGridState();
  announce('Grid cleared. Placing number 1.');
}

function updateGridProgress() {
  const placed = gridPlaceHistory.length;
  const currentNumEl = document.getElementById('current-num');
  const progressLabelEl = document.getElementById('progress-label');
  const progressFillEl = document.getElementById('progress-fill');
  const btnUndoEl = document.getElementById('btn-grid-undo');
  const btnNextEl = document.getElementById('btn-grid-next');

  if (currentNumEl) currentNumEl.textContent = nextNumber <= 25 ? nextNumber : '✓';
  if (progressLabelEl) progressLabelEl.textContent = `${placed} / 25`;
  if (progressFillEl) progressFillEl.style.width = `${(placed / 25) * 100}%`;
  if (btnUndoEl) btnUndoEl.disabled = placed === 0;
  if (btnNextEl) btnNextEl.disabled = placed < 25;

  if (currentNumEl) {
    if (placed === 25) {
      currentNumEl.style.animation = 'none';
    } else {
      currentNumEl.style.animation = '';
    }
  }
}

function randomizeGrid() {
  const nums = Array.from({ length: 25 }, (_, i) => i + 1);
  for (let i = 24; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nums[i], nums[j]] = [nums[j], nums[i]];
  }

  // Reset and place all at once
  resetGridState();
  for (let i = 0; i < 25; i++) {
    gridPlacement[i] = nums[i];
    gridPlaceHistory.push(i);
    const cell = document.getElementById(`grid-cell-${i}`);
    cell.textContent = nums[i];
    cell.classList.add('placed');
    cell.setAttribute('aria-label', `Row ${Math.floor(i / 5) + 1}, Column ${(i % 5) + 1} — number ${nums[i]}`);
  }
  nextNumber = 26;
  updateGridProgress();
  announce('Grid randomized with numbers 1 to 25.');
}

// ============ PHASE 3: GAMEPLAY ============
function startGame() {
  // Read grid from placement
  for (let i = 0; i < 25; i++) {
    grid[i] = gridPlacement[i];
  }
  marked = Array(25).fill(false);
  completedLines = new Set();
  linesCount = 0;
  markHistory = [];
  gameActive = true;

  buildGameUI();
  switchPhase('phase-game');
  document.querySelector('.game-cell').focus();
  announce('Game started! Click or navigate to a number to mark it.');
}

function buildGameUI() {
  // Words display
  const wordsContainer = document.getElementById('words-display');
  wordsContainer.innerHTML = '';
  words.forEach((w, i) => {
    const badge = document.createElement('span');
    badge.className = 'word-badge';
    badge.id = `word-badge-${i}`;
    badge.textContent = w;
    badge.setAttribute('aria-label', `${w} - not yet scored`);
    wordsContainer.appendChild(badge);
  });

  // Game grid
  const gridContainer = document.getElementById('game-grid');

  // Remove all children except SVG, then clear SVG
  while (gridContainer.firstChild) {
    gridContainer.removeChild(gridContainer.firstChild);
  }

  // Re-add SVG overlay (cleared)
  const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  newSvg.classList.add('line-overlay');
  newSvg.id = 'line-overlay';
  newSvg.setAttribute('aria-hidden', 'true');
  gridContainer.appendChild(newSvg);

  for (let i = 0; i < 25; i++) {
    const cell = document.createElement('button');
    cell.className = 'game-cell';
    cell.id = `game-cell-${i}`;
    cell.textContent = grid[i];
    cell.setAttribute('aria-label', `Number ${grid[i]}, Row ${Math.floor(i / 5) + 1}, Column ${(i % 5) + 1}`);
    cell.tabIndex = i === 0 ? 0 : -1;
    cell.addEventListener('click', () => markCell(i));
    gridContainer.appendChild(cell);
  }

  updateStatus();
}

function markCell(idx) {
  if (!gameActive || marked[idx]) return;

  marked[idx] = true;
  markHistory.push(idx);
  const cell = document.getElementById(`game-cell-${idx}`);
  cell.classList.add('marked');
  cell.setAttribute('aria-label', `${grid[idx]} marked, Row ${Math.floor(idx / 5) + 1}, Column ${(idx % 5) + 1}`);

  announce(`Marked ${grid[idx]}`);
  checkLines();
  updateStatus();
}

function undoMark() {
  if (markHistory.length === 0) return;
  const idx = markHistory.pop();
  marked[idx] = false;
  const cell = document.getElementById(`game-cell-${idx}`);
  cell.classList.remove('marked', 'in-line');
  cell.setAttribute('aria-label', `Number ${grid[idx]}, Row ${Math.floor(idx / 5) + 1}, Column ${(idx % 5) + 1}`);

  // Recalculate lines
  completedLines = new Set();
  linesCount = 0;
  document.querySelectorAll('.game-cell.in-line').forEach(c => c.classList.remove('in-line'));

  LINES.forEach((line, li) => {
    if (line.every(i => marked[i])) {
      completedLines.add(li);
      line.forEach(i => document.getElementById(`game-cell-${i}`).classList.add('in-line'));
    }
  });
  linesCount = completedLines.size;

  // Redraw SVG lines
  redrawAllLines();

  // Update word badges
  for (let i = 0; i < 5; i++) {
    const badge = document.getElementById(`word-badge-${i}`);
    if (i < linesCount) {
      badge.classList.add('scored');
      badge.setAttribute('aria-label', `${words[i]} - scored!`);
    } else {
      badge.classList.remove('scored');
      badge.setAttribute('aria-label', `${words[i]} - not yet scored`);
    }
  }

  announce(`Unmarked ${grid[idx]}`);
  updateStatus();
}

function checkLines() {
  let newLineFound = false;

  LINES.forEach((line, li) => {
    if (!completedLines.has(li) && line.every(i => marked[i])) {
      completedLines.add(li);
      linesCount++;
      newLineFound = true;
      line.forEach(i => document.getElementById(`game-cell-${i}`).classList.add('in-line'));
      drawLineSVG(li, line);
    }
  });

  // Update word badges
  for (let i = 0; i < 5; i++) {
    const badge = document.getElementById(`word-badge-${i}`);
    if (i < linesCount) {
      badge.classList.add('scored');
      badge.setAttribute('aria-label', `${words[i]} - scored!`);
    } else {
      badge.classList.remove('scored');
      badge.setAttribute('aria-label', `${words[i]} - not yet scored`);
    }
  }

  if (newLineFound && linesCount <= 5) {
    announce(`Line completed! ${words[linesCount - 1]} scored! ${linesCount} of 5.`);
  }

  if (linesCount >= 5) {
    gameActive = false;
    setTimeout(() => {
      document.getElementById('win-message').textContent =
        `All 5 words completed: ${words.join(' - ')}!`;
      document.getElementById('win-overlay').classList.add('show');
      announce('You win! All 5 words completed!');
    }, 400);
  }
}

// Draw a strike-through SVG line across the completed cells
function drawLineSVG(lineIdx, cellIndices) {
  const gridEl = document.getElementById('game-grid');
  const svg = document.getElementById('line-overlay');
  if (!gridEl || !svg) return;

  // Match SVG size to grid
  const w = gridEl.offsetWidth;
  const h = gridEl.offsetHeight;
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  const firstCell = document.getElementById(`game-cell-${cellIndices[0]}`);
  const lastCell = document.getElementById(`game-cell-${cellIndices[4]}`);

  // Use offsetLeft/offsetTop relative to grid parent
  const x1 = firstCell.offsetLeft + firstCell.offsetWidth / 2;
  const y1 = firstCell.offsetTop + firstCell.offsetHeight / 2;
  const x2 = lastCell.offsetLeft + lastCell.offsetWidth / 2;
  const y2 = lastCell.offsetTop + lastCell.offsetHeight / 2;

  // Extend line a bit beyond cell centers
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const extend = 10;
  const ex = (dx / len) * extend;
  const ey = (dy / len) * extend;

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1 - ex);
  line.setAttribute('y1', y1 - ey);
  line.setAttribute('x2', x2 + ex);
  line.setAttribute('y2', y2 + ey);
  line.setAttribute('data-line-idx', lineIdx);
  svg.appendChild(line);
}

// Redraw all current SVG lines (used after undo or resize)
function redrawAllLines() {
  const svg = document.getElementById('line-overlay');
  if (!svg) return;
  svg.innerHTML = '';
  completedLines.forEach(li => {
    drawLineSVG(li, LINES[li]);
  });
}

function updateStatus() {
  const markedCount = marked.filter(Boolean).length;
  document.getElementById('mark-count').textContent = `${markedCount} marked`;
  document.getElementById('btn-undo').disabled = markHistory.length === 0;
  document.getElementById('lines-tracker').textContent =
    `Lines: ${linesCount}/5 · Possible lines remaining: ${12 - completedLines.size}`;

  const statusEl = document.getElementById('game-status');
  if (linesCount >= 5) {
    statusEl.innerHTML = '<strong>🎉 BINGO! All words scored!</strong>';
  } else if (linesCount > 0) {
    statusEl.innerHTML = `<strong>${linesCount}</strong> of 5 words scored — keep going!`;
  } else {
    statusEl.textContent = 'Click a number to mark it';
  }
}

function closeWin() {
  document.getElementById('win-overlay').classList.remove('show');
  resetGame();
}

function resetGame() {
  gameActive = false;
  switchPhase('phase-words');
  document.getElementById('word-0').focus();
}

// ============ NAVIGATION ============
function switchPhase(id) {
  document.querySelectorAll('.phase').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// Grid keyboard navigation (roving tabindex)
document.addEventListener('keydown', (e) => {
  // Game grid navigation
  if (document.getElementById('phase-game').classList.contains('active')) {
    const focused = document.activeElement;
    if (focused && focused.classList.contains('game-cell')) {
      const match = focused.id.match(/game-cell-(\d+)/);
      if (!match) return;
      const idx = parseInt(match[1]);
      const row = Math.floor(idx / 5);
      const col = idx % 5;
      let next = -1;

      if (e.key === 'ArrowRight' && col < 4) next = idx + 1;
      if (e.key === 'ArrowLeft' && col > 0) next = idx - 1;
      if (e.key === 'ArrowDown' && row < 4) next = idx + 5;
      if (e.key === 'ArrowUp' && row > 0) next = idx - 5;

      if (next >= 0) {
        e.preventDefault();
        focused.tabIndex = -1;
        const nextEl = document.getElementById(`game-cell-${next}`);
        nextEl.tabIndex = 0;
        nextEl.focus();
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        markCell(idx);
      }
    }

    // Ctrl+Z for undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undoMark();
    }
  }

  // Grid setup: R to randomize, Ctrl+Z to undo placement
  if (document.getElementById('phase-grid').classList.contains('active')) {
    if (e.key === 'r' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
      randomizeGrid();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undoGridPlace();
    }
  }

  // Global: Ctrl+Enter to proceed
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if (document.getElementById('phase-words').classList.contains('active')) {
      const btn = document.getElementById('btn-words-next');
      if (!btn.disabled) { e.preventDefault(); goToGridPhase(); }
    } else if (document.getElementById('phase-grid').classList.contains('active')) {
      const btn = document.getElementById('btn-grid-next');
      if (!btn.disabled) { e.preventDefault(); startGame(); }
    }
  }
});

// Redraw SVG lines on resize/orientation change
window.addEventListener('resize', () => {
  if (gameActive || completedLines.size > 0) {
    redrawAllLines();
  }
});
