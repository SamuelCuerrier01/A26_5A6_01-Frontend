import { useCallback, useRef, useState, type FormEvent } from 'react';
import mascotLogo from '../../../../assets/icon.png';
import { validationPseudo } from '../../../domain/entities/Utilisateur';
import { t, LANGUES_SUPPORTEES } from '../../../i18n/i18n-web';

interface PseudoChoicePageProps {
  pseudoInitial: string;
  langue: string;
  changerLangue: (langue: string) => void;
  onTermine: () => void;
}

interface ErreurSoumission {
  cle: string;
}

function traduireErreurSoumission(
  langue: string,
  erreur: ErreurSoumission
): string {
  if (erreur.cle.startsWith('auth.')) {
    return t(langue, erreur.cle);
  }
  const cleTraduction = `errors.${erreur.cle}`;
  const brutTraduit = t(langue, cleTraduction);
  return brutTraduit === cleTraduction
    ? t(langue, 'errors.generic')
    : brutTraduit;
}

function nettoyerPrefixeIpc(err: unknown): string {
  if (!(err instanceof Error)) return '';
  return err.message.replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    ''
  );
}

export function PseudoChoicePage({
  pseudoInitial,
  langue,
  changerLangue,
  onTermine,
}: PseudoChoicePageProps) {
  const [pseudo, setPseudo] = useState(pseudoInitial);
  const [erreurSoumission, setErreurSoumission] =
    useState<ErreurSoumission | null>(null);
  const [enCours, setEnCours] = useState(false);
  const pseudoRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const pseudoSaisi = pseudo.trim();
      if (!validationPseudo(pseudoSaisi)) {
        setErreurSoumission({ cle: 'auth.invalidFormat' });
        pseudoRef.current?.focus();
        return;
      }

      if (pseudoSaisi === pseudoInitial) {
        onTermine();
        return;
      }

      setEnCours(true);
      setErreurSoumission(null);
      try {
        await window.electronAPI.profilModifierPseudo(pseudoSaisi);
        onTermine();
      } catch (err) {
        const brut = nettoyerPrefixeIpc(err);
        const cle = brut === 'ERR_HTTP_409' ? 'auth.taken' : brut;
        setErreurSoumission({ cle });
        setEnCours(false);
        pseudoRef.current?.focus();
      }
    },
    [pseudo, pseudoInitial, onTermine]
  );

  return (
    <div className="screen-login">
      <div
        className="language-switch"
        role="group"
        aria-label={t(langue, 'auth.languageLabel')}
      >
        {LANGUES_SUPPORTEES.map((code) => (
          <button
            key={code}
            type="button"
            className={`lang-btn ${code === langue ? 'active' : ''}`}
            onClick={() => changerLangue(code)}
            aria-pressed={code === langue}
          >
            {code.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="login-brand">ChatVardage</div>
      <form className="login-card" onSubmit={handleSubmit} noValidate>
        <img
          className="login-mascot"
          src={mascotLogo}
          alt=""
          aria-hidden="true"
        />

        <h1 className="login-card-title">{t(langue, 'pseudoChoice.title')}</h1>
        <p className="field-message" data-kind="idle">
          {t(langue, 'pseudoChoice.description')}
        </p>

        <label htmlFor="pseudo-choice-input">
          {t(langue, 'pseudoChoice.pseudoLabel')}
        </label>
        <input
          id="pseudo-choice-input"
          name="pseudo"
          type="text"
          autoComplete="off"
          maxLength={20}
          value={pseudo}
          onChange={(event) => setPseudo(event.target.value)}
          ref={pseudoRef}
        />

        {erreurSoumission && (
          <p
            className="field-message"
            role="status"
            aria-live="polite"
            data-kind="error"
          >
            {traduireErreurSoumission(langue, erreurSoumission)}
          </p>
        )}

        <button type="submit" disabled={enCours}>
          {enCours
            ? t(langue, 'pseudoChoice.submitting')
            : t(langue, 'pseudoChoice.submit')}
        </button>

        <button type="button" className="login-switch" onClick={onTermine}>
          {t(langue, 'pseudoChoice.skip')}
        </button>
      </form>
    </div>
  );
}
