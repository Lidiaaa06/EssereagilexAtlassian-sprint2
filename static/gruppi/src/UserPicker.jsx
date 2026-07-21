import React, { useRef, useState } from 'react';
import Select from '@atlaskit/select';
import Avatar from '@atlaskit/avatar';
import { invoke } from '@forge/bridge';

// Picker utenti Jira condiviso da tutta la pagina: inline-add dell'albero,
// campo Team Leader e campo Developers della modale.
//
// Stessa logica già collaudata in admin.jsx (UI Kit): debounce 300ms e soglia
// di 2 caratteri, perché ogni battuta è un invoke + una chiamata REST a Jira.
export default function UserPicker({
  placeholder = 'Cerca tra gli utenti Jira…',
  value = null,
  onChange,
  autoFocus = false,
}) {
  const [opzioni, setOpzioni] = useState([]);
  const [cercando, setCercando] = useState(false);
  const timer = useRef(null);

  const cerca = (testo) => {
    if (timer.current) clearTimeout(timer.current);

    if (testo.trim().length < 2) {
      setOpzioni([]);
      setCercando(false);
      return;
    }

    setCercando(true);
    timer.current = setTimeout(() => {
      invoke('cercaUtentiJira', { query: testo.trim() })
        .then((res) => {
          setOpzioni(
            res.errore
              ? []
              : res.utenti.map((u) => ({
                  label: u.nome,
                  value: u.accountId,
                  avatar: u.avatar,
                }))
          );
          setCercando(false);
        })
        .catch(() => {
          setOpzioni([]);
          setCercando(false);
        });
    }, 300);
  };

  return (
    <Select
      appearance="default"
      spacing="compact"
      isSearchable
      isClearable
      autoFocus={autoFocus}
      placeholder={placeholder}
      isLoading={cercando}
      options={opzioni}
      value={value}
      onInputChange={cerca}
      onChange={onChange}
      // Avatar accanto al nome, sia nella tendina sia nel valore scelto.
      // Con due persone che si chiamano uguale — capita davvero, in questo
      // sito ci sono due "Michele Budri" — la foto è l'unico modo per capire
      // quale si sta selezionando senza mostrarne l'email.
      formatOptionLabel={(opzione) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Avatar size="xsmall" src={opzione.avatar || undefined} name={opzione.label} />
          {opzione.label}
        </span>
      )}
      // Il server filtra già per nome: rifiltrare lato client nasconderebbe
      // risultati legittimi (è il limite che abbiamo su UI Kit, qui evitabile).
      filterOption={() => true}
      noOptionsMessage={({ inputValue }) =>
        inputValue.trim().length < 2
          ? 'Digita almeno 2 lettere del nome…'
          : 'Nessun utente trovato'
      }
    />
  );
}
