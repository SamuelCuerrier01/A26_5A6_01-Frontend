import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
// @ts-expect-error -- module CommonJS sans déclaration de types
import { RealGatewayRuntime } from '../../../infrastructure/gateways/RealGatewayRuntime.js';
import { t } from '../../../i18n/i18n-web';
import { LoginPage } from './LoginPage';
import { InscriptionPage } from './InscriptionPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each([
  ['connexion', 401, 'ERR_IDENTIFIANTS_INVALIDES'],
  ['inscription', 400, 'ERR_INSCRIPTION_INVALIDE'],
  ['inscription sans pseudo', 400, 'ERR_INSCRIPTION_INVALIDE'],
  ['inscription', 409, 'ERR_COURRIEL_DEJA_UTILISE'],
  ['connexion', 429, 'ERR_HTTP_429'],
  ['inscription', 429, 'ERR_HTTP_429'],
  ['connexion', 503, 'ERR_HTTP_503'],
  ['inscription', 503, 'ERR_HTTP_503'],
])('affiche et retraduit l’erreur de %s (%i)', async (vue, statut, code) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: statut,
      json: async () => ({ erreur: 'détail interne du serveur' }),
    })
  );
  const runtime = new RealGatewayRuntime({
    baseUrlHttp: 'http://gateway.test',
    baseUrlSocket: 'http://gateway.test',
  });
  const inscription = vue !== 'connexion';
  const afficher = (langue: string) =>
    inscription ? (
      <InscriptionPage
        gateway={{
          inscrire: (identifiants) =>
            runtime.inscrire({
              ...identifiants,
              ...(vue === 'inscription' ? { pseudo: 'alice' } : {}),
            }),
        }}
        langue={langue}
        changerLangue={vi.fn()}
        allerAConnexion={vi.fn()}
      />
    ) : (
      <LoginPage
        gateway={runtime}
        langue={langue}
        changerLangue={vi.fn()}
        allerAInscription={vi.fn()}
      />
    );
  const { rerender } = render(afficher('fr'));
  fireEvent.change(
    screen.getByLabelText(
      t('fr', inscription ? 'auth.emailLabel' : 'auth.fieldLabel')
    ),
    {
      target: { value: 'alice@example.com' },
    }
  );
  fireEvent.change(screen.getByLabelText(t('fr', 'auth.passwordLabel')), {
    target: { value: 'motdepasseincorrect' },
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: t('fr', inscription ? 'auth.register' : 'auth.join'),
    })
  );

  await waitFor(() => {
    expect(screen.getByRole('status').textContent).toBe(
      t('fr', `errors.${code}`)
    );
  });
  expect(
    (
      screen.getByRole('button', {
        name: t('fr', inscription ? 'auth.register' : 'auth.join'),
      }) as HTMLButtonElement
    ).disabled
  ).toBe(false);

  rerender(afficher('en'));
  expect(screen.getByRole('status').textContent).toBe(
    t('en', `errors.${code}`)
  );
  if (vue === 'inscription sans pseudo') {
    const requete = vi.mocked(fetch).mock.calls[0][1];
    expect(JSON.parse(requete?.body as string)).not.toHaveProperty('pseudo');
    expect(screen.getByRole('status').textContent).toBe(
      'The server rejected the account creation request.'
    );
  }
});
