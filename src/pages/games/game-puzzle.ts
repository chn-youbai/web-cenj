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

export function mountAerialPuzzleGame(container: HTMLElement): void {
  let size = 3;
  let imageIndex = Math.floor(Math.random() * EMBEDDED_IMAGES.length);
  let board = createShuffledPuzzle(size);
  let moves = 0;
  let showPreview = false;
  let won = false;

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
        <button type="button" class="game-btn" id="puzzleSizeBtn">3×3</button>
        <button type="button" class="game-btn" id="puzzlePreviewBtn">看原图</button>
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
    <p class="game-tip">直接点击空白格相邻的图块即可滑动拼合，素材来自画廊 121 张航拍精选</p>
  `;

  const boardEl = container.querySelector<HTMLElement>("#puzzleBoard");
  const movesEl = container.querySelector<HTMLElement>("#puzzleMoves");
  const idxEl = container.querySelector<HTMLElement>("#puzzleImgIdx");
  const sizeBtn = container.querySelector<HTMLButtonElement>("#puzzleSizeBtn");
  const previewBtn = container.querySelector<HTMLButtonElement>("#puzzlePreviewBtn");
  const previewBox = container.querySelector<HTMLElement>("#puzzlePreviewBox");
  const previewImg = container.querySelector<HTMLImageElement>("#puzzlePreviewImg");
  const winOverlay = container.querySelector<HTMLElement>("#puzzleWinOverlay");
  const winSummary = container.querySelector<HTMLElement>("#puzzleWinSummary");

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
      htmlParts.push(`
        <button
          type="button"
          class="puzzle-tile"
          data-tile-idx="${idx}"
          aria-label="拼图块 ${tile}"
          style="background-image:url('${imgUrl}'); background-size:${size * 100}% ${size * 100}%; background-position:${posX}% ${posY}%;"
        ></button>
      `);
    }

    boardEl.innerHTML = htmlParts.join("");
    for (const btn of boardEl.querySelectorAll<HTMLButtonElement>("[data-tile-idx]")) {
      btn.addEventListener("click", () => {
        if (won) return;
        const idx = Number.parseInt(btn.dataset.tileIdx ?? "-1", 10);
        const emptyIdx = board.indexOf(0);
        if (idx < 0 || emptyIdx < 0) return;
        const adj = getAdjacentIndices(emptyIdx, size);
        if (!adj.includes(idx)) return;
        board[emptyIdx] = board[idx] ?? 0;
        board[idx] = 0;
        moves += 1;
        won = isPuzzleSolved(board);
        render();
      });
    }

    if (movesEl) movesEl.textContent = String(moves);
    if (idxEl) idxEl.textContent = `#${imageIndex + 1}`;
    if (sizeBtn) sizeBtn.textContent = size === 3 ? "3×3 休闲" : "4×4 挑战";
    if (previewBtn) previewBtn.textContent = showPreview ? "收起原图" : "看原图";
    if (previewBox) previewBox.hidden = !showPreview;
    if (winOverlay) winOverlay.hidden = !won;
    if (winSummary && won) {
      winSummary.textContent = `仅用 ${moves} 步完成 ${size}×${size} 航拍拼图`;
    }
  }

  function resetPuzzle(nextImage = false): void {
    if (nextImage) {
      imageIndex = (imageIndex + 1 + Math.floor(Math.random() * 17)) % EMBEDDED_IMAGES.length;
    }
    board = createShuffledPuzzle(size);
    moves = 0;
    won = false;
    showPreview = false;
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

  container.querySelector("#puzzleNextImgBtn")?.addEventListener("click", () => resetPuzzle(true));
  container.querySelector("#puzzleAgainBtn")?.addEventListener("click", () => resetPuzzle(true));

  render();
}
