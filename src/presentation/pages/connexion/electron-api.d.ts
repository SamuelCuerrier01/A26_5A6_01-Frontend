export {};

import type { EtatConnexion } from '../../../domain/entities/EtatConnexion';
import type { Utilisateur } from '../../../domain/entities/Utilisateur';

declare global {
  interface Window {
    electronAPI: {
      authentifierSession: (
        identifiant: string,
        motDePasse: string
      ) => Promise<{ utilisateur: Utilisateur; etatConnexion: EtatConnexion }>;
      inscriptionSession: (
        courriel: string,
        motDePasse: string,
        pseudo: string
      ) => Promise<{ utilisateur: Utilisateur; etatConnexion: EtatConnexion }>;
      restaurerSession: () => Promise<{
        utilisateur: Utilisateur;
        etatConnexion: EtatConnexion;
      } | null>;
      deconnexionSession: () => Promise<void>;
      definirMotifRetourConnexion: (motif: string) => Promise<string | null>;
      deconnexionPartout: () => Promise<void>;
      obtenirMotifRetourConnexion: () => Promise<string | null>;
      allerAuTableauDeBord: () => Promise<void>;
      obtenirUtilisateurConnecte: () => Promise<Utilisateur | null>;
      profilObtenir: () => Promise<Utilisateur>;
      profilModifierPseudo: (pseudo: string) => Promise<Utilisateur>;
      profilModifierCompte: (donnees: {
        courriel?: string;
        motDePasse?: string;
        motDePasseActuel: string;
      }) => Promise<Utilisateur>;
      profilSupprimerCompte: (motDePasseActuel: string) => Promise<void>;
      obtenirLangue: () => Promise<string>;
      definirLangue: (langue: string) => Promise<string>;
      obtenirTheme: () => Promise<string>;
      definirTheme: (theme: string) => Promise<string>;

      allerALaConnexion: () => Promise<void>;
    };
  }
}
