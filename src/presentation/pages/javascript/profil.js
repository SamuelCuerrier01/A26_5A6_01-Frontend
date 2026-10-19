'use strict';

const I18n =
  window.I18n ??
  (() => {
    console.error(
      '[profil] window.I18n est introuvable : i18n-browser.js doit être chargé avant profil.js (voir profil.html). Traductions désactivées pour cette session (clés brutes affichées).'
    );
    return {
      t: (cle) => cle,
      appliquerTraductionsStatiques: () => {},
      messageErreur: (erreur) =>
        erreur instanceof Error ? erreur.message : String(erreur),
      initialiserDepuisElectronAPI: async () => 'fr',
      obtenirLangue: () => 'fr',
      definirLangueActuelle: () => {},
    };
  })();
const t = I18n.t;
const appliquerTraductionsStatiques = I18n.appliquerTraductionsStatiques;
const messageErreur = I18n.messageErreur;

const ThemeManager =
  window.ThemeManager ??
  (() => {
    console.error(
      '[profil] window.ThemeManager est introuvable : theme-browser.js doit être chargé avant profil.js (voir profil.html). Le thème reste bloqué sur sombre pour cette session.'
    );
    return {
      appliquerTheme: () => {},
      obtenirTheme: () => 'sombre',
      initialiserDepuisElectronAPI: async () => 'sombre',
    };
  })();

function creerEl(tag, options = {}) {
  const { classe, texte, attrs, enfants } = options;
  const element = document.createElement(tag);
  if (classe) element.className = classe;
  if (texte !== undefined) element.textContent = texte;
  if (attrs) {
    for (const [nom, valeur] of Object.entries(attrs)) {
      element.setAttribute(nom, valeur);
    }
  }
  if (enfants) {
    for (const enfant of enfants) {
      if (enfant) element.appendChild(enfant);
    }
  }
  return element;
}

window.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);
  const el = {
    homeBtn: $('home-btn'),
    avatar: $('profile-avatar'),
    avatarWrap: document.querySelector('.profile-avatar-wrap'),
    avatarInput: $('avatar-input'),
    avatarRemove: $('avatar-remove'),
    nomAffiche: $('profile-display-name'),
    handle: $('profile-handle'),
    roleBadge: $('profile-role-badge'),
    courrielAffiche: $('profile-email-display'),
    identityForm: $('identity-form'),
    pseudoInput: $('pseudo-input'),
    aliasInput: $('alias-input'),
    identityMessage: $('identity-message'),
    accountForm: $('account-form'),
    emailInput: $('email-input'),
    newPasswordInput: $('new-password-input'),
    currentPasswordField: $('current-password-field'),
    currentPasswordInput: $('current-password-input'),
    accountMessage: $('account-message'),
    deletePasswordInput: $('delete-password-input'),
    deleteMessage: $('delete-message'),
    deleteActions: $('delete-account-actions'),
    backToDashboard: $('back-to-dashboard'),
    logoutBtn: $('logout-btn'),
    logoutAllBtn: $('logout-all-btn'),
    logoutAllMessage: $('logout-all-message'),
    logoutOthersBtn: $('logout-others-btn'),
    logoutOthersMessage: $('logout-others-message'),
    toast: $('toast'),
  };

  let utilisateur = null;
  let preferences = null;

  function notifier(message, erreur = false) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.toggle('error', erreur);
    el.toast.classList.add('visible');
    window.setTimeout(() => el.toast.classList.remove('visible'), 2600);
  }

  function afficherMessageChamp(element, texte, genre) {
    if (!element) return;
    element.textContent = texte;
    element.hidden = !texte;
    element.dataset.kind = genre;
  }

  async function avecChargement(bouton, action) {
    const libelle = bouton.textContent;
    bouton.disabled = true;
    bouton.dataset.loading = 'true';
    bouton.textContent = t('profile.saving');
    try {
      return await action();
    } finally {
      bouton.dataset.loading = 'false';
      bouton.textContent = libelle;
    }
  }

  await I18n.initialiserDepuisElectronAPI(window.electronAPI);
  appliquerTraductionsStatiques();
  await ThemeManager.initialiserDepuisElectronAPI(window.electronAPI);

  if (window.Inactivite?.initialiserPageInactivite) {
    void window.Inactivite.initialiserPageInactivite();
  }

  function afficherEntete() {
    const pseudo = el.pseudoInput?.value.trim() || utilisateur?.pseudo || '';
    const alias = el.aliasInput?.value.trim() || '';
    const nom = alias || pseudo || '…';
    if (el.nomAffiche) el.nomAffiche.textContent = nom;
    if (el.avatar) {
      if (preferences?.avatar) {
        let image = el.avatar.querySelector('img');
        if (!image) {
          image = creerEl('img', { attrs: { alt: '', draggable: 'false' } });
          el.avatar.replaceChildren(image);
        }
        if (image.getAttribute('src') !== preferences.avatar) {
          image.src = preferences.avatar;
        }
      } else {
        el.avatar.textContent = nom.charAt(0).toUpperCase() || '?';
      }
    }
    if (el.avatarRemove) el.avatarRemove.hidden = !preferences?.avatar;
    if (el.handle) el.handle.textContent = pseudo ? `@${pseudo}` : '';
    if (el.courrielAffiche)
      el.courrielAffiche.textContent = utilisateur?.courriel ?? '';
    if (el.roleBadge) {
      const role = utilisateur?.role;
      const cle = role === 'admin' ? 'channels.roleAdmin' : null;
      el.roleBadge.hidden = !cle;
      el.roleBadge.textContent = cle ? t(cle) : '';
    }
  }

  function cocher(nom, valeur) {
    document
      .querySelectorAll(`input[name="${nom}"]`)
      .forEach((radio) => (radio.checked = radio.value === valeur));
  }

  function afficherPreferences(nouvelles) {
    const avatarChange = nouvelles.avatar !== preferences?.avatar;
    preferences = nouvelles;
    if (avatarChange) afficherEntete();
    ThemeManager.appliquerTheme(nouvelles.theme);
    if (nouvelles.langue && nouvelles.langue !== I18n.obtenirLangue()) {
      I18n.definirLangueActuelle(nouvelles.langue);
      appliquerTraductionsStatiques();
      afficherEntete();
      afficherBoutonSupprimer();
    }
    cocher('theme', nouvelles.theme);
    cocher('langue', nouvelles.langue);
    cocher('modeNotification', nouvelles.modeNotification);
  }

  for (const nom of ['theme', 'langue', 'modeNotification']) {
    document.querySelectorAll(`input[name="${nom}"]`).forEach((radio) => {
      radio.addEventListener('change', async () => {
        const precedentes = { ...preferences };
        afficherPreferences({ ...preferences, [nom]: radio.value });
        try {
          afficherPreferences(
            await window.electronAPI.modifierPreferences({ [nom]: radio.value })
          );
          notifier(t('profile.preferencesUpdated'));
        } catch (erreur) {
          afficherPreferences(precedentes);
          notifier(messageErreur(erreur), true);
        }
      });
    });
  }

  window.electronAPI.onPreferencesChange?.((nouvelles) => {
    const aliasModifie = aliasEnCoursDEdition();
    afficherPreferences(nouvelles);
    if (!aliasModifie && el.aliasInput) {
      el.aliasInput.value = nouvelles.alias ?? '';
      majEtatFormulaireIdentite();
    }
  });

  const TAILLE_AVATAR_PX = 256;
  const LONGUEUR_MAX_AVATAR = 88_000;
  const TAILLE_MAX_FICHIER = 10 * 1024 * 1024;

  async function redimensionnerAvatar(fichier) {
    const bitmap = await createImageBitmap(fichier);
    const cote = Math.min(bitmap.width, bitmap.height);
    const canvas = creerEl('canvas', {
      attrs: {
        width: String(TAILLE_AVATAR_PX),
        height: String(TAILLE_AVATAR_PX),
      },
    });
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      bitmap,
      (bitmap.width - cote) / 2,
      (bitmap.height - cote) / 2,
      cote,
      cote,
      0,
      0,
      TAILLE_AVATAR_PX,
      TAILLE_AVATAR_PX
    );
    bitmap.close();
    for (const qualite of [0.85, 0.7, 0.5, 0.35]) {
      const donnees = canvas.toDataURL('image/webp', qualite);
      if (donnees.length <= LONGUEUR_MAX_AVATAR) return donnees;
    }
    throw new Error(t('profile.avatarTooLarge'));
  }

  async function enregistrerAvatar(avatar, messageSucces) {
    if (el.avatarWrap) el.avatarWrap.dataset.loading = 'true';
    try {
      afficherPreferences(
        await window.electronAPI.modifierPreferences({ avatar })
      );
      notifier(messageSucces);
    } catch (erreur) {
      notifier(messageErreur(erreur), true);
    } finally {
      if (el.avatarWrap) el.avatarWrap.dataset.loading = 'false';
    }
  }

  el.avatarInput?.addEventListener('change', async () => {
    const fichier = el.avatarInput.files?.[0];
    el.avatarInput.value = '';
    if (!fichier) return;
    if (fichier.size > TAILLE_MAX_FICHIER) {
      notifier(t('profile.avatarTooLarge'), true);
      return;
    }
    let avatar;
    try {
      avatar = await redimensionnerAvatar(fichier);
    } catch {
      notifier(t('profile.avatarInvalid'), true);
      return;
    }
    await enregistrerAvatar(avatar, t('profile.avatarUpdated'));
  });

  el.avatarRemove?.addEventListener('click', () =>
    enregistrerAvatar('', t('profile.avatarRemoved'))
  );

  document.querySelectorAll('input[name="presence"]').forEach((radio) => {
    radio.addEventListener('change', async () => {
      const precedente = radio.value === 'en-ligne' ? 'hors-ligne' : 'en-ligne';
      try {
        await window.electronAPI.modifierPresence(radio.value);
        notifier(t('profile.preferencesUpdated'));
      } catch (erreur) {
        cocher('presence', precedente);
        notifier(messageErreur(erreur), true);
      }
    });
  });

  window.electronAPI.onPresenceChange?.((presence) => {
    if (presence?.utilisateurId === utilisateur?.id) {
      cocher('presence', presence.statut);
    }
  });

  function aliasEnCoursDEdition() {
    return (el.aliasInput?.value.trim() ?? '') !== (preferences?.alias ?? '');
  }

  function majEtatFormulaireIdentite() {
    const bouton = el.identityForm?.querySelector('button[type="submit"]');
    if (!bouton || bouton.dataset.loading === 'true') return;
    const pseudo = el.pseudoInput.value.trim();
    const change =
      pseudo !== (utilisateur?.pseudo ?? '') || aliasEnCoursDEdition();
    bouton.disabled = !change || !pseudo;
    afficherEntete();
  }

  el.pseudoInput?.addEventListener('input', majEtatFormulaireIdentite);
  el.aliasInput?.addEventListener('input', majEtatFormulaireIdentite);

  el.identityForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const bouton =
      event.submitter ?? el.identityForm.querySelector('button[type="submit"]');
    const pseudo = el.pseudoInput.value.trim();
    const alias = el.aliasInput.value.trim();
    if (!pseudo) return;
    afficherMessageChamp(el.identityMessage, '', 'ok');
    try {
      await avecChargement(bouton, async () => {
        if (pseudo !== utilisateur?.pseudo) {
          utilisateur = await window.electronAPI.profilModifierPseudo(pseudo);
          el.pseudoInput.value = utilisateur.pseudo;
        }
        if (alias !== (preferences?.alias ?? '')) {
          const nouvelles = await window.electronAPI.modifierPreferences({
            alias,
          });
          preferences = nouvelles;
          el.aliasInput.value = nouvelles.alias ?? '';
        }
      });
      afficherMessageChamp(el.identityMessage, t('profile.saved'), 'ok');
    } catch (erreur) {
      afficherMessageChamp(el.identityMessage, messageErreur(erreur), 'error');
    }
    majEtatFormulaireIdentite();
  });

  function messageErreurMotDePasse(erreur) {
    return String(erreur?.message ?? '').includes('ERR_HTTP_401')
      ? t('profile.currentPasswordIncorrect')
      : messageErreur(erreur);
  }

  function majEtatFormulaireCompte() {
    const bouton = el.accountForm?.querySelector('button[type="submit"]');
    if (!bouton || bouton.dataset.loading === 'true') return;
    const change = Boolean(el.newPasswordInput.value);
    if (el.currentPasswordField) el.currentPasswordField.hidden = !change;
    bouton.disabled = !change || !el.currentPasswordInput.value;
  }

  el.newPasswordInput?.addEventListener('input', majEtatFormulaireCompte);
  el.currentPasswordInput?.addEventListener('input', majEtatFormulaireCompte);

  el.accountForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const bouton =
      event.submitter ?? el.accountForm.querySelector('button[type="submit"]');
    const motDePasse = el.newPasswordInput.value;
    const motDePasseActuel = el.currentPasswordInput.value;
    if (!motDePasse) return;
    if (!motDePasseActuel) {
      afficherMessageChamp(
        el.accountMessage,
        t('profile.currentPasswordRequiredHint'),
        'error'
      );
      return;
    }
    const donnees = { motDePasseActuel, motDePasse };
    try {
      utilisateur = await avecChargement(bouton, () =>
        window.electronAPI.profilModifierCompte(donnees)
      );
      el.emailInput.value = utilisateur.courriel ?? '';
      el.newPasswordInput.value = '';
      el.currentPasswordInput.value = '';
      afficherMessageChamp(
        el.accountMessage,
        t('profile.accountUpdated'),
        'ok'
      );
      afficherEntete();
    } catch (erreur) {
      afficherMessageChamp(
        el.accountMessage,
        messageErreurMotDePasse(erreur),
        'error'
      );
    }
    majEtatFormulaireCompte();
  });

  function afficherBoutonSupprimer() {
    if (!el.deleteActions) return;
    const bouton = creerEl('button', {
      classe: 'danger-button',
      texte: t('profile.deleteButton'),
      attrs: { type: 'button' },
    });
    bouton.addEventListener('click', afficherConfirmationSuppression);
    el.deleteActions.replaceChildren(bouton);
  }

  function afficherConfirmationSuppression() {
    if (!el.deleteActions) return;
    const question = creerEl('span', {
      classe: 'confirm-question',
      texte: t('profile.deleteConfirm'),
    });
    const boutonAnnuler = creerEl('button', {
      classe: 'ghost-button',
      texte: t('messages.cancel'),
      attrs: { type: 'button' },
    });
    const boutonConfirmer = creerEl('button', {
      classe: 'danger-button',
      texte: t('profile.deleteButton'),
      attrs: { type: 'button' },
    });

    boutonAnnuler.addEventListener('click', afficherBoutonSupprimer);
    boutonConfirmer.addEventListener('click', async () => {
      const motDePasseActuel = el.deletePasswordInput.value;
      if (!motDePasseActuel) {
        afficherMessageChamp(
          el.deleteMessage,
          t('profile.currentPasswordRequiredHint'),
          'error'
        );
        el.deletePasswordInput.focus();
        return;
      }
      boutonAnnuler.disabled = true;
      boutonConfirmer.disabled = true;
      try {
        await window.electronAPI.profilSupprimerCompte(motDePasseActuel);
        oublierRailEnCache();
        await window.electronAPI.allerALaConnexion();
      } catch (erreur) {
        afficherMessageChamp(
          el.deleteMessage,
          messageErreurMotDePasse(erreur),
          'error'
        );
        boutonAnnuler.disabled = false;
        boutonConfirmer.disabled = false;
      }
    });

    el.deleteActions.replaceChildren(
      creerEl('div', {
        classe: 'confirm-delete-row',
        enfants: [question, boutonAnnuler, boutonConfirmer],
      })
    );
  }

  afficherBoutonSupprimer();

  const boutonsNav = [...document.querySelectorAll('.profile-nav button')];
  for (const bouton of boutonsNav) {
    bouton.addEventListener('click', () => {
      $(bouton.dataset.target)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }
  if ('IntersectionObserver' in window) {
    const observateur = new IntersectionObserver(
      (entrees) => {
        const visible = entrees.find((entree) => entree.isIntersecting);
        if (!visible) return;
        for (const bouton of boutonsNav) {
          bouton.classList.toggle(
            'active',
            bouton.dataset.target === visible.target.id
          );
        }
      },
      { root: $('profile-main'), rootMargin: '0px 0px -65% 0px' }
    );
    boutonsNav.forEach((bouton) => {
      const section = $(bouton.dataset.target);
      if (section) observateur.observe(section);
    });
  }

  function oublierRailEnCache() {
    try {
      localStorage.removeItem('chatvardage:rail-serveurs');
    } catch {}
  }

  const allerAuTableauDeBord = () => window.electronAPI.navigate('index.html');
  el.backToDashboard?.addEventListener('click', allerAuTableauDeBord);
  el.homeBtn?.addEventListener('click', allerAuTableauDeBord);
  el.logoutBtn?.addEventListener('click', async () => {
    oublierRailEnCache();
    try {
      await window.electronAPI.deconnexionSession();
    } catch (erreur) {
      console.error('[logout] échec de deconnexionSession :', erreur);
    }
    await window.electronAPI.allerALaConnexion();
  });
  el.logoutOthersBtn?.addEventListener('click', async () => {
    afficherMessageChamp(el.logoutOthersMessage, '', 'ok');
    el.logoutOthersBtn.disabled = true;
    try {
      await window.electronAPI.deconnexionAutres();
      afficherMessageChamp(
        el.logoutOthersMessage,
        t('profile.logoutOthersDone'),
        'ok'
      );
    } catch (erreur) {
      afficherMessageChamp(
        el.logoutOthersMessage,
        messageErreur(erreur),
        'error'
      );
    } finally {
      el.logoutOthersBtn.disabled = false;
    }
  });
  el.logoutAllBtn?.addEventListener('click', async () => {
    afficherMessageChamp(el.logoutAllMessage, '', 'ok');
    el.logoutAllBtn.disabled = true;
    try {
      await window.electronAPI.deconnexionPartout();
    } catch (erreur) {
      afficherMessageChamp(el.logoutAllMessage, messageErreur(erreur), 'error');
      el.logoutAllBtn.disabled = false;
      return;
    }
    oublierRailEnCache();
    await window.electronAPI.allerALaConnexion();
  });

  const [resultatProfil, resultatPreferences] = await Promise.allSettled([
    window.electronAPI.profilObtenir(),
    window.electronAPI.configObtenir(),
  ]);
  if (resultatProfil.status === 'fulfilled') {
    utilisateur = resultatProfil.value;
    el.pseudoInput.value = utilisateur.pseudo ?? '';
    el.emailInput.value = utilisateur.courriel ?? '';
  } else {
    notifier(messageErreur(resultatProfil.reason), true);
  }
  if (resultatPreferences.status === 'fulfilled') {
    const config = resultatPreferences.value;
    el.aliasInput.value = config.alias ?? '';
    afficherPreferences({
      theme: config.theme,
      langue: config.langue,
      modeNotification: config.modeNotification,
      alias: config.alias ?? null,
      avatar: config.avatar ?? null,
    });
  } else {
    afficherPreferences(await window.electronAPI.obtenirPreferences());
    el.aliasInput.value = preferences?.alias ?? '';
    notifier(messageErreur(resultatPreferences.reason), true);
  }
  try {
    const presences = await window.electronAPI.obtenirPresences();
    cocher('presence', presences?.[utilisateur?.id] ?? 'en-ligne');
  } catch {}
  afficherEntete();
  majEtatFormulaireIdentite();
  majEtatFormulaireCompte();
  ThemeManager.pagePrete?.();
});
