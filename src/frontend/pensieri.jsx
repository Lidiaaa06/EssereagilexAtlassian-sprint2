import React from 'react';
import ForgeReconciler from '@forge/react';
import { PensieriView } from './pensieri-view';

// Gadget dashboard: monta il componente condiviso. Logica in pensieri-view.jsx.
ForgeReconciler.render(
  <React.StrictMode>
    <PensieriView />
  </React.StrictMode>
);