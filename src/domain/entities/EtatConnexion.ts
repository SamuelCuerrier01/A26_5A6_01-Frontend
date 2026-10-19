export type Etat = 'connecte' | 'deconnecte' | 'reconnexion';

export type CauseDeconnexion = 'hors-ligne' | 'serveur-injoignable';

export interface EtatConnexion {
  readonly statut: Etat;
  readonly depuis: number;
  readonly reconnexions?: number;
  readonly cause?: CauseDeconnexion;
  readonly prochaineTentative?: number;
}

export function creerEtatConnexion(
  statut: Etat,
  depuis: number = Date.now(),
  reconnexions?: number
): EtatConnexion {
  return {
    statut: statut,
    depuis: depuis,
    reconnexions: reconnexions,
  };
}

export function estConnecte(etat: EtatConnexion): boolean {
  return etat.statut === 'connecte';
}

export function estDeconnecte(etat: EtatConnexion): boolean {
  return etat.statut === 'deconnecte';
}

export function estEnReconnexion(etat: EtatConnexion): boolean {
  return etat.statut === 'reconnexion';
}

export function secondesAvantTentative(
  etat: EtatConnexion,
  maintenant: number = Date.now()
): number | null {
  if (etat.prochaineTentative === undefined) return null;
  return Math.max(0, Math.ceil((etat.prochaineTentative - maintenant) / 1000));
}
