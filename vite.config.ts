import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Plugin, defineConfig } from "vite";

const DATA_ASSETS = ["vocab.json", "gaokao_2050.json", "root_families.json"];

function dataAssetsPlugin(): Plugin {
  return {
    name: "web-cenj-data-assets",
    configureServer(server) {
      server.middlewares.use("/data", (req, res, next) => {
        const cleanUrl = ((req.url || "").split("?")[0] ?? "").replace(/^\/+/, "");
        if (DATA_ASSETS.includes(cleanUrl)) {
          const filePath = resolve(__dirname, "data", cleanUrl);
          if (existsSync(filePath)) {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(readFileSync(filePath));
            return;
          }
        }
        next();
      });
    },
    closeBundle() {
      const outDataDir = resolve(__dirname, "dist/data");
      mkdirSync(outDataDir, { recursive: true });
      for (const file of DATA_ASSETS) {
        const src = resolve(__dirname, "data", file);
        if (existsSync(src)) {
          copyFileSync(src, resolve(outDataDir, file));
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [dataAssetsPlugin()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared": resolve(__dirname, "shared"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        gallery: resolve(__dirname, "gallery.html"),
        upload: resolve(__dirname, "upload.html"),
        pan: resolve(__dirname, "pan.html"),
        board: resolve(__dirname, "board.html"),
        clash: resolve(__dirname, "clash.html"),
        takeout: resolve(__dirname, "takeout.html"),
        recite: resolve(__dirname, "recite.html"),
        vocab: resolve(__dirname, "vocab.html"),
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8788",
        changeOrigin: true,
      },
    },
  },
});
