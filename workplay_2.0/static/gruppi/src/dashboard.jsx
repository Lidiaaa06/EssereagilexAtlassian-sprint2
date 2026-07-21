import React from 'react';
import { createRoot } from 'react-dom/client';
import '@atlaskit/css-reset';
import { setGlobalTheme } from '@atlaskit/tokens';
import HubApp from './HubApp';

// Entry point della global page "WorkPlay" lato utenti (Custom UI). Separata
// dall'admin (main.jsx → App) ma nello STESSO build di static/gruppi, così il
// bundle Atlaskit è condiviso e non serve un secondo node_modules.
//
// setGlobalTheme è obbligatorio come per l'admin: senza, i design token non
// esistono e le spaziature/bordi spariscono (vedi nota in main.jsx).
setGlobalTheme({ colorMode: 'auto' });

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HubApp />
  </React.StrictMode>
);
