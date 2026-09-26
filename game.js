const SIZE = 6;
const WIN_VALUE = 2048;
const GAP = 10;
const BEST_KEY = "game-2048-6x6-best";

const gridEl = document.getElementById("grid");
const tilesEl = document.getElementById("tiles");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const undoBtn = document.getElementById("undo");
const restartBtn = document.getElementById("restart");
const overlayEl = document.getElementById("overlay");
const overlayTitleEl = document.getElementById("overlay-title");
const keepPlayingBtn = document.getElementById("keep-playing");
const overlayRestartBtn = document.getElementById("overlay-restart");
const boardWrapEl = document.getElementById("board-wrap");

let nextId = 1;
let board = [];
let score = 0;
let best = Number(localStorage.getItem(BEST_KEY) || 0);
let won = false;
let keepPlaying = false;
let over = false;
let history = [];
let tileEls = new Map();
let touchStart = null;

function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

function cloneBoard(source) {
  return source.map((row) => row.map((tile) => (tile ? { ...tile } : null)));
}

function emptyCells(source = board) {
  const cells = [];
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (!source[r][c]) cells.push([r, c]);
    }
  }
  return cells;
}

function spawnTile(source = board) {
  const cells = emptyCells(source);
  if (!cells.length) return null;
  const [r, c] = cells[Math.floor(Math.random() * cells.length)];
  source[r][c] = { id: nextId++, value: Math.random() < 0.9 ? 2 : 4, merged: false, spawn: true };
}

function slideLine(line) {
  const tiles = line.filter(Boolean);
  const result = Array(SIZE).fill(null);
  let write = 0;
  let gained = 0;

  for (let i = 0; i < tiles.length; i += 1) {
    const current = tiles[i];
    const next = tiles[i + 1];
    if (next && current.value === next.value) {
      result[write] = { id: current.id, value: current.value * 2, merged: true, spawn: false };
      gained += current.value * 2;
      i += 1;
    } else {
      result[write] = { ...current, merged: false, spawn: false };
    }
    write += 1;
  }

  const changed = line.some((tile, index) => {
    const next = result[index];
    return (tile && tile.id) !== (next && next.id) || (tile && next && tile.value !== next.value);
  });

  return { line: result, gained, changed };
}

function transpose(source) {
  return source[0].map((_, column) => source.map((row) => row[column]));
}

function reverseRows(source) {
  return source.map((row) => [...row].reverse());
}

function moveBoard(source, direction) {
  let rotated = cloneBoard(source);

  if (direction === "up" || direction === "down") rotated = transpose(rotated);
  if (direction === "right" || direction === "down") rotated = reverseRows(rotated);

  let gained = 0;
  let changed = false;
  rotated = rotated.map((row) => {
    const slid = slideLine(row);
    gained += slid.gained;
    changed = changed || slid.changed;
    return slid.line;
  });

  if (direction === "right" || direction === "down") rotated = reverseRows(rotated);
  if (direction === "up" || direction === "down") rotated = transpose(rotated);

  return { next: rotated, gained, changed };
}

function canMove(source = board) {
  if (emptyCells(source).length) return true;
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const value = source[r][c].value;
      if (c + 1 < SIZE && source[r][c + 1].value === value) return true;
      if (r + 1 < SIZE && source[r + 1][c].value === value) return true;
    }
  }
  return false;
}

function reachedWin(source = board) {
  return source.some((row) => row.some((tile) => tile && tile.value >= WIN_VALUE));
}

function cellSize() {
  return (tilesEl.clientWidth - GAP * (SIZE - 1)) / SIZE;
}

function fontSizeFor(value, size) {
  const digits = String(value).length;
  const scale = digits <= 2 ? 0.46 : digits === 3 ? 0.38 : digits === 4 ? 0.3 : 0.24;
  return `${Math.max(14, Math.floor(size * scale))}px`;
}

function showScoreGain(gained) {
  const old = document.getElementById("score-add");
  if (!old || !gained) return;
  const next = old.cloneNode(true);
  next.hidden = false;
  next.textContent = `+${gained}`;
  old.replaceWith(next);
}

function showOverlay(title, canContinue) {
  overlayTitleEl.textContent = title;
  keepPlayingBtn.hidden = !canContinue;
  overlayEl.hidden = false;
}

function hideOverlay() {
  overlayEl.hidden = true;
}

function render(animate = true) {
  const size = cellSize();
  const usedIds = new Set();

  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const tile = board[r][c];
      if (!tile) continue;
      usedIds.add(tile.id);

      let el = tileEls.get(tile.id);
      const isNew = !el;
      if (isNew) {
        el = document.createElement("div");
        el.className = "tile";
        tilesEl.appendChild(el);
        tileEls.set(tile.id, el);
      }

      el.dataset.value = String(tile.value);
      el.textContent = String(tile.value);
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.fontSize = fontSizeFor(tile.value, size);
      const x = `${c * (size + GAP)}px`;
      const y = `${r * (size + GAP)}px`;
      el.style.setProperty("--x", x);
      el.style.setProperty("--y", y);
      el.style.transform = `translate(${x}, ${y})`;

      if (!animate || isNew) {
        el.style.transition = "none";
        void el.offsetWidth;
        el.style.transition = "";
      }

      el.classList.toggle("spawn", Boolean(tile.spawn));
      el.classList.toggle("merge", Boolean(tile.merged));
    }
  }

  for (const [id, el] of tileEls) {
    if (!usedIds.has(id)) {
      el.remove();
      tileEls.delete(id);
    }
  }

  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
}

function clearFlagsSoon() {
  setTimeout(() => {
    for (const row of board) {
      for (const tile of row) {
        if (!tile) continue;
        tile.spawn = false;
        tile.merged = false;
      }
    }
    for (const el of tileEls.values()) {
      el.classList.remove("spawn", "merge");
    }
  }, 200);
}

function pushHistory() {
  history = [{
    board: cloneBoard(board),
    score,
    won,
    keepPlaying,
    over,
  }];
  undoBtn.disabled = false;
}

function afterMove(gained) {
  score += gained;
  if (score > best) {
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
  }
  showScoreGain(gained);
  spawnTile();
  render();
  clearFlagsSoon();

  if (!won && reachedWin()) {
    won = true;
    showOverlay("Победа!", true);
    return;
  }

  if (!canMove()) {
    over = true;
    showOverlay("Игра окончена", false);
  }
}

function playMove(direction) {
  if (over) return;
  if (!overlayEl.hidden && won && !keepPlaying) return;

  const { next, gained, changed } = moveBoard(board, direction);
  if (!changed) return;

  pushHistory();
  board = next;
  afterMove(gained);
}

function undo() {
  const prev = history.pop();
  if (!prev) return;
  board = cloneBoard(prev.board);
  score = prev.score;
  won = prev.won;
  keepPlaying = prev.keepPlaying;
  over = prev.over;
  hideOverlay();
  undoBtn.disabled = true;
  render(false);
}

function startGame() {
  nextId = 1;
  board = emptyBoard();
  score = 0;
  won = false;
  keepPlaying = false;
  over = false;
  history = [];
  undoBtn.disabled = true;
  hideOverlay();
  tileEls.forEach((el) => el.remove());
  tileEls.clear();
  spawnTile();
  spawnTile();
  render(false);
  clearFlagsSoon();
}

function buildGrid() {
  gridEl.innerHTML = "";
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    const cell = document.createElement("div");
    cell.className = "cell";
    gridEl.appendChild(cell);
  }
}

function directionFromKey(key) {
  if (key === "ArrowLeft" || key === "a" || key === "A" || key === "ф" || key === "Ф") return "left";
  if (key === "ArrowRight" || key === "d" || key === "D" || key === "в" || key === "В") return "right";
  if (key === "ArrowUp" || key === "w" || key === "W" || key === "ц" || key === "Ц") return "up";
  if (key === "ArrowDown" || key === "s" || key === "S" || key === "ы" || key === "Ы") return "down";
  return null;
}

function directionFromSwipe(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
}

buildGrid();
bestEl.textContent = String(best);
startGame();

restartBtn.addEventListener("click", startGame);
overlayRestartBtn.addEventListener("click", startGame);
undoBtn.addEventListener("click", undo);
keepPlayingBtn.addEventListener("click", () => {
  keepPlaying = true;
  hideOverlay();
});

window.addEventListener("keydown", (event) => {
  const direction = directionFromKey(event.key);
  if (!direction) return;
  event.preventDefault();
  playMove(direction);
});

boardWrapEl.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button")) return;
  touchStart = { x: event.clientX, y: event.clientY };
});

window.addEventListener("pointerup", (event) => {
  if (!touchStart) return;
  const direction = directionFromSwipe(event.clientX - touchStart.x, event.clientY - touchStart.y);
  touchStart = null;
  if (direction) playMove(direction);
});

window.addEventListener("resize", () => render(false));
