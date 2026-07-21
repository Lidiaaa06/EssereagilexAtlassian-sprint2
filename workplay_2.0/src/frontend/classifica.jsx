import React from "react";
import ForgeReconciler from "@forge/react";
import { ClassificaView } from "./classifica-view";

// Questo file è il GADGET dashboard: monta e basta il componente condiviso.
// La logica vera vive in classifica-view.jsx, così la stessa vista può essere
// usata anche dalla global page (workplay-hub.jsx) senza duplicare codice.
ForgeReconciler.render(
  <React.StrictMode>
    <ClassificaView />
  </React.StrictMode>
);