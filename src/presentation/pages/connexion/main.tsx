import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './connexion.css';
import { LoginPage, type GatewaySession } from './LoginPage';
import { InscriptionPage, type GatewayInscription } from './InscriptionPage';
import { PseudoChoicePage } from './PseudoChoicePage';
import { LANGUE_PAR_DEFAUT } from '../../../i18n/i18n-web';
import { genererPseudoParDefaut } from '../../../domain/entities/Utilisateur';

function nettoyerPrefixeIpc(err: unknown): string {
  if (!(err instanceof Error)) return '';
  return err.message.replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    ''
  );
}

type Vue = 'connexion' | 'inscription' | 'choix-pseudo';

function App() {
  const [vue, setVue] = useState<Vue>('connexion');
  const [langue, setLangue] = useState<string>(LANGUE_PAR_DEFAUT);
  const [pseudoInitial, setPseudoInitial] = useState<string>('');
  const [verificationSessionEnCours, setVerificationSessionEnCours] =
    useState(true);
  const [messageRetour, setMessageRetour] = useState<string | null>(null);
  const [messageRetourConfirmable, setMessageRetourConfirmable] =
    useState(false);

  useEffect(() => {
    let annule = false;
    window.electronAPI
      .restaurerSession()
      .then((session) => {
        if (annule) return;
        if (!session) {
          void window.electronAPI
            .obtenirMotifRetourConnexion()
            .then((motif) => {
              if (!annule && motif === 'session-expiree') {
                setMessageRetour('auth.sessionExpired');
                setMessageRetourConfirmable(false);
              }
              if (!annule && motif === 'session-inactive') {
                setMessageRetour('auth.sessionInactive');
                setMessageRetourConfirmable(true);
              }
            })
            .catch(() => {});
        }
        if (session) {
          void window.electronAPI.allerAuTableauDeBord();
        } else {
          setVerificationSessionEnCours(false);
        }
      })
      .catch(() => {
        if (!annule) setVerificationSessionEnCours(false);
      });
    return () => {
      annule = true;
    };
  }, []);

  useEffect(() => {
    window.electronAPI
      .obtenirLangue()
      .then((langueResolue) => {
        setLangue(langueResolue);
        document.documentElement.lang = langueResolue;
      })
      .catch(() => {});
  }, []);

  const changerLangue = useCallback((nouvelleLangue: string) => {
    window.electronAPI
      .definirLangue(nouvelleLangue)
      .then((langueConfirmee) => {
        setLangue(langueConfirmee);
        document.documentElement.lang = langueConfirmee;
      })
      .catch(() => {});
  }, []);

  const fermerMessageRetour = useCallback(() => {
    setMessageRetour(null);
    setMessageRetourConfirmable(false);
  }, []);

  useEffect(() => {
    window.electronAPI
      .obtenirTheme()
      .then((themeResolu) => {
        document.documentElement.dataset.theme = themeResolu;
      })
      .catch(() => {});
  }, []);

  const gatewaySession: GatewaySession = useMemo(
    () => ({
      authentifier: async ({ identifiant, motDePasse }) => {
        try {
          return await window.electronAPI.authentifierSession(
            identifiant,
            motDePasse
          );
        } catch (err) {
          throw new Error(nettoyerPrefixeIpc(err));
        }
      },
    }),
    []
  );

  const gatewayInscription: GatewayInscription = useMemo(
    () => ({
      inscrire: async ({ courriel, motDePasse }) => {
        try {
          return await window.electronAPI.inscriptionSession(
            courriel,
            motDePasse,
            genererPseudoParDefaut(courriel)
          );
        } catch (err) {
          throw new Error(nettoyerPrefixeIpc(err));
        }
      },
    }),
    []
  );

  if (verificationSessionEnCours) {
    return null;
  }

  if (vue === 'choix-pseudo') {
    return (
      <PseudoChoicePage
        pseudoInitial={pseudoInitial}
        langue={langue}
        changerLangue={changerLangue}
        onTermine={() => {
          void window.electronAPI.allerAuTableauDeBord();
        }}
      />
    );
  }

  if (vue === 'inscription') {
    return (
      <InscriptionPage
        gateway={gatewayInscription}
        langue={langue}
        changerLangue={changerLangue}
        onSessionEtablie={(resultat) => {
          setPseudoInitial(resultat.utilisateur.pseudo);
          setVue('choix-pseudo');
        }}
        allerAConnexion={() => setVue('connexion')}
      />
    );
  }

  const baseLoginProps = {
    gateway: gatewaySession,
    langue,
    changerLangue,
    messageRetour,
    allerAInscription: () => setVue('inscription'),
  };

  if (messageRetourConfirmable) {
    return (
      <LoginPage
        {...baseLoginProps}
        messageRetourConfirmable={true}
        onMessageRetourConfirme={fermerMessageRetour}
      />
    );
  }

  return <LoginPage {...baseLoginProps} messageRetourConfirmable={false} />;
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Élément #root introuvable dans index.html');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
