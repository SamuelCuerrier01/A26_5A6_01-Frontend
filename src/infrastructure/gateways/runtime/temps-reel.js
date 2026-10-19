'use strict';

const {
  DELAI_ACK_REJOINDRE_SALON_MS,
  DELAI_RECONNEXION_INITIAL_MS,
  DELAI_REPLI_CONNEXION_PRETE_MS,
  creerDmId,
} = require('./constantes');

module.exports = {
  connecterSocket() {
    this.fermerSocket();
    const socket = this.creerSocket(`${this.baseUrlSocket}/messages`, {
      auth: { token: this.jeton },
      reconnection: false,
      transports: ['websocket'],
    });
    this.socket = socket;

    socket.on('connect', () => {
      if (this.socket !== socket) return;
      this.annulerReconnexionPlanifiee();
      this.delaiReconnexionActuelMs = DELAI_RECONNEXION_INITIAL_MS;
      this.definirEtatConnexion('connecte');
      this.demarrerBattementCoeur();
      if (this.dejaConnecte) this.avatarsARafraichir = true;
      this.dejaConnecte = true;
      clearTimeout(this.minuteurRepliConnexionPrete);
      this.minuteurRepliConnexionPrete = setTimeout(() => {
        if (this.socket === socket && !this.socketPret) marquerPret();
      }, DELAI_REPLI_CONNEXION_PRETE_MS);
    });

    const marquerPret = () => {
      clearTimeout(this.minuteurRepliConnexionPrete);
      this.socketPret = true;
      this.emettre('synchronisation-requise');
      this.annoncerPresence();
      this.cleSuiviPresence = null;
      this.suivrePresence();
      this.roomsSocketRejointes.clear();
      for (const salonId of this.salonsRejoints) {
        this.rejoindreSocketSalon(salonId);
      }
    };
    socket.on('connexion.prete', () => {
      if (this.socket !== socket) return;
      marquerPret();
    });

    socket.on('private-message.created', (m) =>
      this.traiterMessageDmEntrant(m)
    );
    socket.on('private-message.updated', (m) =>
      this.traiterMessageDmModifie(m)
    );
    socket.on('private-message.delivered', (m) =>
      this.traiterMessageDmModifie(m)
    );
    socket.on('private-message.deleted', (m) =>
      this.traiterMessageDmSupprime(m)
    );
    socket.on('room-message.created', (m) =>
      this.traiterMessageSalonEntrant(m)
    );
    socket.on('room-message.updated', (m) =>
      this.traiterMessageSalonModifie(m)
    );
    socket.on('room-message.deleted', (m) =>
      this.traiterMessageSalonSupprime(m)
    );
    socket.on('typing', (evt) => this.traiterSaisieEntrante(evt));
    socket.on('presence.changed', (evt) => this.traiterPresenceEntrante(evt));
    socket.on('profil.changed', (evt) => this.traiterProfilEntrant(evt));
    socket.on('serveur.change', (evt) => this.traiterServeurEntrant(evt));
    socket.on('read-state.updated', (evt) => {
      void this.traiterLectureEntrante(evt);
    });
    socket.on('room-message.revoked', (evt) => {
      if (typeof evt?.roomId === 'string') {
        this.roomsSocketRejointes.delete(evt.roomId);
      }
    });

    socket.on('session.revoquee', () => {
      if (this.socket !== socket) return;
      void this.verifierSessionApres401();
    });

    socket.on('disconnect', () => {
      if (this.socket !== socket) return;
      this.enLigneTempsReel = null;
      this.planifierReconnexion();
    });

    socket.on('connect_error', () => {
      if (this.socket !== socket) return;
      this.planifierReconnexion();
    });
  },

  rejoindreSocketSalon(salonId) {
    const socket = this.socket;
    if (!socket || !this.socketPret || this.roomsSocketRejointes.has(salonId)) {
      return;
    }
    this.roomsSocketRejointes.add(salonId);
    socket
      .timeout(DELAI_ACK_REJOINDRE_SALON_MS)
      .emit('room-message.join', { roomId: salonId }, (erreur, reponse) => {
        if (this.socket !== socket) return;
        if (erreur || reponse?.joined !== true) {
          this.roomsSocketRejointes.delete(salonId);
        }
      });
  },

  traiterMessageDmEntrant(brut) {
    void this.confirmerLivraisonDm(brut);
    const message = this.mapperMessageDm(brut);
    this.indexMessages.set(message.id, { type: 'dm' });
    this.partenairesDmConnus.add(
      this.autreParticipantDm(message.conversationId)
    );
    this.emettre('message-recu', { conversationType: 'dm', message });
  },

  traiterMessageDmModifie(brut) {
    const message = this.mapperMessageDm(brut);
    this.indexMessages.set(message.id, { type: 'dm' });
    this.emettre('message-modifie', message);
  },

  traiterMessageDmSupprime(brut) {
    this.indexMessages.delete(brut.id);
    this.emettre('message-supprime', { messageId: brut.id });
  },

  traiterMessageSalonEntrant(brut) {
    const message = this.mapperMessageSalon(brut);
    this.indexMessages.set(message.id, { type: 'salon', roomId: brut.roomId });
    this.emettre('message-recu', {
      conversationType: 'salon',
      salonId: brut.roomId,
      serveurId: this.salonVersServeur.get(brut.roomId) ?? null,
      message,
    });
  },

  traiterMessageSalonModifie(brut) {
    const message = this.mapperMessageSalon(brut);
    this.indexMessages.set(message.id, { type: 'salon', roomId: brut.roomId });
    this.emettre('message-modifie', message);
  },

  traiterMessageSalonSupprime(brut) {
    this.indexMessages.delete(brut.id);
    this.emettre('message-supprime', { messageId: brut.id });
  },

  traiterSaisieEntrante(evt) {
    if (!evt || !this.utilisateurConnecte) return;
    const conversationId =
      evt.scope === 'dm'
        ? creerDmId(this.utilisateurConnecte.id, evt.userId)
        : evt.targetId;
    const etat = {
      conversationId,
      utilisateurId: evt.userId,
      est_saisie: Boolean(evt.isTyping),
    };
    const index = this.etatsSaisie.findIndex(
      (item) =>
        item.conversationId === etat.conversationId &&
        item.utilisateurId === etat.utilisateurId
    );
    if (index !== -1) this.etatsSaisie[index] = etat;
    else this.etatsSaisie.push(etat);
    this.emettre('saisie', etat);
  },
};
