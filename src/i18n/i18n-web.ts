import translations from './translations.json';

export const LANGUE_PAR_DEFAUT = 'fr' as const;
export const LANGUES_SUPPORTEES: readonly string[] = ['fr', 'en'];

export function t(
  langue: string,
  cle: string,
  params?: Record<string, string | number>
): string {
  const table = translations as Record<string, unknown>;
  const dictionnaire =
    (table[langue] as Record<string, unknown> | undefined) ??
    (table[LANGUE_PAR_DEFAUT] as Record<string, unknown>);

  const brut = cle
    .split('.')
    .reduce<unknown>(
      (acc, partie) =>
        acc && typeof acc === 'object'
          ? (acc as Record<string, unknown>)[partie]
          : undefined,
      dictionnaire
    );

  let texte = typeof brut === 'string' ? brut : cle;

  if (params) {
    for (const cleParam of Object.keys(params)) {
      texte = texte.split(`{${cleParam}}`).join(String(params[cleParam]));
    }
  }

  return texte;
}
