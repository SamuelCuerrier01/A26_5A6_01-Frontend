function creerEl(tag, options = {}) {
  const { classe, texte, attrs, dataset, enfants } = options;
  const element = document.createElement(tag);
  if (classe) element.className = classe;
  if (texte !== undefined) element.textContent = texte;
  if (attrs) {
    for (const [nom, valeur] of Object.entries(attrs)) {
      element.setAttribute(nom, valeur);
    }
  }
  if (dataset) {
    for (const [cle, valeur] of Object.entries(dataset)) {
      element.dataset[cle] = valeur;
    }
  }
  if (enfants) {
    for (const enfant of enfants) {
      if (enfant) element.appendChild(enfant);
    }
  }
  return element;
}

function creerIconeCadenas() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'icone-cadenas');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute(
    'd',
    'M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5H6V4.5a2 2 0 1 1 4 0V6Z'
  );
  svg.appendChild(path);
  return svg;
}

function nomSalon(salon) {
  const cle = LogiqueInterface.cleNomSalon(salon);
  return cle ? t(cle) : salon.nom;
}

function contenuMessage(message) {
  const cle = LogiqueInterface.cleContenuMessage(message);
  return cle ? t(cle) : message.contenu;
}

function remplirLabelSalon(element, salon) {
  if (salon.visibilite === 'prive') {
    element.replaceChildren(
      creerIconeCadenas(),
      document.createTextNode(` ${nomSalon(salon)}`)
    );
  } else {
    element.replaceChildren(document.createTextNode(`# ${nomSalon(salon)}`));
  }
}

function notifier(message, erreur = false) {
  el.toast.textContent = message;
  el.toast.classList.toggle('error', erreur);
  el.toast.classList.add('visible');
  window.setTimeout(() => el.toast.classList.remove('visible'), 2600);
}

function ouvrirDialogue(titre, contenu) {
  el.titreDialogue.textContent = titre;
  el.contenuDialogue.replaceChildren(
    ...(Array.isArray(contenu) ? contenu : [contenu])
  );
  el.dialogue.showModal();
}

function afficherUtilisateurCourant() {
  if (el.utilisateurPseudo) {
    const pseudo = utilisateurActuel?.pseudo ?? '';
    el.utilisateurPseudo.textContent = preferences?.alias || pseudo;
    el.utilisateurPseudo.title = preferences?.alias ? `@${pseudo}` : '';
  }
  afficherPresenceCourante();
  if (el.utilisateurRoleBadge) {
    const role = roleActuel();
    const cleRole =
      role === 'admin'
        ? 'channels.roleAdmin'
        : role === 'proprietaire'
          ? 'servers.roleOwner'
          : role === 'moderateur'
            ? 'channels.roleModerator'
            : null;
    el.utilisateurRoleBadge.hidden = !cleRole;
    el.utilisateurRoleBadge.textContent = cleRole ? t(cleRole) : '';
    el.utilisateurRoleBadge.title = cleRole ? t(cleRole) : '';
  }
}

async function changerServeur(serveurId) {
  if (serveurId === serveurActifId) return;
  serveurActifId = serveurId;
  salonActifId = null;
  await actualiser();
}

async function actualiser(options = {}) {
  try {
    etat = await window.electronAPI.obtenirEtatSalons({
      serveurId: serveurActifId,
      salonId: salonActifId,
    });
    etatCharge = true;
    serveurActifId = etat.serveurActif?.id ?? null;
    ecrireStockage(localStorage, CLEF_SERVEUR_ACTIF, serveurActifId);
    if (!etat.salons.some((salon) => salon.id === salonActifId)) {
      salonActifId = etat.salons[0]?.id ?? null;
    }
    afficherTout(options);
  } catch (erreur) {
    console.error('[actualiser] ERREUR:', erreur);
    notifier(messageErreur(erreur), true);
  }
  actualiserBadgeMessagesPrives();
}

function mettreAJourBadgeApplication() {
  if (typeof serviceNotifications?.setBadgeCount !== 'function') return;
  NotifPrefs.appliquerBadge(
    serviceNotifications,
    NotifPrefs.afficheRonds(utilisateurActuelId) ? NotifPrefs.totalNonLus() : 0
  );
}

function actualiserBadgeMessagesPrives() {
  const nonLu =
    NotifPrefs.afficheRonds(utilisateurActuelId) &&
    NotifPrefs.totalNonLus({ type: 'prive' }) > 0;
  document
    .querySelectorAll('#message-prive-btn .notif-dot')
    .forEach((dot) => (dot.hidden = !nonLu));
}

function serveursAvecNonLus() {
  if (!NotifPrefs.afficheRonds(utilisateurActuelId)) return new Map();
  return new Map(
    etat.serveurs.map((serveur) => [
      serveur.id,
      NotifPrefs.totalNonLus({
        type: 'salon',
        conversationIds: serveur.salonIds ?? [],
      }),
    ])
  );
}

function afficherSalons() {
  el.salons.replaceChildren(
    creerEl('li', { classe: 'category', texte: t('channels.categorySalons') })
  );
  const afficherRonds = NotifPrefs.afficheRonds(utilisateurActuelId);

  etat.salons.forEach((salon) => {
    const item = document.createElement('li');
    const bouton = document.createElement('button');
    bouton.className = salon.id === salonActifId ? 'active' : '';
    remplirLabelSalon(bouton, salon);

    const compteur = creerEl('span', {
      classe: 'notif-count notif-count--channel',
    });
    NotifPrefs.remplirCompteur(
      compteur,
      NotifPrefs.nombreNonLus('salon', salon.id),
      afficherRonds
    );
    bouton.appendChild(compteur);

    bouton.addEventListener('click', () => {
      salonActifId = salon.id;
      afficherTout();
    });
    item.appendChild(bouton);
    el.salons.appendChild(item);
  });

  if (el.nomServeur) el.nomServeur.textContent = etat.serveurActif?.nom ?? '';
  if (!etatCharge) return;
  const pastilles = serveursAvecNonLus();
  ChatUiShared.afficherRailServeurs({
    conteneur: el.rail,
    avant: el.creerRail,
    serveurs: etat.serveurs,
    serveurActifId,
    nonLus: pastilles,
    libelleVoirPlus: t('servers.showMoreRail'),
    surChoix: (serveur) => changerServeur(serveur.id),
  });
}

function creerActionsMessage(message, texteEl, peutModifier = true) {
  return ChatUiShared.creerActionsMessage({
    peutModifier,
    message,
    texteEl,
    api: window.electronAPI,
    utilisateurId: () => utilisateurActuelId,
    t,
    notifier,
    messageErreur,
    champMessage: el.message,
    getEtatReseau: () => etatReseau,
  });
}

function afficherMessages(options = {}) {
  const { conserverPositionScroll = false, garderScroll = false } = options;
  const salon = salonActif();
  if (!salon) {
    el.messages.replaceChildren();
    el.nomSalon.textContent = t('channels.noChannelAccessible');
    el.prive.hidden = true;
    el.message.disabled = true;
    if (el.envoyer) el.envoyer.disabled = true;
    el.message.placeholder = t('channels.noChannelAccessible');
    definirConversationActivePourNotifs(null);
    etatHistoriqueSalon = {
      salonId: null,
      messagesAnciens: [],
      finHistorique: false,
      enChargement: false,
    };
    return;
  }

  if (etatHistoriqueSalon.salonId !== salon.id) {
    separateurSalon = {
      salonId: salon.id,
      nonLus: NotifPrefs.nombreNonLus('salon', salon.id),
    };
    void chargerLecturesSalon(salon.id);
    etatHistoriqueSalon = {
      salonId: salon.id,
      messagesAnciens: [],
      finHistorique: Boolean(salon.finHistorique),
      enChargement: false,
    };
  } else if (etatHistoriqueSalon.messagesAnciens.length === 0) {
    etatHistoriqueSalon.finHistorique = Boolean(salon.finHistorique);
  }
  definirConversationActivePourNotifs(salon.id);
  remplirLabelSalon(el.nomSalon, salon);
  el.prive.hidden = salon.visibilite !== 'prive';
  afficherEtatReseau();
  el.message.placeholder = salon.peutEcrire
    ? t('channels.sendMessagePlaceholder', { name: nomSalon(salon) })
    : t('channels.readOnlyPlaceholder');

  const messagesEnAttenteDuSalon = obtenirMessagesEnAttenteSalon(salon.id);
  if (etatHistoriqueSalon.sautEnCours) {
    ChatUiShared.afficherChargementRecherche(el.messages, t);
    return;
  }
  const messagesHistorique = fusionnerHistorique(
    etatHistoriqueSalon.messagesAnciens,
    etatHistoriqueSalon.ancreId && !etatHistoriqueSalon.finRecents
      ? salon.messages.filter((message) =>
          etatHistoriqueSalon.messagesAnciens.some(
            (ancien) => ancien.id === message.id
          )
        )
      : salon.messages,
    'date'
  );
  const tousLesMessages = fusionnerAvecMessagesEnAttente(
    messagesHistorique,
    messagesEnAttenteDuSalon,
    'date'
  );

  const hauteurAvant = el.messages.scrollHeight;
  const scrollAvant = el.messages.scrollTop;

  el.messages.replaceChildren();

  const dernierLivre = tousLesMessages
    .filter((message) => !message.nonLivre)
    .at(-1);

  if (!tousLesMessages.length) {
    el.messages.appendChild(
      creerEl('p', {
        classe: 'empty-state',
        texte: t('channels.noMessages'),
      })
    );
  } else {
    el.messages.appendChild(
      creerStatutHistorique(
        etatHistoriqueSalon,
        chargerMessagesPlusAnciensSalon
      )
    );

    if (etatHistoriqueSalon.ancreId && !etatHistoriqueSalon.finRecents) {
      const bouton = document.createElement('button');
      bouton.className = 'historique-statut historique-statut--bouton';
      bouton.type = 'button';
      bouton.textContent = t('history.loadNewer');
      bouton.disabled = etatHistoriqueSalon.enChargement;
      bouton.addEventListener(
        'click',
        () => void chargerMessagesPlusRecentsSalon()
      );
      el.messages.appendChild(bouton);
    }
    const indexNonLu = LogiqueInterface.indexSeparateur(
      tousLesMessages,
      separateurSalon,
      utilisateurActuelId
    );
    tousLesMessages.forEach((message, index) => {
      if (index === indexNonLu) {
        el.messages.appendChild(ChatUiShared.creerSeparateurNonLus(t));
      }
      const auteur =
        ChatUiShared.nomAffiche(utilisateur(message.auteurId)) ||
        t('channels.system');
      const estMessagePersonnel = message.auteurId === utilisateurActuelId;
      const texteEl = creerEl('p', { classe: 'text' });
      ChatUiShared.remplirTexteMessage(texteEl, contenuMessage(message));
      const classesRow = ['message-row'];
      if (estMessagePersonnel) classesRow.push('own');
      if (message.nonLivre) classesRow.push('non-livre');
      const avatarAuteur = creerEl('div', {
        classe: 'avatar',
        texte: auteur[0].toUpperCase(),
      });
      ChatUiShared.remplirAvatar(
        avatarAuteur,
        estMessagePersonnel
          ? preferences?.avatar
          : utilisateur(message.auteurId)?.avatar
      );
      if (!estMessagePersonnel && utilisateur(message.auteurId)) {
        ChatUiShared.rendreAvatarCliquable(avatarAuteur, {
          utilisateurId: message.auteurId,
          nom: auteur,
          t,
          ouvrir: (id) => ouvrirProfilUtilisateur(utilisateur(id)),
        });
      }
      const article = creerEl('article', {
        classe: classesRow.join(' '),
        enfants: [
          avatarAuteur,
          creerEl('div', {
            classe: 'message-body',
            enfants: [
              creerEl('div', {
                classe: 'message-meta',
                enfants: [
                  creerEl('span', { classe: 'author', texte: auteur }),
                  creerEl('span', {
                    classe: 'timestamp',
                    texte: new Date(message.date).toLocaleTimeString(
                      I18n.obtenirLangue() === 'en' ? 'en-CA' : 'fr-CA',
                      { hour: '2-digit', minute: '2-digit' }
                    ),
                  }),
                  ...(message.modification
                    ? [
                        creerEl('span', {
                          classe: 'edited-label',
                          texte: `(${t('messages.edited')})`,
                        }),
                      ]
                    : []),
                ],
              }),
              texteEl,
            ],
          }),
        ],
      });
      if (message.nonLivre) {
        article
          .querySelector('.message-body')
          ?.appendChild(creerActionsMessageNonLivre(message));
      } else if (
        estMessagePersonnel ||
        ChatUiShared.peutModererServeur(roleActuel())
      ) {
        article
          .querySelector('.message-body')
          ?.appendChild(
            creerActionsMessage(message, texteEl, estMessagePersonnel)
          );
      }
      article.dataset.messageId = message.id;
      if (ChatUiShared.estMessageCible(message.id)) {
        article.classList.add('message-cible');
      }
      if (message === dernierLivre && lecturesSalon.salonId === salon.id) {
        const vuPar = ChatUiShared.texteVuPar(
          LogiqueInterface.lecteursJusqua(
            lecturesSalon.lecteurs,
            message.date,
            [message.auteurId, utilisateurActuelId],
            message.id
          ),
          t
        );
        if (vuPar) texteEl.after(ChatUiShared.creerLigneLecture(vuPar));
      }
      el.messages.appendChild(article);
    });
  }

  if (fenetreEstFocusee && dernierLivre?.id) {
    NotifPrefs.marquerLu(window.electronAPI, 'salon', salon.id, {
      messageId: dernierLivre.id,
      estAffichee: () => fenetreEstFocusee && salonActifId === salon.id,
      surChangement: () => {
        afficherSalons();
        mettreAJourBadgeApplication();
      },
    });
  }

  if (garderScroll) {
    el.messages.scrollTop = scrollAvant;
  } else if (conserverPositionScroll) {
    el.messages.scrollTop =
      el.messages.scrollHeight - hauteurAvant + scrollAvant;
  } else {
    el.messages.scrollTop = el.messages.scrollHeight;
  }
}

const paginationsEnCoursSalon = new Map();

function chargerMessagesPlusAnciensSalon(options = {}) {
  const historique = etatHistoriqueSalon;
  const enCours = paginationsEnCoursSalon.get(historique);
  if (enCours) return enCours;
  const requete = executerPaginationSalon(options).finally(() => {
    if (paginationsEnCoursSalon.get(historique) === requete)
      paginationsEnCoursSalon.delete(historique);
  });
  paginationsEnCoursSalon.set(historique, requete);
  return requete;
}

async function executerPaginationSalon({ taille } = {}) {
  const historique = etatHistoriqueSalon;
  const salon = salonActif();
  if (
    !salon ||
    etatHistoriqueSalon.salonId !== salon.id ||
    etatHistoriqueSalon.enChargement ||
    etatHistoriqueSalon.finHistorique
  ) {
    return false;
  }

  const plusAncienCharge =
    etatHistoriqueSalon.messagesAnciens[0] ?? salon.messages[0];

  etatHistoriqueSalon.enChargement = true;
  afficherMessages({ conserverPositionScroll: true });

  try {
    const resultat = await window.electronAPI.obtenirMessagesSalonAvant({
      salonId: salon.id,
      utilisateurId: utilisateurActuelId,
      avantId: plusAncienCharge?.id,
      ...(taille ? { taille } : {}),
    });
    if (etatHistoriqueSalon !== historique) {
      return false;
    }
    etatHistoriqueSalon.messagesAnciens = fusionnerHistorique(
      etatHistoriqueSalon.messagesAnciens,
      resultat.messages,
      'date'
    );
    etatHistoriqueSalon.finHistorique = resultat.finHistorique;
    return true;
  } catch (erreur) {
    if (etatHistoriqueSalon !== historique) return false;
    notifier(messageErreur(erreur), true);
    return false;
  } finally {
    if (etatHistoriqueSalon === historique) {
      etatHistoriqueSalon.enChargement = false;
      afficherMessages({ conserverPositionScroll: true });
    }
  }
}

el.messages.addEventListener('scroll', () => {
  if (el.messages.scrollTop < 80) {
    chargerMessagesPlusAnciensSalon();
  }
});

function afficherActions() {
  const salon = salonActif();
  const serveur = etat.serveurActif;
  const role = roleActuel();
  el.inviter.hidden =
    !serveur || serveur.parDefaut || !ChatUiShared.peutModererServeur(role);
  el.membres.disabled = !serveur;
  el.compteur.textContent = String(etat.invitations.length);
  el.compteur.hidden = etat.invitations.length === 0;

  if (el.creer) el.creer.hidden = !ChatUiShared.peutModererServeur(role);
  if (el.roomSettings) {
    el.roomSettings.hidden = !salon || !ChatUiShared.peutModererServeur(role);
  }
  if (el.creerRail) el.creerRail.hidden = false;
  if (el.menuServeur) el.menuServeur.disabled = !serveur;
}

function afficherTout(options = {}) {
  appliquerTraductionsStatiques();
  afficherUtilisateurCourant();
  afficherMessages(options);
  afficherSalons();
  afficherActions();
  mettreAJourBadgeApplication();
  actualiserIndicateurSaisie();
}

async function chargerLecturesSalon(salonId) {
  const generation = ++generationLecturesSalon;
  if (lecturesSalon.salonId !== salonId)
    lecturesSalon = { salonId, lecteurs: [] };
  try {
    const { lecteurs } = await window.electronAPI.obtenirLectures({
      type: 'salon',
      conversationId: salonId,
    });
    if (
      generation !== generationLecturesSalon ||
      salonActifId !== salonId ||
      lecturesSalon.salonId !== salonId
    )
      return;
    const fusion = new Map(
      lecturesSalon.lecteurs.map((l) => [l.utilisateurId, l])
    );
    for (const lecteur of lecteurs) {
      const precedent = fusion.get(lecteur.utilisateurId);
      fusion.set(
        lecteur.utilisateurId,
        precedent
          ? LogiqueInterface.fusionnerLecture(precedent, lecteur)
          : lecteur
      );
    }
    lecturesSalon = { salonId, lecteurs: [...fusion.values()] };
    afficherMessages({ garderScroll: true });
  } catch (erreur) {
    console.warn('[lectures] lecteurs du salon indisponibles :', erreur);
  }
}

async function appliquerLecture(lecture) {
  if (lecture?.deMoi) {
    await NotifPrefs.chargerNonLus(window.electronAPI);
    afficherSalons();
    actualiserBadgeMessagesPrives();
    mettreAJourBadgeApplication();
    return;
  }
  if (
    lecture?.type !== 'salon' ||
    lecture.conversationId !== salonActifId ||
    lecturesSalon.salonId !== lecture.conversationId
  ) {
    return;
  }
  const autres = lecturesSalon.lecteurs.filter(
    (lecteur) => lecteur.utilisateurId !== lecture.utilisateurId
  );
  const precedent = lecturesSalon.lecteurs.find(
    (lecteur) => lecteur.utilisateurId === lecture.utilisateurId
  );
  lecturesSalon = {
    salonId: lecture.conversationId,
    lecteurs: [
      {
        utilisateurId: lecture.utilisateurId,
        nom: lecture.nom,
        ...LogiqueInterface.fusionnerLecture(
          precedent ?? { luJusqua: null },
          lecture
        ),
      },
      ...autres,
    ],
  };
  afficherMessages({ garderScroll: true });
}

async function allerAuMessageSalon(messageId) {
  const id = salonActifId;
  if (!id) return;
  const historique = {
    ...etatHistoriqueSalon,
    messagesAnciens: [],
    sautEnCours: true,
  };
  etatHistoriqueSalon = historique;
  ChatUiShared.afficherChargementRecherche(el.messages, t);
  try {
    const resultat = await window.electronAPI.obtenirMessagesSalonAvant({
      salonId: id,
      autourId: messageId,
      taille: 50,
    });
    if (salonActifId !== id || etatHistoriqueSalon !== historique) return;
    if (!resultat?.messages?.some((message) => message.id === messageId)) {
      notifier(t('search.messageNotFound'), true);
      return;
    }
    historique.messagesAnciens = resultat.messages;
    historique.finHistorique = resultat.finHistorique;
    historique.ancreId = messageId;
    try {
      const suite = await window.electronAPI.obtenirMessagesSalonAvant({
        salonId: id,
        apresId: resultat.messages.at(-1).id,
        taille: 50,
      });
      historique.messagesAnciens = fusionnerHistorique(
        historique.messagesAnciens,
        suite.messages,
        'date'
      );
      historique.finRecents = suite.finHistorique;
    } catch {
      historique.finRecents = false;
    }
  } catch (erreur) {
    if (salonActifId !== id || etatHistoriqueSalon !== historique) return;
    notifier(messageErreur(erreur), true);
  } finally {
    if (salonActifId === id && etatHistoriqueSalon === historique) {
      historique.sautEnCours = false;
      await afficherMessages({ conserverPositionScroll: true });
      if (historique.ancreId)
        ChatUiShared.allerAuMessageAffiche(el.messages, messageId);
    }
  }
}
async function chargerMessagesPlusRecentsSalon() {
  const historique = etatHistoriqueSalon;
  const id = salonActifId;
  if (!historique.ancreId || historique.finRecents || historique.enChargement)
    return;
  historique.enChargement = true;
  try {
    const dernier = historique.messagesAnciens.at(-1);
    if (!dernier) return;
    const resultat = await window.electronAPI.obtenirMessagesSalonAvant({
      salonId: id,
      apresId: dernier.id,
      taille: 50,
    });
    if (etatHistoriqueSalon !== historique || salonActifId !== id) return;
    historique.messagesAnciens = fusionnerHistorique(
      historique.messagesAnciens,
      resultat.messages,
      'date'
    );
    historique.finRecents = resultat.finHistorique;
  } catch (erreur) {
    if (etatHistoriqueSalon === historique)
      notifier(messageErreur(erreur), true);
  } finally {
    if (etatHistoriqueSalon === historique) {
      historique.enChargement = false;
      await afficherMessages({ garderScroll: true });
    }
  }
}
