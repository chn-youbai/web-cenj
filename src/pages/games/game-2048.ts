import { getStorageItem, setStorageItem } from "@/core/storage";

export type Direction2048 = "up" | "down" | "left" | "right";
export type Grid2048 = number[][];

const BEST_SCORE_KEY = "cenj_game_2048_best_v1";

export function createEmptyGrid(): Grid2048 {
  return Array.from({ length: 4 }, () => [0, 0, 0, 0]);
}

export function cloneGrid(grid: Grid2048): Grid2048 {
  return grid.map((row) => [...row]);
}

export function spawnRandomTile(grid: Grid2048): boolean {
  const empty: Array<[number, number]> = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (grid[r]?.[c] === 0) {
        empty.push([r, c]);
      }
    }
  }
  if (empty.length === 0) return false;
  const pick = empty[Math.floor(Math.random() * empty.length)];
  if (!pick) return false;
  const [r, c] = pick;
  const row = grid[r];
  if (row) {
    row[c] = Math.random() < 0.9 ? 2 : 4;
  }
  return true;
}

function slideAndMergeRow(row: number[]): { next: number[]; gained: number; moved: boolean } {
  const nonZero = row.filter((v) => v !== 0);
  const merged: number[] = [];
  let gained = 0;

  for (let i = 0; i < nonZero.length; i++) {
    const cur = nonZero[i] ?? 0;
    const nxt = nonZero[i + 1] ?? 0;
    if (cur !== 0 && cur === nxt) {
      const sum = cur * 2;
      merged.push(sum);
      gained += sum;
      i += 1;
    } else {
      merged.push(cur);
    }
  }

  while (merged.length < 4) merged.push(0);
  const moved = merged.some((v, idx) => v !== row[idx]);
  return { next: merged, gained, moved };
}

export function moveGrid(
  grid: Grid2048,
  dir: Direction2048,
): { next: Grid2048; gained: number; moved: boolean } {
  const work = cloneGrid(grid);
  let totalGained = 0;
  let anyMoved = false;

  if (dir === "left" || dir === "right") {
    for (let r = 0; r < 4; r++) {
      const row = work[r] ?? [0, 0, 0, 0];
      const ordered = dir === "right" ? [...row].reverse() : row;
      const res = slideAndMergeRow(ordered);
      const finalRow = dir === "right" ? res.next.reverse() : res.next;
      work[r] = finalRow;
      totalGained += res.gained;
      if (res.moved) anyMoved = true;
    }
  } else {
    for (let c = 0; c < 4; c++) {
      const col = [work[0]?.[c] ?? 0, work[1]?.[c] ?? 0, work[2]?.[c] ?? 0, work[3]?.[c] ?? 0];
      const ordered = dir === "down" ? [...col].reverse() : col;
      const res = slideAndMergeRow(ordered);
      const finalCol = dir === "down" ? res.next.reverse() : res.next;
      for (let r = 0; r < 4; r++) {
        const targetRow = work[r];
        if (targetRow) targetRow[c] = finalCol[r] ?? 0;
      }
      totalGained += res.gained;
      if (res.moved) anyMoved = true;
    }
  }

  return { next: work, gained: totalGained, moved: anyMoved };
}

export function hasAvailableMoves(grid: Grid2048): boolean {
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const val = grid[r]?.[c] ?? 0;
      if (val === 0) return true;
      if (r < 3 && val === grid[r + 1]?.[c]) return true;
      if (c < 3 && val === grid[r]?.[c + 1]) return true;
    }
  }
  return false;
}

export function mount2048Game(container: HTMLElement): void {
  let grid = createEmptyGrid();
  let prevGrid: Grid2048 | null = null;
  let score = 0;
  let prevScore = 0;
  let bestScore = Number.parseInt(getStorageItem(BEST_SCORE_KEY) || "0", 10) || 0;

  spawnRandomTile(grid);
  spawnRandomTile(grid);

  container.innerHTML = `
    <div class="game-head">
      <div class="game-stats">
        <div class="stat-pill"><span>当前得分</span><strong id="g2048Score">0</strong></div>
        <div class="stat-pill"><span>最高纪录</span><strong id="g2048Best">${bestScore}</strong></div>
      </div>
      <div class="game-actions">
        <button type="button" class="game-btn" id="g2048UndoBtn" disabled>撤回</button>
        <button type="button" class="game-btn primary" id="g2048RestartBtn">重开</button>
      </div>
    </div>
    <div class="g2048-board-wrap">
      <div class="g2048-board" id="g2048Board" role="grid" aria-label="2048 棋盘"></div>
      <div class="game-overlay" id="g2048OverOverlay" hidden>
        <p class="overlay-title">棋局结束</p>
        <button type="button" class="game-btn primary" id="g2048OverRestartBtn">再来一局</button>
      </div>
    </div>
    <p class="game-tip">桌面端可用方向键 ↑ ↓ ← → 操作，手机端直接上下左右滑动棋盘</p>
  `;

  const boardEl = container.querySelector<HTMLElement>("#g2048Board");
  const scoreEl = container.querySelector<HTMLElement>("#g2048Score");
  const bestEl = container.querySelector<HTMLElement>("#g2048Best");
  const undoBtn = container.querySelector<HTMLButtonElement>("#g2048UndoBtn");
  const overOverlay = container.querySelector<HTMLElement>("#g2048OverOverlay");

  function render(): void {
    if (!boardEl) return;
    const cells: string[] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const val = grid[r]?.[c] ?? 0;
        const tileClass = val === 0 ? "tile-0" : val > 2048 ? "tile-super" : `tile-${val}`;
        cells.push(
          `<div class="g2048-cell ${tileClass}">${val > 0 ? `<span>${val}</span>` : ""}</div>`,
        );
      }
    }
    boardEl.innerHTML = cells.join("");

    if (scoreEl) scoreEl.textContent = String(score);
    if (bestEl) bestEl.textContent = String(bestScore);
    if (undoBtn) undoBtn.disabled = prevGrid === null;
    if (overOverlay) overOverlay.hidden = hasAvailableMoves(grid);
  }

  function handleMove(dir: Direction2048): void {
    const res = moveGrid(grid, dir);
    if (!res.moved) return;

    prevGrid = cloneGrid(grid);
    prevScore = score;
    grid = res.next;
    score += res.gained;
    spawnRandomTile(grid);

    if (score > bestScore) {
      bestScore = score;
      setStorageItem(BEST_SCORE_KEY, String(bestScore));
    }
    render();
  }

  function restart(): void {
    grid = createEmptyGrid();
    prevGrid = null;
    score = 0;
    prevScore = 0;
    spawnRandomTile(grid);
    spawnRandomTile(grid);
    render();
  }

  container.querySelector("#g2048RestartBtn")?.addEventListener("click", restart);
  container.querySelector("#g2048OverRestartBtn")?.addEventListener("click", restart);
  undoBtn?.addEventListener("click", () => {
    if (!prevGrid) return;
    grid = prevGrid;
    score = prevScore;
    prevGrid = null;
    render();
  });

  // Touch swipe support
  let startX = 0;
  let startY = 0;
  boardEl?.addEventListener(
    "touchstart",
    (e) => {
      const t = e.changedTouches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
    },
    { passive: true },
  );

  boardEl?.addEventListener(
    "touchend",
    (e) => {
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        handleMove(dx > 0 ? "right" : "left");
      } else {
        handleMove(dy > 0 ? "down" : "up");
      }
    },
    { passive: true },
  );

  // Keyboard support when 2048 panel is visible and user is not typing
  document.addEventListener("keydown", (e) => {
    if (container.hidden) return;
    const tag = (document.activeElement as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (document.getElementById("cmdPaletteBackdrop")?.classList.contains("open")) return;

    const map: Record<string, Direction2048> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    const dir = map[e.key];
    if (!dir) return;
    e.preventDefault();
    handleMove(dir);
  });

  render();
}
