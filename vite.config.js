import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-motion': ['framer-motion'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-ui': ['lucide-react', 'date-fns'],
          // `recharts` sai de propósito da lista de chunks fixos.
          //
          // Declarar aqui criava um chunk estático, e o Vite emite
          // modulepreload para esses chunks: 411 KB de biblioteca de
          // gráficos baixados no primeiro acesso por todo usuário,
          // mesmo sem abrir Relatórios — a única tela que usa, e que já
          // é lazy. Fora da lista, o recharts viaja junto do chunk do
          // Reports e só desce quando a tela é aberta.
        }
      }
    },
    chunkSizeWarningLimit: 600,
  }
});