import React from 'react';
import { createRoot } from 'react-dom/client';
import '@atlaskit/css-reset';
import { setGlobalTheme } from '@atlaskit/tokens';
import App from './App';

// ⚠️ OBBLIGATORIO, e non è opzionale come sembra.
//
// In Custom UI le variabili CSS dei design token NON esistono finché non si
// inizializza il tema. Senza questa riga `token('space.200')` genera
// `var(--ds-space-200)` su una variabile mai definita: la dichiarazione CSS
// diventa invalida e il browser la SCARTA in silenzio. Risultato: bordi, padding
// e spaziature spariscono, e i componenti con overlay (Modal) si montano senza
// blanket né z-index, quindi restano invisibili.
//
// 'auto' segue il tema chiaro/scuro scelto dall'utente in Jira.
setGlobalTheme({ colorMode: 'auto' });

// A differenza dei moduli UI Kit del progetto qui si usa react-dom vero (non
// ForgeReconciler): questa pagina gira in un iframe con un DOM reale.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
