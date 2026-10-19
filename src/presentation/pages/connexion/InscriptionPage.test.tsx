import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { InscriptionPage } from './InscriptionPage';
import { t } from '../../../i18n/i18n-web';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function saisir(courriel = 'alice@example.com', motDePasse = 'secret123') {
  fireEvent.change(screen.getByLabelText(t('fr', 'auth.emailLabel')), {
    target: { value: courriel },
  });
  fireEvent.change(screen.getByLabelText(t('fr', 'auth.passwordLabel')), {
    target: { value: motDePasse },
  });
  fireEvent.click(
    screen.getByRole('button', { name: t('fr', 'auth.register') })
  );
}

it.each([
  ['invalide', 'secret123', 'auth.invalidEmail'],
  ['alice@example.com', 'court', 'auth.invalidPassword'],
])(
  'explique la saisie invalide %s / %s sans appeler le serveur',
  (courriel, motDePasse, cle) => {
    const inscrire = vi.fn();
    render(
      <InscriptionPage
        gateway={{ inscrire }}
        langue="fr"
        changerLangue={vi.fn()}
        allerAConnexion={vi.fn()}
      />
    );
    saisir(courriel, motDePasse);
    expect(screen.getByRole('status').textContent).toBe(t('fr', cle));
    expect(inscrire).not.toHaveBeenCalled();
    if (cle === 'auth.invalidEmail') {
      expect(document.activeElement).toBe(
        screen.getByLabelText(t('fr', 'auth.emailLabel'))
      );
    }
  }
);

it.each([new Error('erreur inconnue'), 'erreur brute'])(
  'affiche un repli pour une erreur inconnue %s',
  async (erreur) => {
    render(
      <InscriptionPage
        gateway={{ inscrire: vi.fn().mockRejectedValue(erreur) }}
        langue="fr"
        changerLangue={vi.fn()}
        allerAConnexion={vi.fn()}
      />
    );
    saisir();
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        t('fr', 'errors.generic')
      )
    );
  }
);

it.each([true, false])(
  'ouvre la session après une inscription réussie (callback : %s)',
  async (avecCallback) => {
    const resultat = {
      utilisateur: { id: 'u1', pseudo: 'alice' },
      etatConnexion: { statut: 'connecte' as const, depuis: 1 },
    };
    const inscrire = vi.fn().mockResolvedValue(resultat);
    const navigation = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { allerAuTableauDeBord: navigation },
    });
    const sessionEtablie = vi.fn();
    const changerLangue = vi.fn();
    const allerAConnexion = vi.fn();
    render(
      <InscriptionPage
        gateway={{ inscrire }}
        langue="fr"
        changerLangue={changerLangue}
        allerAConnexion={allerAConnexion}
        {...(avecCallback ? { onSessionEtablie: sessionEtablie } : {})}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(changerLangue).toHaveBeenCalledWith('en');
    fireEvent.click(screen.getByRole('button', { name: /Déjà un compte/ }));
    expect(allerAConnexion).toHaveBeenCalledOnce();
    saisir(' alice@example.com ');
    await waitFor(() => {
      if (avecCallback) expect(sessionEtablie).toHaveBeenCalledWith(resultat);
      else expect(navigation).toHaveBeenCalledOnce();
    });
    expect(inscrire).toHaveBeenCalledWith({
      courriel: 'alice@example.com',
      motDePasse: 'secret123',
    });
  }
);
