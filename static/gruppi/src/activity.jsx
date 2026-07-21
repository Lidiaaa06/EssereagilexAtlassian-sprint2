import React from 'react';
import { createRoot } from 'react-dom/client';
import '@atlaskit/css-reset';
import { setGlobalTheme } from '@atlaskit/tokens';
import ActivityView from './ActivityView';

// Entry point del pannello "WorkPlay" nella sezione Activity della issue
// (modulo jira:issueActivity, ora Custom UI per avere pieno controllo grafico
// come da mockup). setGlobalTheme è obbligatorio come per le altre entry.
setGlobalTheme({ colorMode: 'auto' });

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ActivityView />
  </React.StrictMode>
);
