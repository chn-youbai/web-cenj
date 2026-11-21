import { getStorageItem, setStorageItem } from "@/core/storage";
import { EMBEDDED_IMAGES, getImageUrl } from "../gallery/photos";

export interface MemoryCard {
  id: number;
  imageName: string;
  imageUrl: string;
  matched: boolean;
}

const BEST_MEMORY_KEY = "cenj_game_memory_best_v1";

export function createMemoryDeck(pairCount: number): MemoryCard[] {
  const pool = [...EMBEDDED_IMAGES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = pool[i];
    const b = pool[j];
    if (a !== undefined && b !== undefined) {
      pool[i] = b;
      pool[j] = a;
    }
  }

  const chosen = pool.slice(0, pairCount);
  const deck: MemoryCard[] = [];
  let id = 0;
  for (const imageName of chosen) {
    const imageUrl = getImageUrl(imageName);
    deck.push({ id: id++, imageName, imageUrl, matched: false });
    deck.push({ id: id++, imageName, imageUrl, matched: false });
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

function preloadImageUrl(url: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };

    const timer = window.setTimeout(finish, timeoutMs);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (typeof img.decode === "function") {
        img
          .decode()
          .catch(() => undefined)
          .finally(finish);
      } else {
        finish();
      }
    };
    img.onerror = finish;
    img.src = url;
  });
}

export function mountMemoryGame(container: HTMLElement): void {
  let pairCount = 8; // 4x4 default
  let deck = createMemoryDeck(pairCount);
  let flippedIndices: number[] = [];
  let locked = false;
  let preloading = false;
  let moves = 0;
  let roundId = 0;
  let mismatchTimer: number | null = null;
  let cardButtons: HTMLButtonElement[] = [];
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
      <div class="memory-board-wrap">
        <div class="memory-grid" id="memoryGrid" role="grid" aria-label="航拍记忆翻卡棋盘"></div>
        <div class="memory-preload-overlay" id="memPreloadOverlay" hidden>
          <p class="memory-preload-text" id="memPreloadText">正在加载航拍照片...</p>
          <div class="memory-preload-track" aria-hidden="true">
            <div class="memory-preload-fill" id="memPreloadFill"></div>
          </div>
        </div>
      </div>
      <div class="game-overlay" id="memWinOverlay" hidden>
        <p class="overlay-title">全部配对成功！</p>
        <p class="overlay-sub" id="memWinSummary"></p>
        <button type="button" class="game-btn primary" id="memAgainBtn">再玩一局</button>
      </div>
    </div>
    <p class="game-tip">素材随机抽取自画廊 121 张航拍精选，每局开局预加载完毕后即可秒显翻牌</p>
  `;

  const gridEl = container.querySelector<HTMLElement>("#memoryGrid");
  const movesEl = container.querySelector<HTMLElement>("#memMoves");
  const bestEl = container.querySelector<HTMLElement>("#memBest");
  const modeBtn = container.querySelector<HTMLButtonElement>("#memModeBtn");
  const winOverlay = container.querySelector<HTMLElement>("#memWinOverlay");
  const winSummary = container.querySelector<HTMLElement>("#memWinSummary");
  const preloadOverlay = container.querySelector<HTMLElement>("#memPreloadOverlay");
  const preloadText = container.querySelector<HTMLElement>("#memPreloadText");
  const preloadFill = container.querySelector<HTMLElement>("#memPreloadFill");

  function syncMeta(): void {
    const allMatched = deck.every((c) => c.matched);
    if (movesEl) movesEl.textContent = String(moves);
    if (bestEl) bestEl.textContent = bestMoves > 0 ? `${bestMoves} 步` : "--";
    if (modeBtn) modeBtn.textContent = pairCount === 8 ? "4×4 (8对)" : "4×5 (10对)";
    if (winOverlay) winOverlay.hidden = !allMatched;
    if (winSummary && allMatched) {
      winSummary.textContent = `共翻牌 ${moves} 步完成 ${pairCount} 组航拍配对`;
    }
  }

  function syncCardsDOM(): void {
    for (let idx = 0; idx < deck.length; idx++) {
      const card = deck[idx];
      const btn = cardButtons[idx];
      if (!card || !btn) continue;
      const isOpen = card.matched || flippedIndices.includes(idx);
      btn.classList.toggle("flipped", isOpen);
      btn.classList.toggle("matched", card.matched);
      btn.setAttribute("aria-label", isOpen ? `航拍照片 ${card.imageName}` : "未翻开卡片");
    }
  }

  function buildGridDOM(): void {
    if (!gridEl) return;
    gridEl.style.gridTemplateColumns =
      pairCount === 8 ? "repeat(4, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))";

    gridEl.innerHTML = deck
      .map(
        (card, idx) => `
          <button
            type="button"
            class="mem-card"
            data-mem-idx="${idx}"
            aria-label="未翻开卡片"
          >
            <span class="mem-card-inner">
              <span class="mem-card-front">✦</span>
              <span class="mem-card-back mem-photo-back">
                <img class="mem-photo" src="${card.imageUrl}" alt="航拍记忆卡" decoding="async" />
              </span>
            </span>
          </button>
        `,
      )
      .join("");

    cardButtons = Array.from(gridEl.querySelectorAll<HTMLButtonElement>(".mem-card"));
    syncCardsDOM();
  }

  function updatePreloadUI(loaded: number, total: number): void {
    const pct = total > 0 ? Math.round((loaded / total) * 100) : 100;
    if (preloadText) {
      preloadText.textContent = `正在加载本局航拍照片 (${loaded} / ${total})...`;
    }
    if (preloadFill) {
      preloadFill.style.width = `${pct}%`;
    }
  }

  function preloadRoundImages(currentRound: number): void {
    const uniqueUrls = Array.from(new Set(deck.map((c) => c.imageUrl)));
    const total = uniqueUrls.length;
    if (total === 0) {
      preloading = false;
      if (preloadOverlay) preloadOverlay.hidden = true;
      return;
    }

    preloading = true;
    if (preloadOverlay) preloadOverlay.hidden = false;
    updatePreloadUI(0, total);

    let loaded = 0;
    void Promise.all(
      uniqueUrls.map((url) =>
        preloadImageUrl(url).then(() => {
          if (currentRound !== roundId) return;
          loaded += 1;
          updatePreloadUI(loaded, total);
        }),
      ),
    ).then(() => {
      if (currentRound !== roundId) return;
      preloading = false;
      if (preloadOverlay) preloadOverlay.hidden = true;
      syncMeta();
    });
  }

  gridEl?.addEventListener("click", (event) => {
    if (preloading || locked) return;
    const target = event.target as HTMLElement | null;
    const btn = target?.closest<HTMLButtonElement>(".mem-card");
    if (!btn) return;
    const idx = Number.parseInt(btn.dataset.memIdx ?? "-1", 10);
    const card = deck[idx];
    if (!card || card.matched || flippedIndices.includes(idx)) return;

    flippedIndices.push(idx);
    syncCardsDOM();

    if (flippedIndices.length === 2) {
      moves += 1;
      locked = true;
      const [firstIdx, secondIdx] = flippedIndices;
      const first = firstIdx !== undefined ? deck[firstIdx] : undefined;
      const second = secondIdx !== undefined ? deck[secondIdx] : undefined;

      if (first && second && first.imageName === second.imageName) {
        first.matched = true;
        second.matched = true;
        flippedIndices = [];
        locked = false;
        if (deck.every((c) => c.matched) && (bestMoves === 0 || moves < bestMoves)) {
          bestMoves = moves;
          setStorageItem(BEST_MEMORY_KEY, String(bestMoves));
        }
        syncCardsDOM();
        syncMeta();
      } else {
        syncMeta();
        mismatchTimer = window.setTimeout(() => {
          mismatchTimer = null;
          flippedIndices = [];
          locked = false;
          syncCardsDOM();
        }, 680);
      }
    }
  });

  function restart(): void {
    roundId += 1;
    if (mismatchTimer !== null) {
      window.clearTimeout(mismatchTimer);
      mismatchTimer = null;
    }
    deck = createMemoryDeck(pairCount);
    flippedIndices = [];
    locked = false;
    moves = 0;
    buildGridDOM();
    syncMeta();
    preloadRoundImages(roundId);
  }

  modeBtn?.addEventListener("click", () => {
    pairCount = pairCount === 8 ? 10 : 8;
    restart();
  });

  container.querySelector("#memRestartBtn")?.addEventListener("click", restart);
  container.querySelector("#memAgainBtn")?.addEventListener("click", restart);

  restart();
}
