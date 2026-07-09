import React, { useEffect, useState } from 'react';
import { Box, Heading, Stack, Text } from '@forge/react';
import { invoke } from '@forge/bridge';

function App() {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        invoke('getLegacyPointsData')
            .then(setData)
            .catch((e) => setError(e.message));
    }, []);

    if (error) return <Text color="critical">{error}</Text>;
    if (!data) return <Text>Caricamento...</Text>;

    return (
        <Box padding="space.200">
            <Heading size="medium">Punti Legacy</Heading>
            <Heading size="large">{data.points} punti</Heading>
            <Text>Task completate: {data.completedCount}</Text>
        </Box>
    );
}

export default App;