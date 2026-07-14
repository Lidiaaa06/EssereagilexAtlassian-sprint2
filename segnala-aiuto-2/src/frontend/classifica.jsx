import React, { useState, useEffect } from 'react';
import ForgeReconciler, {
    Text, Stack, Box, Inline,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const App = () => {
    const [classifica, setClassifica] = useState(null);

    useEffect(() => {
        invoke('getClassificaAiuto').then(setClassifica);
    }, []);

    if (!classifica) return <Text>Caricamento classifica aiuto...</Text>;

    return (
        <Stack space="space.200">
            <Text font={{ weight: 'bold' }}>Classifica Aiuto Team</Text>
            <Box padding="space.150" backgroundColor="color.background.neutral.bold">
                <Inline space="space.0" alignBlock="center">
                    <Box xcss={{ width: '60px' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Pos.</Text></Box>
                    <Box xcss={{ width: '180px' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Nome</Text></Box>
                    <Box xcss={{ width: '100px' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Punti</Text></Box>
                    <Box xcss={{ width: '80px' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Aiuti</Text></Box>
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
                    <Inline space="space.0" alignBlock="center">
                        <Box xcss={{ width: '60px' }}><Text font={{ weight: 'bold' }}>#{index + 1}</Text></Box>
                        <Box xcss={{ width: '180px' }}><Text>{utente.nome}</Text></Box>
                        <Box xcss={{ width: '100px' }}><Text>{utente.punti}</Text></Box>
                        <Box xcss={{ width: '80px' }}><Text>{utente.numeroAiuti}</Text></Box>
                    </Inline>
                </Box>
            ))}
        </Stack>
    );
};

ForgeReconciler.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);