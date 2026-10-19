'use strict';

const {
  TAILLE_PAGE_MESSAGES,
  TAILLE_PAGE_RECHERCHE,
  creerDmId,
} = require('./constantes');

module.exports = {

  async envoyerMessage({ salonId, contenu }) {
    this.verifierReseauConnecte();
    const brut = await this.appelHttp(
      `/api/messages/rooms/${encodeURIComponent(salonId)}`,
      { methode: 'POST', corps: { content: contenu } }
    );
    const message = this.mapperMessageSalon(brut);
    this.indexMessages.set(message.id, { type: 'salon', roomId: salonId });
    return message;
  },

  async confirmerLivraisonDm(brut) {
    if (!brut.id || brut.recipientId !== this.utilisateurConnecte?.id || brut.deliveredAt)
      return;
    try {
      await this.appelHttp(
        `/api/messages/${encodeURIComponent(brut.id)}/delivered`,
        { methode: 'PUT' }
      );
    } catch {
    }
  },

  mapperMessageDm(brut) {
    const cree = new Date(brut.createdAt).getTime();
    const modifie = new Date(brut.updatedAt).getTime();
    return {
      id: brut.id,
      conversationId: creerDmId(brut.senderId, brut.recipientId),
      auteurId: brut.senderId,
      contenu: brut.content,
      envoi: cree,
      ...(brut.deliveredAt
        ? { livraison: new Date(brut.deliveredAt).getTime() }
        : {}),
      ...(modifie !== cree ? { modification: modifie } : {}),
    };
  },

  autreParticipantDm(conversationId) {
    const [a, b] = String(conversationId).split(':');
    const moi = this.utilisateurConnecte?.id;
    return a === moi ? b : a;
  },

  async obtenirMessagesPriveesAvantParUtilisateur(
    autreUtilisateurId,
    { avantId, autourId, apresId, taille } = {}
  ) {
    const limite = taille || TAILLE_PAGE_MESSAGES;
    const params = new URLSearchParams({ limit: String(limite) });
    if (avantId) params.set('cursor', avantId);
    if (autourId) params.set('around', autourId);
    if (apresId) {
      params.set('cursor', apresId);
      params.set('direction', 'after');
    }
    const bruts = await this.appelHttp(
      `/api/messages/history/${encodeURIComponent(autreUtilisateurId)}?${params.toString()}`
    );
    for (const brut of bruts) void this.confirmerLivraisonDm(brut);
    const messages = bruts.map((m) => this.mapperMessageDm(m));
    messages.forEach((m) => this.indexMessages.set(m.id, { type: 'dm' }));
    return { messages, finHistorique: bruts.length < limite };
  },

  async obtenirMessagesPriveesAvant({
    conversationId,
    avantId,
    autourId,
    apresId,
    taille,
  }) {
    return this.obtenirMessagesPriveesAvantParUtilisateur(
      this.autreParticipantDm(conversationId),
      { avantId, autourId, apresId, taille }
    );
  },

  async construireConversationPrivee(autreUtilisateurId, dernierMessageConnu) {
    const { messages, finHistorique } =
      await this.obtenirMessagesPriveesAvantParUtilisateur(
        autreUtilisateurId
      ).catch(() => ({ messages: [], finHistorique: false }));
    await this.resoudrePseudos([autreUtilisateurId]);
    const autre = this.utilisateursConnus.get(autreUtilisateurId);
    const dernier =
      messages[messages.length - 1] ??
      (dernierMessageConnu ? this.mapperMessageDm(dernierMessageConnu) : null);
    return {
      id: creerDmId(this.utilisateurConnecte.id, autreUtilisateurId),
      participantIds: [this.utilisateurConnecte.id, autreUtilisateurId],
      otherUser: {
        id: autreUtilisateurId,
        pseudo: autre?.pseudo ?? autreUtilisateurId,
        pseudoInconnu: !autre,
        present: this.presences[autreUtilisateurId] === 'en-ligne',
        alias: this.profilsPublics.get(autreUtilisateurId)?.alias ?? null,
        avatar: this.profilsPublics.get(autreUtilisateurId)?.avatar ?? null,
      },
      messages,
      finHistorique,
      lastMessage: dernier,
    };
  },

  async obtenirConversationsPrivees() {
    const resume = await this.appelHttp('/api/messages/conversations');
    const partenaireIds = new Map();
    for (const item of resume) {
      partenaireIds.set(item.otherUserId, item.lastMessage);
      this.partenairesDmConnus.add(item.otherUserId);
    }
    for (const id of this.partenairesDmConnus) {
      if (!partenaireIds.has(id)) partenaireIds.set(id, null);
    }
    const conversations = await Promise.all(
      [...partenaireIds.entries()].map(([id, dernier]) =>
        this.construireConversationPrivee(id, dernier)
      )
    );
    return conversations.sort(
      (a, b) => (b.lastMessage?.envoi ?? 0) - (a.lastMessage?.envoi ?? 0)
    );
  },

  async demarrerConversationPrivee({ autreUtilisateurId }) {
    this.partenairesDmConnus.add(autreUtilisateurId);
    return this.construireConversationPrivee(autreUtilisateurId);
  },

  async envoyerMessagePrive({ conversationId, contenu }) {
    this.verifierReseauConnecte();
    const autreUtilisateurId = this.autreParticipantDm(conversationId);
    const brut = await this.appelHttp('/api/messages', {
      methode: 'POST',
      corps: { recipientId: autreUtilisateurId, content: contenu },
    });
    const message = this.mapperMessageDm(brut);
    this.indexMessages.set(message.id, { type: 'dm' });
    this.partenairesDmConnus.add(autreUtilisateurId);
    return message;
  },

  async modifierMessage({ messageId, contenu }) {
    this.verifierReseauConnecte();
    const info = this.indexMessages.get(messageId);
    if (!info) throw new Error('ERR_MESSAGE_INTROUVABLE');
    if (info.type === 'salon') {
      const brut = await this.appelHttp(
        `/api/messages/rooms/${encodeURIComponent(info.roomId)}/${encodeURIComponent(messageId)}`,
        { methode: 'PATCH', corps: { content: contenu } }
      );
      return this.mapperMessageSalon(brut);
    }
    const brut = await this.appelHttp(
      `/api/messages/${encodeURIComponent(messageId)}`,
      { methode: 'PATCH', corps: { content: contenu } }
    );
    return this.mapperMessageDm(brut);
  },

  async supprimerMessage({ messageId }) {
    this.verifierReseauConnecte();
    const info = this.indexMessages.get(messageId);
    if (!info) throw new Error('ERR_MESSAGE_INTROUVABLE');
    if (info.type === 'salon') {
      await this.appelHttp(
        `/api/messages/rooms/${encodeURIComponent(info.roomId)}/${encodeURIComponent(messageId)}`,
        { methode: 'DELETE' }
      );
    } else {
      await this.appelHttp(`/api/messages/${encodeURIComponent(messageId)}`, {
        methode: 'DELETE',
      });
    }
    this.indexMessages.delete(messageId);
    return { messageId };
  },

  versConversationLocale(idServeur) {
    const [genre, cible] = String(idServeur).split(':');
    if (!cible) return null;
    if (genre === 'room') return { type: 'salon', conversationId: cible };
    if (genre === 'dm') {
      return {
        type: 'prive',
        conversationId: creerDmId(this.utilisateurConnecte.id, cible),
      };
    }
    return null;
  },

  async obtenirNonLus() {
    const nonLus = { salons: {}, prives: {} };
    if (!this.utilisateurConnecte) return nonLus;
    const { counts } = (await this.appelHttp('/api/messages/unread')) ?? {};
    for (const [idServeur, nombre] of Object.entries(counts ?? {})) {
      const locale = this.versConversationLocale(idServeur);
      if (!locale || !(nombre > 0)) continue;
      const cible = locale.type === 'salon' ? nonLus.salons : nonLus.prives;
      cible[locale.conversationId] = nombre;
    }
    return nonLus;
  },

  async marquerConversationLue({ type, conversationId, messageId }) {
    if (!messageId) throw new Error('ERR_MESSAGE_INTROUVABLE');
    const chemin =
      type === 'salon'
        ? `/api/messages/rooms/${encodeURIComponent(conversationId)}/read`
        : `/api/messages/conversations/${encodeURIComponent(this.autreParticipantDm(conversationId))}/read`;
    const etat = await this.appelHttp(chemin, {
      methode: 'PUT',
      corps: { messageId },
    });
    return { nonLus: etat?.unreadCount ?? 0 };
  },

  async rechercherMessages({ texte, curseur, type, conversationId }) {
    const params = new URLSearchParams({
      q: texte,
      limit: String(TAILLE_PAGE_RECHERCHE),
      conversationId:
        type === 'salon'
          ? `room:${conversationId}`
          : `dm:${this.autreParticipantDm(conversationId)}`,
    });
    if (curseur) params.set('cursor', curseur);
    const page = await this.appelHttp(
      `/api/messages/search?${params.toString()}`
    );
    const moi = this.utilisateurConnecte?.id;
    const bruts = page?.results ?? [];
    await this.resoudrePseudos(
      bruts
        .map(({ message }) => message.authorId ?? message.senderId)
        .filter((id) => id && id !== moi)
    );
    const nom = (id) =>
      this.profilsPublics.get(id)?.alias ??
      this.utilisateursConnus.get(id)?.pseudo ??
      (id === moi ? this.utilisateurConnecte.pseudo : null);
    const resultats = bruts.map(({ kind, message }) => {
      const mappe =
        kind === 'room'
          ? this.mapperMessageSalon(message)
          : this.mapperMessageDm(message);
      this.indexMessages.set(
        mappe.id,
        kind === 'room'
          ? { type: 'salon', roomId: message.roomId }
          : { type: 'dm' }
      );
      return {
        type: kind === 'room' ? 'salon' : 'prive',
        conversationId: kind === 'room' ? message.roomId : mappe.conversationId,
        auteurNom: nom(mappe.auteurId),
        message: mappe,
      };
    });
    return { resultats, curseurSuivant: page?.nextCursor ?? null };
  },

  nomLecteur(id) {
    return (
      this.profilsPublics.get(id)?.alias ??
      this.utilisateursConnus.get(id)?.pseudo ??
      null
    );
  },

  async obtenirLectures({ type, conversationId }) {
    const bruts =
      type === 'salon'
        ? ((
            await this.appelHttp(
              `/api/messages/rooms/${encodeURIComponent(conversationId)}/read-states`
            )
          )?.lecteurs ?? [])
        : [
            await this.appelHttp(
              `/api/messages/conversations/${encodeURIComponent(this.autreParticipantDm(conversationId))}/read-state`
            ),
          ].filter(Boolean);
    await this.resoudrePseudos(bruts.map((brut) => brut.userId));
    return {
      lecteurs: bruts.map((brut) => ({
        utilisateurId: brut.userId,
        nom: this.nomLecteur(brut.userId),
        luJusqua: brut.lastReadAt ? new Date(brut.lastReadAt).getTime() : null,
        dernierMessageLuId: brut.lastReadMessageId ?? null,
      })),
    };
  },

  async traiterLectureEntrante(evt) {
    const moi = this.utilisateurConnecte?.id;
    if (
      !moi ||
      typeof evt?.userId !== 'string' ||
      typeof evt.targetId !== 'string' ||
      typeof evt.lastReadAt !== 'string'
    ) {
      return;
    }
    const luJusqua = Date.parse(evt.lastReadAt);
    if (!Number.isFinite(luJusqua)) return;
    const deMoi = evt.userId === moi;
    let lecture;
    if (evt.kind === 'room') {
      lecture = { type: 'salon', conversationId: evt.targetId };
    } else if (evt.kind === 'dm' && (deMoi || evt.targetId === moi)) {
      lecture = {
        type: 'prive',
        conversationId: creerDmId(moi, deMoi ? evt.targetId : evt.userId),
      };
    } else {
      return;
    }
    if (!deMoi) await this.resoudrePseudos([evt.userId]);
    this.emettre('lecture', {
      ...lecture,
      utilisateurId: evt.userId,
      nom: this.nomLecteur(evt.userId),
      luJusqua,
      dernierMessageLuId: evt.lastReadMessageId ?? null,
      deMoi,
    });
  },
};
