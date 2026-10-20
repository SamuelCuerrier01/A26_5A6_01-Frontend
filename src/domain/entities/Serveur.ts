export type RoleServeur = 'admin' | 'proprietaire' | 'moderateur' | 'membre';

const RANG: Record<RoleServeur, number> = {
  membre: 1,
  moderateur: 2,
  proprietaire: 3,
  admin: 4,
};

export function rangRole(role: RoleServeur | null | undefined): number {
  return role ? RANG[role] : 0;
}

export function peutModererServeur(
  role: RoleServeur | null | undefined
): boolean {
  return rangRole(role) >= RANG.moderateur;
}

export function peutGererServeur(
  role: RoleServeur | null | undefined
): boolean {
  return rangRole(role) >= RANG.proprietaire;
}

export function peutExpulser(
  acteur: RoleServeur | null | undefined,
  cible: RoleServeur | null | undefined
): boolean {
  return peutModererServeur(acteur) && rangRole(acteur) > rangRole(cible);
}

export function initialesServeur(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  return mots
    .slice(0, 2)
    .map((mot) => mot.charAt(0).toUpperCase())
    .join('');
}
