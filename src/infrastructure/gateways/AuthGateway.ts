import type { EtatConnexion } from '../../domain/entities/EtatConnexion.ts';
import type { Utilisateur } from '../../domain/entities/Utilisateur.ts';

export interface IdentifiantsConnexion {
  readonly identifiant: string;
  readonly motDePasse: string;
}

export interface IdentifiantsInscription {
  readonly courriel: string;
  readonly motDePasse: string;
}

export interface ResultatAuthentification {
  readonly utilisateur: Utilisateur;
  readonly etatConnexion: EtatConnexion;
}

export interface AuthGateway {
  authentifier(
    identifiants: IdentifiantsConnexion
  ): Promise<ResultatAuthentification>;

  inscrire(
    identifiants: IdentifiantsInscription
  ): Promise<ResultatAuthentification>;
}
