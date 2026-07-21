import React, { useEffect, useState } from 'react';
import { view } from '@forge/bridge';
import Spinner from '@atlaskit/spinner';
import { token } from '@atlaskit/tokens';
import GroupsPage from './GroupsPage';
import SettingsPage from './SettingsPage';

// Router della pagina admin.
//
// La sidebar di Jira (le `pages` dichiarate nel manifest) cambia SOLO l'URL:
// non monta componenti diversi da sé. Sta a noi leggere il path e decidere
// cosa mostrare — è quanto documenta Atlassian per le subpage in Custom UI.
//
// I path corrispondono alle `route` nel manifest: /groups e /settings.
export default function App() {
  const [rotta, setRotta] = useState(null);

  useEffect(() => {
    let smetti = () => {};

    view.createHistory().then((history) => {
      setRotta(history.location.pathname);
      // La navigazione fra subpage non ricarica l'iframe: senza questo listener
      // si cliccherebbe "Settings" restando fermi su Groups.
      smetti = history.listen((location) => setRotta(location.pathname));
    });

    return () => smetti();
  }, []);

  if (rotta === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: token('space.500') }}>
        <Spinner size="large" />
      </div>
    );
  }

  // Default su Groups: è la pagina che si apre entrando dalla voce WorkPlay,
  // quando il path è ancora la radice.
  return rotta.startsWith('/settings') ? <SettingsPage /> : <GroupsPage />;
}
