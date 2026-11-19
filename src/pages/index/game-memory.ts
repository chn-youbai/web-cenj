import { getStorageItem, setStorageItem } from "@/core/storage";

export interface MemoryCard {
  id: number;
  symbol: string;
  label: string;
  matched: boolean;
}

const BEST_MEMORY_KEY = "cenj_game_memory_best_v1";

const MEMORY_SYMBOLS: Array<{ symbol: string; label: string }> = [
  { symbol: "✦", label: "星芒" },
  { symbol: "☀", label: "晴昼" },
  { symbol: "☾", label: "弦月" },
  { symbol: "☁", label: "流云" },
  { symbol: "✿", label: "繁花" },
  { symbol: "☕", label: "咖啡" },
  { symbol: "✈", label: "航拍" },
  { symbol: "♫", label: "旋律" },
  { symbol: "⛰", label: "山峦" },
  { symbol: "⚓", label: "港湾" },
];

export function createMemoryDeck(pairCount: number): MemoryCard[] {
  const chosen = MEMORY_SYMBOLS.slice(0, pairCount);
  const deck: MemoryCard[] = [];
  let id = 0;
  for (const item of chosen) {
    deck.push({ id: id++, symbol: item.symbol, label: item.label, matched: false });
    deck.push({ id: id++, symbol: item.symbol, label: item.label, matched: false });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = deck[i];
    const b = deck[j];
    if (a && b) {
      deck[i] = b;
      deck[j] = a;
    }
  }
  return deck;
}

export function mountMemoryGame(container: HTMLElement): void {
  let pairCount = 8; // 4x4 default
  let deck = createMemoryDeck(pairCount);
  let flippedIndices: number[] = [];
  let locked = false;
  let moves = 0;
  let bestMoves = Number.parseInt(getStorageItem(BEST_MEMORY_KEY) || "0", 10) || 0;

  container.innerHTML = `
    <div class="game-head">
      <div class="game-stats">
        <div class="stat-pill"><span>翻牌步数</span><strong id="memMoves">0</strong></div>
        <div class="stat-pill"><span>最佳纪录</span><strong id="memBest">${bestMoves > 0 ? `${bestMoves} 步` : "--"}</strong></div>
      </div>
      <div class="game-actions">
        <button type="button" class="game-btn" id="memModeBtn">4×4 (8对)</button>
        <button type="button" class="game-btn primary" id="memRestartBtn">洗牌重开</button>
      </div>
    </div>
    <div class="memory-stage">
      <div class="memory-grid" id="memoryGrid" role="grid" aria-label="记忆翻卡棋盘"></div>
      <div class="game-overlay" id="memWinOverlay" hidden>
        <p class="overlay-title">全部配对成功！</p>
        <p class="overlay-sub" id="memWinSummary"></p>
        <button type="button" class="game-btn primary" id="memAgainBtn">再玩一局</button>
      </div>
    </div>
    <p class="game-tip">翻开两张卡片寻找相同符号，支持 4×4 休闲或 4×5 进阶模式</p>
  `;

  const gridEl = container.querySelector<HTMLElement>("#memoryGrid");
  const movesEl = container.querySelector<HTMLElement>("#memMoves");
  const bestEl = container.querySelector<HTMLElement>("#memBest");
  const modeBtn = container.querySelector<HTMLButtonElement>("#memModeBtn");
  const winOverlay = container.querySelector<HTMLElement>("#memWinOverlay");
  const winSummary = container.querySelector<HTMLElement>("#memWinSummary");

  function render(): void {
    if (!gridEl) return;
    gridEl.style.gridTemplateColumns =
      pairCount === 8 ? "repeat(4, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))";

    gridEl.innerHTML = deck
      .map((card, idx) => {
        const isOpen = card.matched || flippedIndices.includes(idx);
        return `
          <button
            type="button"
            class="mem-card${isOpen ? " flipped" : ""}${card.matched ? " matched" : ""}"
            data-mem-idx="${idx}"
            aria-label="${isOpen ? card.label : "未翻开卡片"}"
          >
            <span class="mem-card-inner">
              <span class="mem-card-front">✦</span>
              <span class="mem-card-back">
                <span class="mem-symbol">${card.symbol}</span>
                <span class="mem-label">${card.label}</span>
              </span>
            </span>
          </button>
        `;
      })
      .join("");

    for (const btn of gridEl.querySelectorAll<HTMLButtonElement>("[data-mem-idx]")) {
      btn.addEventListener("click", () => {
        if (locked) return;
        const idx = Number.parseInt(btn.dataset.memIdx ?? "-1", 10);
        const card = deck[idx];
        if (!card || card.matched || flippedIndices.includes(idx)) return;

        flippedIndices.push(idx);
        render();

        if (flippedIndices.length === 2) {
          moves += 1;
          locked = true;
          const [i1, i2] = flippedIndices;
          const c1 = i1 !== undefined ? deck[i1] : undefined;
          const c2 = i2 !== undefined ? deck[i2] : undefined;

          if (c1 && c2 && c1.symbol === c2.symbol) {
            c1.matched = true;
            c2.matched = true;
            flippedIndices = [];
            locked = false;

            const allMatched = deck.every((c) => c.matched);
            if (allMatched && (bestMoves === 0 || moves < bestMoves)) {
              bestMoves = moves;
              setStorageItem(BEST_MEMORY_KEY, String(bestMoves));
            }
            render();
          } else {
            window.setTimeout(() => {
              flippedIndices = [];
              locked = false;
              render();
            }, 620);
          }
        }
      });
    }

    const allMatched = deck.every((c) => c.matched);
    if (movesEl) movesEl.textContent = String(moves);
    if (bestEl) bestEl.textContent = bestMoves > 0 ? `${bestMoves} 步` : "--";
    if (modeBtn) modeBtn.textContent = pairCount === 8 ? "4×4 (8对)" : "4×5 (10对)";
    if (winOverlay) winOverlay.hidden = !allMatched;
    if (winSummary && allMatched) {
      winSummary.textContent = `共翻牌 ${moves} 步完成 ${pairCount} 组配对`;
    }
  }

  function restart(): void {
    deck = createMemoryDeck(pairCount);
    flippedIndices = [];
    locked = false;
    moves = 0;
    render();
  }

  modeBtn?.addEventListener("click", () => {
    pairCount = pairCount === 8 ? 10 : 8;
    restart();
  });

  container.querySelector("#memRestartBtn")?.addEventListener("click", restart);
  container.querySelector("#memAgainBtn")?.addEventListener("click", restart);

  render();
}
