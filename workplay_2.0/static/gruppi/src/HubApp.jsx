import React, { useEffect, useState } from 'react';
import { view } from '@forge/bridge';
import Spinner from '@atlaskit/spinner';
import { token } from '@atlaskit/tokens';
import DashboardView from './DashboardView';
import TeamLeaderboardView from './TeamLeaderboardView';

// Router della global page utenti "WorkPlay".
//
// La sidebar di Jira (le `pages` del manifest) cambia SOLO l'URL: sta a noi
// leggere il path e decidere cosa mostrare (come fa App.jsx per l'admin).
// I path corrispondono alle `route` del manifest: /dashboard e /team-leaderboard.
// Le altre voci del mockup (Sfide, Hall of Fame) arriveranno dopo.
export default function HubApp() {
  const [rotta, setRotta] = useState(null);

  useEffect(() => {
    let smetti = () => {};
    view.createHistory().then((history) => {
      setRotta(history.location.pathname);
      // La navigazione fra subpage non ricarica l'iframe: senza il listener si
      // cliccherebbe "Team Leaderboard" restando fermi sulla Dashboard.
      smetti = history.listen((location) => setRotta(location.pathname));
    }).catch(() => setRotta('/dashboard'));
    return () => smetti();
  }, []);

  if (rotta === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: token('space.500') }}>
        <Spinner size="large" />
      </div>
    );
  }

  return rotta.startsWith('/team-leaderboard') ? <TeamLeaderboardView /> : <DashboardView />;
}
