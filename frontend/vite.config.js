import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: "classic",
    }),
  ],
  server: {
    port: 3000,
    open: true,
    proxy: {
      "/socket.io": {
        target: "https://api.avschats.nodayoby.online",
        changeOrigin: true,
        ws: true,
      },
      "^/(auth|login|logout|signup|refresh_token|users|contacts|contact|tickets|messages|whatsapp|queues|queue|quickAnswers|settings|api)": {
        target: "https://api.avschats.nodayoby.online",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "build",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "material-ui": [
            "@material-ui/core",
            "@material-ui/icons",
            "@material-ui/lab",
          ],
        },
      },
    },
  },
  envPrefix: "VITE_",
  esbuild: {
    loader: "jsx",
    include: /src\/.*\.[jt]sx?$/,
    exclude: [],
  },
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    include: [
      "mic-recorder-to-mp3",
      "@material-ui/core",
      "@material-ui/icons",
      "@material-ui/lab",
    ],
    exclude: [],
  },
  resolve: {
    alias: {
      "jss-plugin-globalThis": "jss-plugin-global",
    },
  },
});
