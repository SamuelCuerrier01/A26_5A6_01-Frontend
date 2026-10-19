'use strict';

(function (global) {
  const MODE_SYSTEME = 'systeme';
  const MODE_DISCRET = 'discret';
  const MODE_AUCUNE = 'aucune';
  const MODES = [MODE_SYSTEME, MODE_DISCRET, MODE_AUCUNE];
  const MODE_PAR_DEFAUT = MODE_SYSTEME;

  function clefMode(utilisateurId) {
    return `notif:mode:${utilisateurId}`;
  }

  function clefApercu(utilisateurId) {
    return `notif:apercu:${utilisateurId}`;
  }

  function afficheApercu(utilisateurId) {
    if (!utilisateurId) return true;
    try {
      return global.localStorage.getItem(clefApercu(utilisateurId)) !== 'non';
    } catch {
      return true;
    }
  }

  function definirApercu(utilisateurId, affiche) {
    if (!utilisateurId) return;
    try {
      global.localStorage.setItem(
        clefApercu(utilisateurId),
        affiche ? 'oui' : 'non'
      );
    } catch {
    }
  }

  function obtenirMode(utilisateurId) {
    if (!utilisateurId) return MODE_PAR_DEFAUT;
    try {
      const valeur = global.localStorage.getItem(clefMode(utilisateurId));
      return MODES.includes(valeur) ? valeur : MODE_PAR_DEFAUT;
    } catch {
      return MODE_PAR_DEFAUT;
    }
  }

  function afficheRonds(utilisateurId) {
    return obtenirMode(utilisateurId) !== MODE_AUCUNE;
  }

  function definirMode(utilisateurId, mode) {
    if (!utilisateurId || !MODES.includes(mode)) return;
    try {
      global.localStorage.setItem(clefMode(utilisateurId), mode);
    } catch {
    }
  }

  const compteurs = { salon: new Map(), prive: new Map() };
  const lecturesEnCours = { salon: new Set(), prive: new Set() };
  const rechargementsEnAttente = { salon: new Set(), prive: new Set() };
  const rendusLectures = { salon: new Map(), prive: new Map() };
  let generationChargement = 0;
  let revisionCompteurs = 0;

  async function chargerNonLus(api) {
    const generation = ++generationChargement;
    try {
      for (let tentative = 0; tentative < 2; tentative += 1) {
        const revision = revisionCompteurs;
        const nonLus = await api.obtenirNonLus();
        if (generation !== generationChargement) return;
        if (revision !== revisionCompteurs) continue;
        for (const [type, source] of [
          ['salon', nonLus?.salons],
          ['prive', nonLus?.prives],
        ]) {
          for (const id of lecturesEnCours[type]) {
            rechargementsEnAttente[type].add(id);
          }
          for (const id of compteurs[type].keys()) {
            if (!lecturesEnCours[type].has(id)) compteurs[type].delete(id);
          }
          for (const [id, nombre] of Object.entries(source ?? {})) {
            if (nombre > 0 && !lecturesEnCours[type].has(id))
              compteurs[type].set(id, nombre);
          }
        }
        return;
      }
    } catch (erreur) {
      console.warn('[non-lus] compteurs indisponibles :', erreur);
    }
  }

  function nombreNonLus(type, conversationId) {
    return compteurs[type]?.get(conversationId) ?? 0;
  }

  function ajouterNonLu(type, conversationId) {
    if (!compteurs[type] || !conversationId) return;
    revisionCompteurs += 1;
    compteurs[type].set(conversationId, nombreNonLus(type, conversationId) + 1);
  }

  function marquerLu(api, type, conversationId, options = {}) {
    rendusLectures[type].set(conversationId, options);
    const messageId = options.messageId;
    const nombre = nombreNonLus(type, conversationId);
    if (lecturesEnCours[type].has(conversationId)) return;
    if (!nombre) {
      rendusLectures[type].delete(conversationId);
      return;
    }
    revisionCompteurs += 1;
    lecturesEnCours[type].add(conversationId);
    compteurs[type].delete(conversationId);
    let reussi = false;
    Promise.resolve()
      .then(() => api.marquerConversationLue({
        type, conversationId, ...(messageId ? { messageId } : {}),
      }))
      .then((reponse) => {
        reussi = true;
        revisionCompteurs += 1;
        const restants = Math.max(
          nombreNonLus(type, conversationId),
          reponse?.nonLus ?? 0
        );
        if (restants) compteurs[type].set(conversationId, restants);
      })
      .catch((erreur) => {
        revisionCompteurs += 1;
        compteurs[type].set(
          conversationId,
          nombreNonLus(type, conversationId) + nombre
        );
        console.warn('[non-lus] marquage comme lu impossible :', erreur);
      })
      .finally(async () => {
        lecturesEnCours[type].delete(conversationId);
        const rechargementDemande =
          rechargementsEnAttente[type].delete(conversationId);
        const dernierRendu = rendusLectures[type].get(conversationId) ?? options;
        rendusLectures[type].delete(conversationId);
        const estAffichee = dernierRendu.estAffichee?.() ?? false;
        if ((reussi && !estAffichee) || rechargementDemande) {
          await chargerNonLus(api);
        }
        options.surChangement?.();
        if (
          reussi &&
          nombreNonLus(type, conversationId) &&
          dernierRendu.estAffichee?.() &&
          (!messageId || dernierRendu.messageId !== messageId)
        ) {
          marquerLu(api, type, conversationId, dernierRendu);
        }
      });
  }

  function totalNonLus({ type, conversationIds } = {}) {
    const types = type ? [type] : ['salon', 'prive'];
    let total = 0;
    for (const t of types) {
      const ids = conversationIds ?? [...compteurs[t].keys()];
      for (const id of ids) total += nombreNonLus(t, id);
    }
    return total;
  }

  function libelleNonLus(nombre) {
    return nombre > 99 ? '99+' : String(nombre);
  }

  function remplirCompteur(element, nombre, visible = true) {
    if (!element) return;
    const affiche = visible && nombre > 0;
    element.hidden = !affiche;
    element.textContent = affiche ? libelleNonLus(nombre) : '';
  }

  function genererIconeBadge(nombre) {
    const texte = nombre > 9 ? '9+' : String(nombre);
    const taille = 32;
    const canvas = global.document.createElement('canvas');
    canvas.width = taille;
    canvas.height = taille;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#e53935';
    ctx.beginPath();
    ctx.arc(taille / 2, taille / 2, taille / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texte, taille / 2, taille / 2 + 1);
    return canvas.toDataURL('image/png');
  }

  function appliquerBadge(serviceNotifications, nombre) {
    if (typeof serviceNotifications?.setBadgeCount !== 'function') return;
    serviceNotifications.setBadgeCount(
      nombre,
      nombre > 0 ? genererIconeBadge(nombre) : null
    );
  }

  async function traiterMessageRecu(message, options) {
    const { utilisateurId, surSalon, surPrive, notifierMessageSysteme, api, surNonLusActualises } =
      options ?? {};
    try {
      const mode = obtenirMode(utilisateurId);
      console.log(
        `[notifications:message-recu] reçu (type=${message.type}, auteur=${message.auteurId}, utilisateur courant=${utilisateurId}, mode=${mode})`
      );
      if (message.type === 'salon') {
        await surSalon?.();
      } else {
        await surPrive?.();
      }
      if (message.auteurId === utilisateurId) {
        console.log(
          '[notifications:message-recu] ignoré : auteur = utilisateur courant (jamais de notif pour son propre message).'
        );
      } else if (mode !== MODE_SYSTEME) {
        console.log(
          `[notifications:message-recu] pas de notification système : mode actuel = "${mode}" (seul le mode "systeme" en déclenche).`
        );
      } else {
        notifierMessageSysteme?.(
          afficheApercu(utilisateurId)
            ? message
            : { ...message, contenu: '', apercuMasque: true }
        );
      }
      if (api && message.auteurId !== utilisateurId) {
        await chargerNonLus(api);
        await surNonLusActualises?.();
      }
    } catch (erreur) {
      console.error('[notifications:message-recu] ERREUR:', erreur);
    }
  }

  global.NotifPrefs = {
    MODE_SYSTEME,
    MODE_DISCRET,
    MODE_AUCUNE,
    MODES,
    obtenirMode,
    definirMode,
    afficheRonds,
    afficheApercu,
    definirApercu,
    chargerNonLus,
    nombreNonLus,
    ajouterNonLu,
    marquerLu,
    totalNonLus,
    libelleNonLus,
    remplirCompteur,
    genererIconeBadge,
    appliquerBadge,
    traiterMessageRecu,
  };
})(window);
