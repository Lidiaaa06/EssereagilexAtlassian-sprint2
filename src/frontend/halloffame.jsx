import React from 'react';
import ForgeReconciler from '@forge/react';
import { HallOfFameView } from './halloffame-view';

// Gadget dashboard: monta il componente condiviso. Logica in halloffame-view.jsx.
ForgeReconciler.render(
  <React.StrictMode>
    <HallOfFameView />
  </React.StrictMode>
);