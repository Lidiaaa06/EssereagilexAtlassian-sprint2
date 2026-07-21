import React, { useState, useEffect } from "react";
import { Text, Box, Stack, Inline } from "@forge/react";
import { invoke } from "@forge/bridge";

// Podio dei primi tre. Con le guardie (secondo/terzo) regge un team di 1-2 membri.
const Podio = ({ classifica }) => {
  const [primo, secondo, terzo] = classifica;
  return (
    <Box padding="space.200" backgroundColor="color.background.accent.blue.subtlest">
      <Stack space="space.100" alignInline="center">
        <Text font={{ weight: 'bold' }}>Classifica Aiuti</Text>
      </Stack>
      <Inline space="space.300" alignBlock="end" alignInline="center">
        {secondo && (
          <Box padding="space.200" backgroundColor="color.background.accent.gray.subtler">
            <Stack space="space.100" alignInline="center">
              <Text font={{ weight: 'bold' }}>2°</Text>
              <Text font={{ weight: 'bold' }}>{secondo.nome}</Text>
              <Text size="small">{secondo.punti} punti</Text>
              <Text size="small">{secondo.numeroAiuti} aiuti</Text>
            </Stack>
          </Box>
        )}
        {primo && (
          <Box padding="space.400" backgroundColor="color.background.accent.yellow.subtler">
            <Stack space="space.100" alignInline="center">
              <Text font={{ weight: 'bold' }}>1°</Text>
              <Text font={{ weight: 'bold' }}>{primo.nome}</Text>
              <Text size="small">{primo.punti} punti</Text>
              <Text size="small">{primo.numeroAiuti} aiuti</Text>
            </Stack>
          </Box>
        )}
        {terzo && (
          <Box padding="space.100" backgroundColor="color.background.accent.orange.subtler">
            <Stack space="space.100" alignInline="center">
              <Text font={{ weight: 'bold' }}>3°</Text>
              <Text font={{ weight: 'bold' }}>{terzo.nome}</Text>
              <Text size="small">{terzo.punti} punti</Text>
              <Text size="small">{terzo.numeroAiuti} aiuti</Text>
            </Stack>
          </Box>
        )}
      </Inline>
    </Box>
  );
};

// Cella "Cambio": verde se salito, rosso se sceso, — se invariato.
const CellaCambio = ({ cambio }) => {
  const valore = cambio || 0;
  return (
    <Text color={
      valore > 0 ? 'color.text.success' :
        valore < 0 ? 'color.text.danger' :
          'color.text.subtle'
    }>
      {valore > 0 ? `+${valore}` : valore < 0 ? `${valore}` : '—'}
    </Text>
  );
};

// Vista "Classifica Aiuti" montata nel workplay-hub, subito dopo la classifica
// punti. Pool SEPARATO: numero di aiuti e punti-aiuto (10 × aiuti), con colonna
// "Cambio" da snapshot giornaliero dedicato.
export const ClassificaAiutiView = () => {
  const [classifica, setClassifica] = useState(null);

  useEffect(() => {
    invoke('getClassificaAiuto').then(setClassifica);
  }, []);

  if (!classifica) return <Text>Caricamento classifica aiuti...</Text>;

  if (classifica.length === 0) {
    return <Text>Nessun membro nel team.</Text>;
  }

  return (
    <Stack space="space.200">
      <Podio classifica={classifica} />
      <Stack space="space.0">
        <Box padding="space.150" backgroundColor="color.background.neutral.bold">
          <Inline space="space.0" alignBlock="center" xcss={{ width: '100%' }}>
            <Box xcss={{ width: '10%' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Pos.</Text></Box>
            <Box xcss={{ width: '38%' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Nome</Text></Box>
            <Box xcss={{ width: '18%' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Punti</Text></Box>
            <Box xcss={{ width: '16%' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Aiuti</Text></Box>
            <Box xcss={{ width: '18%' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Cambio</Text></Box>
          </Inline>
        </Box>
        {classifica.map((utente, index) => (
          <Box
            key={utente.accountId}
            padding="space.150"
            backgroundColor={
              index === 0 ? 'color.background.accent.yellow.subtlest' :
                index === 1 ? 'color.background.accent.gray.subtlest' :
                  index === 2 ? 'color.background.accent.orange.subtlest' :
                    'color.background.neutral'
            }
          >
            <Inline space="space.0" alignBlock="center" xcss={{ width: '100%' }}>
              <Box xcss={{ width: '10%' }}><Text font={{ weight: 'bold' }}>#{index + 1}</Text></Box>
              <Box xcss={{ width: '38%' }}><Text>{utente.nome}</Text></Box>
              <Box xcss={{ width: '18%' }}><Text>{utente.punti}</Text></Box>
              <Box xcss={{ width: '16%' }}><Text>{utente.numeroAiuti}</Text></Box>
              <Box xcss={{ width: '18%' }}><CellaCambio cambio={utente.cambioPosizione} /></Box>
            </Inline>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
};
