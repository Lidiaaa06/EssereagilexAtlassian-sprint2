import React, { useState, useEffect } from 'react';
import ForgeReconciler, {
  Text,
  Button,
  Lozenge,
  Stack,
  Inline,
  SectionMessage,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { showFlag } from '@forge/jira-bridge';

const Panel = () => {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    invoke('getState')
      .then((s) => {
        setState(s);
        // Popup: se l'operatore ha guadagnato un ticket da quando era qui l'ultima
        // volta, mostra un flag Jira ora e azzera il flag lato server.
        if (s.pendingNotice) {
          showFlag({
            id: 'golden-ticket-earned',
            title: 'Hai guadagnato un golden ticket!',
            description:
              'Hai raggiunto 1000 punti stagionali. Usalo quando ti serve aiuto dal supervisore.',
            type: 'success',
            isAutoDismiss: false,
          });
          invoke('dismissNotice');
        }
      })
      .catch(() => setState({ balance: 0, pendingNotice: false }));
  }, []);

  const onRedeem = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await invoke('redeem');
      if (res.ok) {
        setState((s) => ({ ...s, balance: res.balance }));
        setMsg({ tone: 'confirmation', text: 'Golden ticket usato. Il supervisore e stato avvisato.' });
      } else if (res.reason === 'no_tickets') {
        setMsg({ tone: 'warning', text: 'Nessun golden ticket disponibile in questa stagione.' });
      } else {
        setMsg({ tone: 'error', text: 'Non e stato possibile usare il ticket.' });
      }
    } finally {
      setBusy(false);
    }
  };

  if (!state) return <Text>Carico…</Text>;

  const available = state.balance > 0;

  return (
    <Stack space="space.200">
      <Inline space="space.100" alignBlock="center">
        <Text>Golden ticket disponibili:</Text>
        <Lozenge appearance={available ? 'success' : 'removed'}>{String(state.balance)}</Lozenge>
      </Inline>

      {msg && <SectionMessage appearance={msg.tone}>{msg.text}</SectionMessage>}

      <Button appearance="primary" isDisabled={!available || busy} onClick={onRedeem}>
        {busy ? 'Invio…' : 'Usa golden ticket'}
      </Button>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <Panel />
  </React.StrictMode>
);