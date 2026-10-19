import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import mascotLogo from '../../../../assets/icon.png';
import type { AuthGateway } from '../../../infrastructure/gateways/AuthGateway';
import { t, LANGUES_SUPPORTEES } from '../../../i18n/i18n-web';

export type GatewaySession = Pick<AuthGateway, 'authentifier'>;

type LoginPageProps = {
  gateway: GatewaySession;
  langue: string;
  changerLangue: (langue: string) => void;
  onSessionEtablie?: () => void;
  allerAInscription: () => void;
  messageRetour?: string | null;
} & (
  | {
      messageRetourConfirmable: true;
      onMessageRetourConfirme: () => void;
    }
  | {
      messageRetourConfirmable?: false;
      onMessageRetourConfirme?: never;
    }
);

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

const SELECTEUR_FOCUSABLES =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function gererFocusTrapRetourSession(
  dialog: HTMLDivElement,
  event: KeyboardEvent,
  onConfirme?: () => void
): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    onConfirme?.();
    return;
  }

  if (event.key !== 'Tab') {
    return;
  }

  const focusablesActuels = Array.from(
    dialog.querySelectorAll<HTMLElement>(SELECTEUR_FOCUSABLES)
  );

  if (focusablesActuels.length === 0) {
    return;
  }

  const firstFocusableActuel = focusablesActuels[0];
  const lastFocusableActuel = focusablesActuels[focusablesActuels.length - 1];
  const currentTarget = document.activeElement as HTMLElement | null;
  const doitRebouclement = event.shiftKey
    ? !dialog.contains(currentTarget) || currentTarget === firstFocusableActuel
    : !dialog.contains(currentTarget) || currentTarget === lastFocusableActuel;

  if (!doitRebouclement) {
    return;
  }

  event.preventDefault();
  const cibleFocus = event.shiftKey
    ? lastFocusableActuel
    : firstFocusableActuel;
  cibleFocus.focus();
}

export function LoginPage({
  gateway,
  langue,
  changerLangue,
  onSessionEtablie,
  allerAInscription,
  messageRetour = null,
  messageRetourConfirmable = false,
  onMessageRetourConfirme,
}: LoginPageProps) {
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreurSoumission, setErreurSoumission] =
    useState<ErreurSoumission | null>(null);
  const [enCours, setEnCours] = useState(false);

  const identifiantRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const messageRetourTitreId = useId();
  const messageRetourDescriptionId = useId();

  useEffect(() => {
    if (!messageRetour || !messageRetourConfirmable || !dialogRef.current) {
      return undefined;
    }

    const dialog = dialogRef.current;
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(SELECTEUR_FOCUSABLES)
    );
    const firstFocusable = focusables[0] ?? dialog;
    firstFocusable.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      gererFocusTrapRetourSession(dialog, event, onMessageRetourConfirme);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (previousActiveElement && previousActiveElement.focus) {
        previousActiveElement.focus();
      }
    };
  }, [messageRetour, messageRetourConfirmable, onMessageRetourConfirme]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const identifiantSaisi = identifiant.trim();
      if (!identifiantSaisi || !motDePasse) {
        setErreurSoumission({ cle: 'auth.invalidFormat' });
        identifiantRef.current?.focus();
        return;
      }

      setEnCours(true);
      setErreurSoumission(null);
      try {
        await gateway.authentifier({
          identifiant: identifiantSaisi,
          motDePasse,
        });

        if (onSessionEtablie) {
          onSessionEtablie();
        } else {
          await window.electronAPI.allerAuTableauDeBord();
        }
      } catch (err) {
        const cle =
          err instanceof Error
            ? err.message
            : typeof err === 'string' && err.length > 0
              ? err
              : 'generic';
        setErreurSoumission({ cle });
        setEnCours(false);
        identifiantRef.current?.focus();
      }
    },
    [identifiant, motDePasse, gateway, onSessionEtablie]
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

        <label htmlFor="identifiant-input">
          {t(langue, 'auth.fieldLabel')}
        </label>
        <input
          id="identifiant-input"
          name="identifiant"
          type="text"
          autoComplete="username"
          placeholder={t(langue, 'auth.usernamePlaceholder')}
          maxLength={254}
          value={identifiant}
          onChange={(event) => setIdentifiant(event.target.value)}
          ref={identifiantRef}
        />

        <label htmlFor="mot-de-passe-input">
          {t(langue, 'auth.passwordLabel')}
        </label>
        <input
          id="mot-de-passe-input"
          name="motDePasse"
          type="password"
          autoComplete="current-password"
          placeholder={t(langue, 'auth.passwordPlaceholder')}
          value={motDePasse}
          onChange={(event) => setMotDePasse(event.target.value)}
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

        {messageRetour && !erreurSoumission && !messageRetourConfirmable && (
          <p className="field-message" role="status" data-kind="info">
            {t(langue, messageRetour)}
          </p>
        )}

        <button type="submit" disabled={enCours}>
          {enCours ? t(langue, 'auth.connecting') : t(langue, 'auth.join')}
        </button>

        <p className="login-hint">{t(langue, 'auth.hint')}</p>

        <button
          type="button"
          className="login-switch"
          onClick={allerAInscription}
        >
          {t(langue, 'auth.noAccount')} {t(langue, 'auth.createAccount')}
        </button>
      </form>

      {messageRetour && messageRetourConfirmable && (
        <div
          className="session-return-overlay"
          onClick={() => {
            if (onMessageRetourConfirme) {
              onMessageRetourConfirme();
            }
          }}
        >
          <div
            ref={dialogRef}
            className="session-return-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={messageRetourTitreId}
            aria-describedby={messageRetourDescriptionId}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={messageRetourTitreId} className="session-return-title">
              {t(langue, 'auth.sessionReturnTitle')}
            </h2>
            <p
              id={messageRetourDescriptionId}
              className="session-return-message"
            >
              {t(langue, messageRetour)}
              <span className="session-return-hint">
                {t(langue, 'auth.sessionInactiveDismissHint')}
              </span>
            </p>
            <button
              type="button"
              className="session-return-button"
              onClick={() => {
                if (onMessageRetourConfirme) {
                  onMessageRetourConfirme();
                }
              }}
            >
              {t(langue, 'auth.sessionInactiveConfirm')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
