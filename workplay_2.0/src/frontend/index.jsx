import React from 'react';
import ForgeReconciler from '@forge/react';
import { ProfiloView } from './profilo-view';

// Gadget dashboard "Profilo": monta il componente condiviso.
// Logica in profilo-view.jsx, condivisa con la global page (workplay-hub.jsx).
ForgeReconciler.render(
  <React.StrictMode>
    <ProfiloView />
  </React.StrictMode>
);