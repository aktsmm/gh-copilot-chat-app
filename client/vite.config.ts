import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const serverTarget = env.VITE_SERVER_URL || "http://127.0.0.1:3001";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": serverTarget,
        "/socket.io": {
          target: serverTarget,
          ws: true,
        },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom"],
            markdown: ["react-markdown", "remark-gfm"],
            syntax: ["react-syntax-highlighter"],
            socketio: ["socket.io-client"],
          },
        },
      },
    },
  };
});
