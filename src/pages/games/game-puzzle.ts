import { EMBEDDED_IMAGES, getImageUrl } from "../gallery/photos";

export function createSolvedPuzzle(size: number): number[] {
  const total = size * size;
  const arr: number[] = [];
  for (let i = 1; i < total; i++) {
    arr.push(i);
  }
  arr.push(0); // 0 represents empty slot
  return arr;
}

export function isPuzzleSolved(board: number[]): boolean {
  for (let i = 0; i < board.length - 1; i++) {
    if (board[i] !== i + 1) return false;
  }
  return board[board.length - 1] === 0;
}

export function getAdjacentIndices(emptyIdx: number, size: number): number[] {
  const r = Math.floor(emptyIdx / size);
  const c = emptyIdx % size;
  const adj: number[] = [];
  if (r > 0) adj.push((r - 1) * size + c);
  if (r < size - 1) adj.push((r + 1) * size + c);
  if (c > 0) adj.push(r * size + (c - 1));
  if (c < size - 1) adj.push(r * size + (c + 1));
  return adj;
}

/** Shuffle by performing valid random moves from solved state so 100% solvable */
export function createShuffledPuzzle(size: number, steps = size * size * 18): number[] {
  const board = createSolvedPuzzle(size);
  let emptyIdx = board.length - 1;
  let lastEmpty = -1;

  for (let i = 0; i < steps; i++) {
    const candidates = getAdjacentIndices(emptyIdx, size).filter((idx) => idx !== lastEmpty);
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    if (pick === undefined) continue;
    board[emptyIdx] = board[pick] ?? 0;
    board[pick] = 0;
    lastEmpty = emptyIdx;
    emptyIdx = pick;
  }

  if (isPuzzleSolved(board)) {
    const first = getAdjacentIndices(emptyIdx, size)[0] ?? 0;
    board[emptyIdx] = board[first] ?? 0;
    board[first] = 0;
  }
  return board;
}

export function isPuzzleSolvable(board: number[], size: number): boolean {
  if (board.length !== size * size) return false;
  let inversions = 0;
  for (let i = 0; i < board.length; i++) {
    const a = board[i] ?? 0;
    if (a === 0) continue;
    for (let j = i + 1; j < board.length; j++) {
      const b = board[j] ?? 0;
      if (b !== 0 && a > b) inversions += 1;
    }
  }
  if (size % 2 === 1) {
    return inversions % 2 === 0;
  }
  const emptyIdx = board.indexOf(0);
  if (emptyIdx < 0) return false;
  const emptyRowFromBottom = size - Math.floor(emptyIdx / size);
  return (inversions + emptyRowFromBottom) % 2 === 1;
}

function heuristic(board: number[], size: number): number {
  let dist = 0;
  for (let i = 0; i < board.length; i++) {
    const val = board[i] ?? 0;
    if (val === 0) continue;
    const r = Math.floor(i / size);
    const c = i % size;
    const tr = Math.floor((val - 1) / size);
    const tc = (val - 1) % size;
    dist += Math.abs(r - tr) + Math.abs(c - tc);
  }

  // Linear conflicts in rows
  for (let r = 0; r < size; r++) {
    const rowStart = r * size;
    for (let c1 = 0; c1 < size; c1++) {
      const v1 = board[rowStart + c1] ?? 0;
      if (v1 === 0 || Math.floor((v1 - 1) / size) !== r) continue;
      const tc1 = (v1 - 1) % size;
      for (let c2 = c1 + 1; c2 < size; c2++) {
        const v2 = board[rowStart + c2] ?? 0;
        if (v2 === 0 || Math.floor((v2 - 1) / size) !== r) continue;
        const tc2 = (v2 - 1) % size;
        if (tc1 > tc2) dist += 2;
      }
    }
  }

  // Linear conflicts in columns
  for (let c = 0; c < size; c++) {
    for (let r1 = 0; r1 < size; r1++) {
      const v1 = board[r1 * size + c] ?? 0;
      if (v1 === 0 || (v1 - 1) % size !== c) continue;
      const tr1 = Math.floor((v1 - 1) / size);
      for (let r2 = r1 + 1; r2 < size; r2++) {
        const v2 = board[r2 * size + c] ?? 0;
        if (v2 === 0 || (v2 - 1) % size !== c) continue;
        const tr2 = Math.floor((v2 - 1) / size);
        if (tr1 > tr2) dist += 2;
      }
    }
  }

  return dist;
}

interface SearchNode {
  board: number[];
  emptyIdx: number;
  g: number;
  f: number;
  key: string;
  parentIdx: number;
  movedTileIdx: number;
}

class MinHeap {
  private data: Array<{ nodeIdx: number; f: number; g: number }> = [];

  get length(): number {
    return this.data.length;
  }

  push(item: { nodeIdx: number; f: number; g: number }): void {
    this.data.push(item);
    let i = this.data.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const cur = this.data[i];
      const par = this.data[p];
      if (!cur || !par) break;
      if (cur.f < par.f || (cur.f === par.f && cur.g > par.g)) {
        this.data[i] = par;
        this.data[p] = cur;
        i = p;
      } else {
        break;
      }
    }
  }

  pop(): { nodeIdx: number; f: number; g: number } | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0 && last) {
      this.data[0] = last;
      let i = 0;
      const n = this.data.length;
      while (true) {
        let best = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        const bestItem = this.data[best];
        const leftItem = l < n ? this.data[l] : undefined;
        const rightItem = r < n ? this.data[r] : undefined;
        if (
          leftItem &&
          bestItem &&
          (leftItem.f < bestItem.f || (leftItem.f === bestItem.f && leftItem.g > bestItem.g))
        ) {
          best = l;
        }
        const curBest = this.data[best];
        if (
          rightItem &&
          curBest &&
          (rightItem.f < curBest.f || (rightItem.f === curBest.f && rightItem.g > curBest.g))
        ) {
          best = r;
        }
        if (best === i) break;
        const tmp = this.data[i];
        const swapItem = this.data[best];
        if (tmp && swapItem) {
          this.data[i] = swapItem;
          this.data[best] = tmp;
        }
        i = best;
      }
    }
    return top;
  }
}

function boardKey(board: number[]): string {
  return board.join(",");
}

/**
 * Compute sequence of clicked tile indices to solve the sliding puzzle.
 * Uses optimal A* (weight = 1) for 3x3 and fast Weighted A* (weight = 2.2) for 4x4.
 */
export function solvePuzzle(board: number[], size: number, maxNodes = 120000): number[] | null {
  if (!isPuzzleSolvable(board, size)) return null;
  if (isPuzzleSolved(board)) return [];

  const emptyIdx = board.indexOf(0);
  if (emptyIdx < 0) return null;

  const weight = size <= 3 ? 1 : 2.2;
  const startBoard = [...board];
  const startKey = boardKey(startBoard);
  const startH = heuristic(startBoard, size);

  const nodes: SearchNode[] = [
    {
      board: startBoard,
      emptyIdx,
      g: 0,
      f: startH * weight,
      key: startKey,
      parentIdx: -1,
      movedTileIdx: -1,
    },
  ];

  const bestG = new Map<string, number>([[startKey, 0]]);
  const heap = new MinHeap();
  heap.push({ nodeIdx: 0, f: startH * weight, g: 0 });

  while (heap.length > 0 && nodes.length < maxNodes) {
    const entry = heap.pop();
    if (!entry) break;
    const cur = nodes[entry.nodeIdx];
    if (!cur) continue;
    const knownBest = bestG.get(cur.key);
    if (knownBest !== undefined && cur.g > knownBest) continue;

    if (isPuzzleSolved(cur.board)) {
      const path: number[] = [];
      let p = entry.nodeIdx;
      while (p > 0) {
        const node = nodes[p];
        if (!node) break;
        path.push(node.movedTileIdx);
        p = node.parentIdx;
      }
      path.reverse();
      return path;
    }

    const adj = getAdjacentIndices(cur.emptyIdx, size);
    const parentEmpty = cur.parentIdx >= 0 ? (nodes[cur.parentIdx]?.emptyIdx ?? -1) : -1;

    for (const nextTileIdx of adj) {
      if (nextTileIdx === parentEmpty) continue;
      const nextBoard = [...cur.board];
      nextBoard[cur.emptyIdx] = nextBoard[nextTileIdx] ?? 0;
      nextBoard[nextTileIdx] = 0;

      const nextKey = boardKey(nextBoard);
      const nextG = cur.g + 1;
      const prevG = bestG.get(nextKey);
      if (prevG !== undefined && prevG <= nextG) continue;

      bestG.set(nextKey, nextG);
      const nextF = nextG + heuristic(nextBoard, size) * weight;
      const newIdx = nodes.length;
      nodes.push({
        board: nextBoard,
        emptyIdx: nextTileIdx,
        g: nextG,
        f: nextF,
        key: nextKey,
        parentIdx: entry.nodeIdx,
        movedTileIdx: nextTileIdx,
      });
      heap.push({ nodeIdx: newIdx, f: nextF, g: nextG });
    }
  }

  return null;
}

export function mountAerialPuzzleGame(container: HTMLElement): void {
  let size = 3;
  let imageIndex = Math.floor(Math.random() * EMBEDDED_IMAGES.length);
  let board = createShuffledPuzzle(size);
  let moves = 0;
  let showPreview = false;
  let showNumbers = false;
  let won = false;
  let autoDemoFinished = false;
  let hintTileIdx: number | null = null;
  let cachedSolution: number[] | null = null;
  let autoSolveTimer: number | null = null;

  function currentImageUrl(): string {
    const name = EMBEDDED_IMAGES[imageIndex] ?? EMBEDDED_IMAGES[0] ?? "100.jpg";
    return getImageUrl(name);
  }

  container.innerHTML = `
    <div class="game-head">
      <div class="game-stats">
        <div class="stat-pill"><span>步数</span><strong id="puzzleMoves">0</strong></div>
        <div class="stat-pill"><span>图号</span><strong id="puzzleImgIdx">#1</strong></div>
      </div>
      <div class="game-actions">
        <button type="button" class="game-btn" id="puzzleSizeBtn">3×3 休闲</button>
        <button type="button" class="game-btn" id="puzzlePreviewBtn">看原图</button>
        <button type="button" class="game-btn" id="puzzleNumBtn">显示编号</button>
        <button type="button" class="game-btn" id="puzzleHintBtn">提示一步</button>
        <button type="button" class="game-btn" id="puzzleSolveBtn">自动求解</button>
        <button type="button" class="game-btn primary" id="puzzleNextImgBtn">换一张</button>
      </div>
    </div>
    <div class="puzzle-stage">
      <div class="puzzle-board" id="puzzleBoard" role="grid" aria-label="航拍拼图棋盘"></div>
      <div class="puzzle-preview-box" id="puzzlePreviewBox" hidden>
        <img id="puzzlePreviewImg" alt="航拍原图参考" />
      </div>
      <div class="game-overlay" id="puzzleWinOverlay" hidden>
        <p class="overlay-title">拼图完成！</p>
        <p class="overlay-sub" id="puzzleWinSummary"></p>
        <button type="button" class="game-btn primary" id="puzzleAgainBtn">再拼一张</button>
      </div>
    </div>
    <p class="game-tip" id="puzzleTip">直接点击空白格相邻的图块即可滑动拼合，素材来自画廊 121 张航拍精选</p>
  `;

  const boardEl = container.querySelector<HTMLElement>("#puzzleBoard");
  const movesEl = container.querySelector<HTMLElement>("#puzzleMoves");
  const idxEl = container.querySelector<HTMLElement>("#puzzleImgIdx");
  const sizeBtn = container.querySelector<HTMLButtonElement>("#puzzleSizeBtn");
  const previewBtn = container.querySelector<HTMLButtonElement>("#puzzlePreviewBtn");
  const numBtn = container.querySelector<HTMLButtonElement>("#puzzleNumBtn");
  const hintBtn = container.querySelector<HTMLButtonElement>("#puzzleHintBtn");
  const solveBtn = container.querySelector<HTMLButtonElement>("#puzzleSolveBtn");
  const previewBox = container.querySelector<HTMLElement>("#puzzlePreviewBox");
  const previewImg = container.querySelector<HTMLImageElement>("#puzzlePreviewImg");
  const winOverlay = container.querySelector<HTMLElement>("#puzzleWinOverlay");
  const winSummary = container.querySelector<HTMLElement>("#puzzleWinSummary");
  const tipEl = container.querySelector<HTMLElement>("#puzzleTip");

  function stopAutoSolve(): void {
    if (autoSolveTimer !== null) {
      window.clearInterval(autoSolveTimer);
      autoSolveTimer = null;
    }
  }

  function applyMove(tileIdx: number): boolean {
    const emptyIdx = board.indexOf(0);
    if (tileIdx < 0 || emptyIdx < 0) return false;
    const adj = getAdjacentIndices(emptyIdx, size);
    if (!adj.includes(tileIdx)) return false;
    board[emptyIdx] = board[tileIdx] ?? 0;
    board[tileIdx] = 0;
    return true;
  }

  function render(): void {
    if (!boardEl) return;
    const imgUrl = currentImageUrl();
    if (previewImg && previewImg.src !== imgUrl) {
      previewImg.src = imgUrl;
    }

    boardEl.style.gridTemplateColumns = `repeat(${size}, minmax(0, 1fr))`;
    const htmlParts: string[] = [];

    for (let idx = 0; idx < board.length; idx++) {
      const tile = board[idx] ?? 0;
      if (tile === 0) {
        htmlParts.push('<div class="puzzle-tile empty" aria-hidden="true"></div>');
        continue;
      }
      const origRow = Math.floor((tile - 1) / size);
      const origCol = (tile - 1) % size;
      const posX = size > 1 ? (origCol / (size - 1)) * 100 : 0;
      const posY = size > 1 ? (origRow / (size - 1)) * 100 : 0;
      const isHint = hintTileIdx === idx;
      const numBadge = showNumbers ? `<span class="puzzle-tile-num">${tile}</span>` : "";
      htmlParts.push(`
        <button
          type="button"
          class="puzzle-tile${isHint ? " hint" : ""}"
          data-tile-idx="${idx}"
          aria-label="拼图块 ${tile}${isHint ? "（推荐移动）" : ""}"
          style="background-image:url('${imgUrl}'); background-size:${size * 100}% ${size * 100}%; background-position:${posX}% ${posY}%;"
        >${numBadge}</button>
      `);
    }

    boardEl.innerHTML = htmlParts.join("");
    for (const btn of boardEl.querySelectorAll<HTMLButtonElement>("[data-tile-idx]")) {
      btn.addEventListener("click", () => {
        if (won || autoDemoFinished || autoSolveTimer !== null) return;
        const idx = Number.parseInt(btn.dataset.tileIdx ?? "-1", 10);
        if (!applyMove(idx)) return;

        if (cachedSolution && cachedSolution[0] === idx) {
          cachedSolution.shift();
        } else {
          cachedSolution = null;
        }
        hintTileIdx = null;
        moves += 1;
        won = isPuzzleSolved(board);
        render();
      });
    }

    const isAutoSolving = autoSolveTimer !== null;
    if (movesEl) movesEl.textContent = String(moves);
    if (idxEl) idxEl.textContent = `#${imageIndex + 1}`;
    if (sizeBtn) sizeBtn.textContent = size === 3 ? "3×3 休闲" : "4×4 挑战";
    if (previewBtn) {
      previewBtn.textContent = showPreview ? "收起原图" : "看原图";
      previewBtn.classList.toggle("active", showPreview);
    }
    if (numBtn) {
      numBtn.textContent = showNumbers ? "隐藏编号" : "显示编号";
      numBtn.classList.toggle("active", showNumbers);
    }
    if (hintBtn) {
      hintBtn.disabled = isAutoSolving || won || autoDemoFinished;
    }
    if (solveBtn) {
      solveBtn.textContent = isAutoSolving ? "停止演示" : "自动求解";
      solveBtn.classList.toggle("active", isAutoSolving);
      solveBtn.disabled = won || autoDemoFinished;
    }
    if (previewBox) previewBox.hidden = !showPreview;
    if (winOverlay) winOverlay.hidden = !won;
    if (winSummary && won) {
      winSummary.textContent = `仅用 ${moves} 步完成 ${size}×${size} 航拍拼图`;
    }
    if (tipEl) {
      if (isAutoSolving) {
        tipEl.textContent = "正在快速演示还原路径，点击「停止演示」可随时接管…";
      } else if (autoDemoFinished) {
        tipEl.textContent = "已演示还原至完整原图，点击右上角「换一张」开始下一局";
      } else {
        tipEl.textContent = "直接点击空白格相邻的图块即可滑动拼合，素材来自画廊 121 张航拍精选";
      }
    }
  }

  function resetPuzzle(nextImage = false): void {
    stopAutoSolve();
    if (nextImage) {
      imageIndex = (imageIndex + 1 + Math.floor(Math.random() * 17)) % EMBEDDED_IMAGES.length;
    }
    board = createShuffledPuzzle(size);
    moves = 0;
    won = false;
    autoDemoFinished = false;
    showPreview = false;
    hintTileIdx = null;
    cachedSolution = null;
    render();
  }

  sizeBtn?.addEventListener("click", () => {
    size = size === 3 ? 4 : 3;
    resetPuzzle(false);
  });

  previewBtn?.addEventListener("click", () => {
    showPreview = !showPreview;
    render();
  });

  numBtn?.addEventListener("click", () => {
    showNumbers = !showNumbers;
    render();
  });

  hintBtn?.addEventListener("click", () => {
    if (won || autoDemoFinished || autoSolveTimer !== null || isPuzzleSolved(board)) return;
    showPreview = false;
    if (!cachedSolution || cachedSolution.length === 0) {
      cachedSolution = solvePuzzle(board, size);
    }
    const nextIdx = cachedSolution?.[0];
    if (nextIdx !== undefined) {
      hintTileIdx = nextIdx;
      render();
    } else if (tipEl) {
      tipEl.textContent = "当前残局路径较深，可再点击「自动求解」或先手调几步后重试提示";
    }
  });

  solveBtn?.addEventListener("click", () => {
    if (autoSolveTimer !== null) {
      stopAutoSolve();
      render();
      return;
    }
    if (won || autoDemoFinished || isPuzzleSolved(board)) return;

    showPreview = false;
    hintTileIdx = null;
    const solution =
      cachedSolution && cachedSolution.length > 0 ? [...cachedSolution] : solvePuzzle(board, size);
    if (!solution || solution.length === 0) {
      if (tipEl) {
        tipEl.textContent = "当前局面步数较深，未能一次规划完整路径，建议手动调整几步或换一张";
      }
      return;
    }

    cachedSolution = null;
    let stepCursor = 0;
    autoSolveTimer = window.setInterval(() => {
      const tileIdx = solution[stepCursor];
      if (tileIdx === undefined) {
        stopAutoSolve();
        autoDemoFinished = isPuzzleSolved(board);
        render();
        return;
      }
      if (applyMove(tileIdx)) {
        moves += 1;
      }
      stepCursor += 1;
      if (stepCursor >= solution.length || isPuzzleSolved(board)) {
        stopAutoSolve();
        autoDemoFinished = isPuzzleSolved(board);
      }
      render();
    }, 70);

    render();
  });

  container.querySelector("#puzzleNextImgBtn")?.addEventListener("click", () => resetPuzzle(true));
  container.querySelector("#puzzleAgainBtn")?.addEventListener("click", () => resetPuzzle(true));

  render();
}
