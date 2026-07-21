import React, { useState, useEffect } from "react";
import {
  Text,
  Box,
  Stack,
  Inline,
} from "@forge/react";
import { invoke } from "@forge/bridge";

const MEDAGLIE = ['1°', '2°', '3°'];

const Podio = ({ classifica }) => {
  const [primo, secondo, terzo] = classifica;
  return (
    <Box padding="space.200" backgroundColor="color.background.accent.blue.subtlest">
      <Stack space="space.100" alignInline="center">
        <Text font={{ weight: 'bold' }}>Classifica Team</Text>
      </Stack>
      <Inline space="space.300" alignBlock="end" alignInline="center">
        <Box padding="space.200" backgroundColor="color.background.accent.gray.subtler">
          <Stack space="space.100" alignInline="center">
            <Text font={{ weight: 'bold' }}>2°</Text>
            <Text font={{ weight: 'bold' }}>{secondo.nome}</Text>
            <Text size="small">Livello {secondo.livello}</Text>
            <Text size="small">{secondo.punti} XP</Text>
          </Stack>
        </Box>
        <Box padding="space.400" backgroundColor="color.background.accent.yellow.subtler">
          <Stack space="space.100" alignInline="center">
            <Text font={{ weight: 'bold' }}>1°</Text>
            <Text font={{ weight: 'bold' }}>{primo.nome}</Text>
            <Text size="small">Livello {primo.livello}</Text>
            <Text size="small">{primo.punti} XP</Text>
          </Stack>
        </Box>
        <Box padding="space.100" backgroundColor="color.background.accent.orange.subtler">
          <Stack space="space.100" alignInline="center">
            <Text font={{ weight: 'bold' }}>3°</Text>
            <Text font={{ weight: 'bold' }}>{terzo.nome}</Text>
            <Text size="small">Livello {terzo.livello}</Text>
            <Text size="small">{terzo.punti} XP</Text>
          </Stack>
        </Box>
      </Inline>
    </Box>
  );
};

const Tabella = ({ classifica }) => {
  return (
    <Stack space="space.0">
      <Box padding="space.150" backgroundColor="color.background.neutral.bold">
        <Inline space="space.0" alignBlock="center" xcss={{ width: '100%' }}>
          <Box xcss={{ width: '8%' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Pos.</Text></Box>
          <Box xcss={{ width: '30%' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Nome</Text></Box>
          <Box xcss={{ width: '10%' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Liv.</Text></Box>
          <Box xcss={{ width: '14%' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">XP Tot.</Text></Box>
          <Box xcss={{ width: '12%' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Task</Text></Box>
          <Box xcss={{ width: '12%' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Sfide</Text></Box>
          <Box xcss={{ width: '14%' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Cambio</Text></Box>
        </Inline>
      </Box>

      {classifica.map((utente, index) => (
        <Box
          key={utente.nome}
          padding="space.150"
          backgroundColor={
            index === 0 ? 'color.background.accent.yellow.subtlest' :
              index === 1 ? 'color.background.accent.gray.subtlest' :
                index === 2 ? 'color.background.accent.orange.subtlest' :
                  'color.background.neutral'
          }
        >
          <Inline space="space.0" alignBlock="center" xcss={{ width: '100%' }}>
            <Box xcss={{ width: '8%' }}><Text font={{ weight: 'bold' }}>#{index + 1}</Text></Box>
            <Box xcss={{ width: '30%' }}><Text>{utente.nome}</Text></Box>
            <Box xcss={{ width: '10%' }}><Text>{utente.livello}</Text></Box>
            <Box xcss={{ width: '14%' }}><Text>{utente.punti}</Text></Box>
            <Box xcss={{ width: '12%' }}><Text>{utente.taskCompletate}</Text></Box>
            <Box xcss={{ width: '12%' }}><Text>{utente.sfideCompletate || 0}</Text></Box>
            <Box xcss={{ width: '14%' }}>
              <Text color={
                utente.cambioPosizione > 0 ? 'color.text.success' :
                  utente.cambioPosizione < 0 ? 'color.text.danger' :
                    'color.text.subtle'
              }>
                {utente.cambioPosizione > 0 ? `+${utente.cambioPosizione}` :
                  utente.cambioPosizione < 0 ? `${utente.cambioPosizione}` :
                    '—'}
              </Text>
            </Box>
          </Inline>
        </Box>
      ))}
    </Stack>
  );
};

export const ClassificaView = () => {
  const [classifica, setClassifica] = useState(null);

  useEffect(() => {
    invoke('getClassifica').then(setClassifica);
  }, []);

  if (!classifica) return <Text>Caricamento classifica...</Text>;

  return (
    <Stack space="space.200">
      <Podio classifica={classifica} />
      <Tabella classifica={classifica} />
    </Stack>
  );
};