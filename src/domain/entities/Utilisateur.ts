export type RoleUtilisateur = 'admin' | 'utilisateur';

export interface Utilisateur {
  readonly id: string;
  readonly pseudo: string;
  readonly courriel?: string;
  readonly role?: RoleUtilisateur;
}

export function creerUtilisateur(
  id: string,
  pseudo: string,
  courriel?: string,
  role?: RoleUtilisateur
): Utilisateur {
  return {
    id: id,
    pseudo: pseudo,
    courriel: courriel,
    role: role,
  };
}

export function validationCourriel(courriel: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel.trim());
}

export function validationMotDePasse(motDePasse: string): boolean {
  return typeof motDePasse === 'string' && motDePasse.length >= 8;
}

export function genererPseudoParDefaut(courriel: string): string {
  const partieLocale = courriel.split('@')[0];
  const nettoye = partieLocale.replace(/[^a-zA-Z0-9_-]/g, '');
  const complete = nettoye.padEnd(3, '0');
  return complete.slice(0, 20);
}

export function validationPseudo(username: string): boolean {
  return /^[a-zA-Z0-9_-]{3,20}$/.test(username);
}
