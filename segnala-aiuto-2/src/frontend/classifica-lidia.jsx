import React, { useState, useEffect } from "react";
import ForgeReconciler, {
    Text,
    Box,
    Stack,
    Inline,
} from "@forge/react";
import { invoke } from "@forge/bridge";

const Podio = ({ classifica }) => {
    const [primo, secondo, terzo] = classifica;
    return (
        <Box padding="space.200" backgroundColor="color.background.accent.blue.subtlest">
            <Stack space="space.100" alignInline="center">
                <Text font={{ weight: 'bold' }}>Classifica Aiuto Team</Text>
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

const Tabella = ({ classifica }) => (
    <Stack space="space.0">
        <Box padding="space.150" backgroundColor="color.background.neutral.bold">
            <Inline space="space.0" alignBlock="center">
                <Box xcss={{ width: '60px' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Pos.</Text></Box>
                <Box xcss={{ width: '160px' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Nome</Text></Box>
                <Box xcss={{ width: '90px' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Punti</Text></Box>
                <Box xcss={{ width: '80px' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Aiuti</Text></Box>
                <Box xcss={{ width: '80px' }}><Text font={{ weight: 'bold' }} color="color.text.inverse">Cambio</Text></Box>
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
                    <Box xcss={{ width: '160px' }}><Text>{utente.nome}</Text></Box>
                    <Box xcss={{ width: '90px' }}><Text>{utente.punti}</Text></Box>
                    <Box xcss={{ width: '80px' }}><Text>{utente.numeroAiuti}</Text></Box>
                    <Box xcss={{ width: '80px' }}><CellaCambio cambio={utente.cambioPosizione} /></Box>
                </Inline>
            </Box>
        ))}
    </Stack>
);

const App = () => {
    const [classifica, setClassifica] = useState(null);

    useEffect(() => {
        invoke('getClassificaAiuto').then(setClassifica);
    }, []);

    if (!classifica) return <Text>Caricamento classifica aiuto...</Text>;

    return (
        <Stack space="space.200">
            <Podio classifica={classifica} />
            <Tabella classifica={classifica} />
        </Stack>
    );
};

ForgeReconciler.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);