import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Build della pagina Custom UI "Configurazione gruppi".
//
// base: './' è OBBLIGATORIO. Forge serve la Custom UI da un URL con path
// imprevedibile: con i path assoluti di default (/assets/...) il browser
// cercherebbe i bundle nella root del dominio Atlassian e la pagina resterebbe
// bianca. Con i path relativi funziona ovunque venga montata.
//
// DUE entry point, non uno:
//   index.html  → la pagina vera e propria
//   modale.html → il contenuto della modale, aperta dal prodotto
//
// La seconda serve perché una modale Atlaskit vive DENTRO l'iframe della Custom
// UI e non può coprire la pagina Jira sottostante. Il Modal di @forge/bridge
// aggira il problema chiedendo al prodotto di aprirla, ma pretende una entry
// separata: il nome del file DEVE essere <entry-key>.html, qui `modale`,
// referenziata nel codice come 'gruppi-resource/modale'.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        modale: resolve(__dirname, 'modale.html'),
        // Global page utenti "WorkPlay" (Custom UI), sotto-pagina Dashboard.
        dashboard: resolve(__dirname, 'dashboard.html'),
        // Pannello "WorkPlay" nella sezione Activity della issue (jira:issueActivity).
        activity: resolve(__dirname, 'activity.html'),
      },
    },
  },
});
