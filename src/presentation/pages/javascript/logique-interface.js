'use strict';
(function (racine) {
  function fusionnerHistorique(messagesAnciens, messagesRecents, champDate) {
    const parId = new Map();
    [...messagesAnciens, ...messagesRecents].forEach((message) => {
      parId.set(message.id, message);
    });
    return Array.from(parId.values()).sort(
      (a, b) => a[champDate] - b[champDate]
    );
  }

  function fusionnerAvecMessagesEnAttente(
    messagesTries,
    messagesEnAttente,
    champDate
  ) {
    if (!messagesEnAttente.length) return messagesTries;
    const brouillonsTries = [...messagesEnAttente].sort(
      (a, b) => a[champDate] - b[champDate]
    );
    const resultat = [];
    let i = 0;
    let j = 0;
    while (i < messagesTries.length && j < brouillonsTries.length) {
      if (messagesTries[i][champDate] <= brouillonsTries[j][champDate]) {
        resultat.push(messagesTries[i++]);
      } else {
        resultat.push(brouillonsTries[j++]);
      }
    }
    while (i < messagesTries.length) resultat.push(messagesTries[i++]);
    while (j < brouillonsTries.length) resultat.push(brouillonsTries[j++]);
    return resultat;
  }

  function contientMessage(messages, messageId) {
    return (messages ?? []).some((message) => message.id === messageId);
  }

  function ajouterMessage(messages, message, champDate) {
    const liste = messages ?? [];
    if (contientMessage(liste, message.id)) return liste;
    return [...liste, message].sort((a, b) => a[champDate] - b[champDate]);
  }

  function remplacerMessage(messages, message) {
    return (messages ?? []).map((existant) =>
      existant.id === message.id ? { ...existant, ...message } : existant
    );
  }

  function retirerMessage(messages, messageId) {
    return (messages ?? []).filter((message) => message.id !== messageId);
  }

  const SEUIL_PRES_DU_BAS_PX = 80;

  function estPresDuBas(liste, seuil = SEUIL_PRES_DU_BAS_PX) {
    if (!liste) return true;
    return liste.scrollHeight - liste.scrollTop - liste.clientHeight <= seuil;
  }

  function doitSuivreNouveauMessage({
    dansConversationAffichee,
    estAuteur,
    presDuBas,
  }) {
    return Boolean(dansConversationAffichee && (estAuteur || presDuBas));
  }

  function trierConversations(conversations) {
    const date = (conversation) =>
      conversation.lastMessage?.envoi ?? conversation.messages?.[0]?.envoi ?? 0;
    return [...conversations].sort((a, b) => date(b) - date(a));
  }

  const SALONS_PAR_DEFAUT = {
    '00000000-0000-4000-8000-000000000002': {
      nomOriginal: 'annonces',
      cle: 'channels.defaultAnnouncements',
    },
    '00000000-0000-4000-8000-000000000003': {
      nomOriginal: 'général',
      cle: 'channels.defaultGeneral',
    },
  };
  const MESSAGE_BIENVENUE_ID = '00000000-0000-4000-8000-000000000101';

  function cleNomSalon(salon) {
    const parDefaut = SALONS_PAR_DEFAUT[salon.id];
    return parDefaut && salon.nom === parDefaut.nomOriginal
      ? parDefaut.cle
      : null;
  }

  function cleContenuMessage(message) {
    return message.id === MESSAGE_BIENVENUE_ID && !message.modification
      ? 'channels.welcomeMessage'
      : null;
  }

  const LONGUEUR_MIN_RECHERCHE = 2;
  const LONGUEUR_MAX_RECHERCHE = 100;

  function peutRechercher(texte) {
    const longueur = String(texte ?? '').trim().length;
    return (
      longueur >= LONGUEUR_MIN_RECHERCHE && longueur <= LONGUEUR_MAX_RECHERCHE
    );
  }

  function extraitAutour(texte, terme, rayon = 60) {
    const source = String(texte ?? '');
    if (source.length <= rayon * 2) return source;
    const position = source
      .toLocaleLowerCase()
      .indexOf(String(terme ?? '').toLocaleLowerCase());
    const debut = Math.max(0, (position < 0 ? 0 : position) - rayon);
    const fin = Math.min(
      source.length,
      debut + rayon * 2 + String(terme ?? '').length
    );
    return `${debut > 0 ? '…' : ''}${source.slice(debut, fin)}${fin < source.length ? '…' : ''}`;
  }

  function decouperSurligne(texte, terme) {
    const source = String(texte ?? '');
    const cherche = String(terme ?? '').toLocaleLowerCase();
    if (!cherche) return source ? [{ texte: source, surligne: false }] : [];
    const minuscule = source.toLocaleLowerCase();
    const segments = [];
    let depuis = 0;
    let position = minuscule.indexOf(cherche);
    while (position >= 0) {
      if (position > depuis) {
        segments.push({
          texte: source.slice(depuis, position),
          surligne: false,
        });
      }
      segments.push({
        texte: source.slice(position, position + cherche.length),
        surligne: true,
      });
      depuis = position + cherche.length;
      position = minuscule.indexOf(cherche, depuis);
    }
    if (depuis < source.length) {
      segments.push({ texte: source.slice(depuis), surligne: false });
    }
    return segments;
  }

  function indexPremierNonLu(messages, nonLus, moiId) {
    if (!(nonLus > 0)) return -1;
    let restants = nonLus;
    let index = -1;
    for (let i = messages.length - 1; i >= 0 && restants > 0; i -= 1) {
      if (messages[i].auteurId !== moiId && !messages[i].nonLivre) {
        index = i;
        restants -= 1;
      }
    }
    return index;
  }

  function statutLecture(dateMessage, luJusqua, messageId, dernierMessageLuId) {
    const lu =
      luJusqua != null &&
      (luJusqua > dateMessage ||
        (luJusqua === dateMessage &&
          (dernierMessageLuId == null || messageId <= dernierMessageLuId)));
    return lu ? 'lu' : 'distribue';
  }

  function fusionnerLecture(precedente, entrante) {
    if (entrante.luJusqua == null) return precedente;
    if (precedente.luJusqua == null || entrante.luJusqua > precedente.luJusqua)
      return entrante;
    if (entrante.luJusqua < precedente.luJusqua) return precedente;
    if (precedente.dernierMessageLuId == null) return precedente;
    if (
      entrante.dernierMessageLuId == null ||
      entrante.dernierMessageLuId > precedente.dernierMessageLuId
    )
      return entrante;
    return precedente;
  }

  function indexSeparateur(messages, separateur, moiId) {
    if (!Object.prototype.hasOwnProperty.call(separateur, 'premierId')) {
      const index = indexPremierNonLu(messages, separateur.nonLus, moiId);
      separateur.premierId = messages[index]?.id ?? null;
    }
    return messages.findIndex((message) => message.id === separateur.premierId);
  }

  function lecteursJusqua(lecteurs, dateMessage, exclus = [], messageId) {
    return (lecteurs ?? [])
      .filter(
        (lecteur) =>
          statutLecture(
            dateMessage,
            lecteur.luJusqua,
            messageId,
            lecteur.dernierMessageLuId
          ) === 'lu' && !exclus.includes(lecteur.utilisateurId)
      )
      .map((lecteur) => lecteur.nom)
      .filter(Boolean);
  }

  function resumeNoms(noms, max = 3) {
    return { noms: noms.slice(0, max), autres: Math.max(0, noms.length - max) };
  }

  function ficheProfil(utilisateur, contexte = {}) {
    const pseudo = utilisateur?.pseudo || '';
    const alias = utilisateur?.alias || '';
    const nom = alias || pseudo;
    const id = utilisateur?.id;
    return {
      nom,
      alias,
      pseudo,
      identifiant: pseudo ? `@${pseudo}` : '',
      initiale: nom.charAt(0).toUpperCase(),
      messagePrive:
        Boolean(id) &&
        id !== contexte.utilisateurActuelId &&
        id !== contexte.conversationAvecId,
    };
  }

  racine.LogiqueInterface = Object.freeze({
    fusionnerHistorique,
    fusionnerAvecMessagesEnAttente,
    contientMessage,
    ajouterMessage,
    remplacerMessage,
    retirerMessage,
    SEUIL_PRES_DU_BAS_PX,
    estPresDuBas,
    doitSuivreNouveauMessage,
    trierConversations,
    SALONS_PAR_DEFAUT,
    MESSAGE_BIENVENUE_ID,
    cleNomSalon,
    cleContenuMessage,
    LONGUEUR_MIN_RECHERCHE,
    LONGUEUR_MAX_RECHERCHE,
    peutRechercher,
    extraitAutour,
    decouperSurligne,
    indexPremierNonLu,
    indexSeparateur,
    fusionnerLecture,
    statutLecture,
    lecteursJusqua,
    resumeNoms,
    ficheProfil,
  });
})(globalThis);
