import React, { useState } from "react";
import ForgeReconciler, { Box, Stack, Inline, Button, Heading } from "@forge/react";
import { ClassificaView } from "./classifica-view";
import { ClassificaAiutiView } from "./classifica-aiuti-view";
import { HallOfFameView } from "./halloffame-view";
import { PensieriView } from "./pensieri-view";
import { ProfiloView } from "./profilo-view";
import { CountdownView } from "./countdown-view";

// Global page "WorkPlay": un unico punto d'accesso a tutte le viste del plugin,
// raggiungibile dal menu App di Jira. Convive con i gadget dashboard esistenti,
// che restano invariati.
//
// La navigazione tra le viste è gestita qui con useState (non con gli URL):
// per restare in UI Kit evitiamo view.createHistory(), che porterebbe la
// sidebar nativa e quindi Custom UI. Se in futuro servono URL condivisibili,
// si aggiunge createHistory sopra questa base senza rifare le viste.

// Elenco delle viste disponibili nell'hub. Per ora solo la classifica:
// le altre (profilo, hall of fame, pensieri) si aggiungono qui, una riga
// ciascuna, una volta estratte a componente come ClassificaView.
const VISTE = [
  { key: 'profilo', label: '👤 Profilo', component: ProfiloView },
  { key: 'classifica', label: '🏆 Classifica', component: ClassificaView },
  { key: 'classifica-aiuti', label: '🤝 Classifica Aiuti', component: ClassificaAiutiView },
  { key: 'halloffame', label: '🏛️ Hall of Fame', component: HallOfFameView },
  { key: 'pensieri', label: '💭 Pensieri', component: PensieriView },
  { key: 'countdown', label: '⏳ Fine stagione', component: CountdownView },
];

const WorkPlayHub = () => {
  // Vista attualmente selezionata. Default: la prima dell'elenco.
  const [vistaAttiva, setVistaAttiva] = useState(VISTE[0].key);

  const vista = VISTE.find((v) => v.key === vistaAttiva) || VISTE[0];
  const VistaComponent = vista.component;

  return (
    <Stack space="space.300">
      <Heading>WorkPlay</Heading>

      {/* Menu di navigazione: un bottone per vista.
          Con una sola vista è quasi invisibile, ma la struttura è già pronta
          ad accoglierne altre senza modifiche. */}
      {VISTE.length > 1 && (
        <Inline space="space.100" shouldWrap>
          {VISTE.map((v) => (
            <Button
              key={v.key}
              appearance={v.key === vistaAttiva ? 'primary' : 'default'}
              onClick={() => setVistaAttiva(v.key)}
            >
              {v.label}
            </Button>
          ))}
        </Inline>
      )}

      {/* Vista selezionata */}
      <Box>
        <VistaComponent />
      </Box>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <WorkPlayHub />
  </React.StrictMode>
);