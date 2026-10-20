'use strict';

const { TAILLE_PAGE_MEMBRES, TAILLE_PAGE_MESSAGES } = require('./constantes');

module.exports = {
  mapperSalon(brut) {
    const reserve = brut.acces === 'moderateurs';
    return {
      type: 'salon',
      id: brut.id,
      serveurId: brut.serveurId,
      nom: brut.nom,
      position: brut.position,
      acces: brut.acces,
      ecriture: brut.ecriture,
      peutEcrire: brut.peutEcrire,
      visibilite: reserve ? 'prive' : 'public',
      creeParId: brut.creePar ?? null,
    };
  },

  mapperMessageSalon(brut) {
    const cree = new Date(brut.createdAt).getTime();
    const modifie = new Date(brut.updatedAt).getTime();
    return {
      id: brut.id,
      auteurId: brut.authorId,
      contenu: brut.content,
      date: cree,
      ...(modifie !== cree ? { modification: modifie } : {}),
    };
  },

  resumeServeur(serveur) {
    return {
      id: serveur.id,
      nom: serveur.nom,
      icone: serveur.icone ?? null,
      public: serveur.public,
      parDefaut: serveur.parDefaut,
      monRole: serveur.monRole,
      nombreMembres: serveur.nombreMembres,
      salonIds: serveur.salons.map((salon) => salon.id),
    };
  },

  async chargerActiviteSalons() {
    try {
      const corps = await this.appelHttp('/api/messages/activity');
      return corps?.rooms ?? {};
    } catch {
      return {};
    }
  },

  async chargerServeurs() {
    const generation = this.generationSession;
    const [bruts, activite] = await Promise.all([
      this.appelHttp('/api/servers'),
      this.chargerActiviteSalons(),
    ]);
    const derniere = (serveur) =>
      serveur.salons.reduce((max, salon) => {
        const date = Date.parse(activite[`room:${salon.id}`] ?? '') || 0;
        return date > max ? date : max;
      }, 0);
    const serveurs = bruts
      .map((serveur) => ({ serveur, date: derniere(serveur) }))
      .sort((a, b) => b.date - a.date)
      .map(({ serveur }) => serveur);
    if (generation !== this.generationSession) {
      throw new Error('ERR_SESSION_FERMEE');
    }
    this.serveurs.clear();
    this.salonVersServeur.clear();
    for (const serveur of serveurs) {
      this.serveurs.set(serveur.id, serveur);
      for (const salon of serveur.salons) {
        this.salonVersServeur.set(salon.id, serveur.id);
      }
    }
    return serveurs;
  },

  async obtenirServeurs() {
    const serveurs = await this.chargerServeurs();
    return serveurs.map((serveur) => this.resumeServeur(serveur));
  },

  async obtenirMessagesSalonAvant({
    salonId,
    avantId,
    autourId,
    apresId,
    taille,
  }) {
    const limite = taille || TAILLE_PAGE_MESSAGES;
    const params = new URLSearchParams({ limit: String(limite) });
    if (avantId) params.set('cursor', avantId);
    if (autourId) params.set('around', autourId);
    if (apresId) {
      params.set('cursor', apresId);
      params.set('direction', 'after');
    }
    const bruts = await this.appelHttp(
      `/api/messages/rooms/${encodeURIComponent(salonId)}/history?${params.toString()}`
    );
    const messages = bruts.map((m) => this.mapperMessageSalon(m));
    messages.forEach((m) =>
      this.indexMessages.set(m.id, { type: 'salon', roomId: salonId })
    );
    await this.resoudrePseudos(messages.map((m) => m.auteurId));
    return { messages, finHistorique: bruts.length < limite };
  },

  async hydraterSalonAvecMessages(salon) {
    try {
      const { messages, finHistorique } = await this.obtenirMessagesSalonAvant({
        salonId: salon.id,
      });
      return { ...salon, messages, finHistorique };
    } catch {
      return { ...salon, messages: [], finHistorique: true };
    }
  },

  async obtenirEtat({ serveurId, salonId } = {}) {
    const [serveurs, invitationsBrutes] = await Promise.all([
      this.chargerServeurs(),
      this.appelHttp('/api/servers/invitations/me'),
    ]);
    const actifId =
      (salonId && this.salonVersServeur.get(salonId)) ||
      (serveurId && this.serveurs.has(serveurId) ? serveurId : null) ||
      (serveurs.find((serveur) => serveur.parDefaut) ?? serveurs[0])?.id;
    const actif = this.serveurs.get(actifId) ?? null;

    for (const serveur of serveurs) {
      for (const salon of serveur.salons) {
        this.assurerAdhesionSocketSeulement(salon.id);
      }
    }

    const salons = actif
      ? await Promise.all(
          actif.salons.map((brut) =>
            this.hydraterSalonAvecMessages(this.mapperSalon(brut))
          )
        )
      : [];

    await this.resoudrePseudos(
      invitationsBrutes.map((invitation) => invitation.invitePar)
    );

    return {
      utilisateurs: this.obtenirUtilisateurs(),
      serveurs: serveurs.map((serveur) => this.resumeServeur(serveur)),
      serveurActif: actif
        ? {
            ...this.resumeServeur(actif),
            proprietaireId: actif.proprietaireId,
            invitations: actif.invitations,
          }
        : null,
      salons,
      invitations: invitationsBrutes.map((invitation) => ({
        id: invitation.serveur.id,
        nom: invitation.serveur.nom,
        public: invitation.serveur.public,
        nombreMembres: invitation.serveur.nombreMembres,
        invitePar: invitation.invitePar,
      })),
    };
  },

  async obtenirMembresServeur({
    serveurId,
    decalage = 0,
    limite = TAILLE_PAGE_MEMBRES,
  } = {}) {
    const params = new URLSearchParams({
      decalage: String(decalage),
      limite: String(limite),
    });
    const page = await this.appelHttp(
      `/api/servers/${encodeURIComponent(serveurId)}/members?${params.toString()}`
    );
    const ids = new Set(page.membres.map((membre) => membre.utilisateurId));
    await this.resoudrePseudos([...ids]);
    return {
      ...page,
      utilisateurs: this.obtenirUtilisateurs().filter((u) => ids.has(u.id)),
    };
  },

  async membresParmi({ serveurId, ids }) {
    const uniques = [...new Set(ids ?? [])].filter(Boolean).slice(0, 100);
    if (uniques.length === 0) return [];
    const page = await this.appelHttp(
      `/api/servers/${encodeURIComponent(serveurId)}/members?ids=${uniques.map(encodeURIComponent).join(',')}`
    );
    return page.membres.map((membre) => membre.utilisateurId);
  },

  assurerAdhesionSocketSeulement(salonId) {
    this.salonsRejoints.add(salonId);
    this.rejoindreSocketSalon(salonId);
  },

  async creerServeur({ nom, public: estPublic }) {
    return this.appelHttp('/api/servers', {
      methode: 'POST',
      corps: { nom, public: Boolean(estPublic) },
    });
  },

  async modifierServeur({ serveurId, nom, public: estPublic, icone }) {
    const corps = {};
    if (nom !== undefined) corps.nom = nom;
    if (estPublic !== undefined) corps.public = estPublic;
    if (icone !== undefined) corps.icone = icone ?? '';
    return this.appelHttp(`/api/servers/${encodeURIComponent(serveurId)}`, {
      methode: 'PATCH',
      corps,
    });
  },

  async supprimerServeur(serveurId) {
    await this.appelHttp(`/api/servers/${encodeURIComponent(serveurId)}`, {
      methode: 'DELETE',
    });
    return { serveurId };
  },

  async rejoindreServeur(serveurId) {
    return this.appelHttp(
      `/api/servers/${encodeURIComponent(serveurId)}/join`,
      { methode: 'POST' }
    );
  },

  async quitterServeur(serveurId) {
    await this.appelHttp(
      `/api/servers/${encodeURIComponent(serveurId)}/leave`,
      { methode: 'POST' }
    );
    return { serveurId };
  },

  async decouvrirServeurs(texte, decalage = 0) {
    const q = String(texte ?? '')
      .trim()
      .slice(0, 80);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (decalage > 0) params.set('decalage', String(decalage));
    const requete = params.toString();
    return this.appelHttp(
      `/api/servers/decouvrir${requete ? `?${requete}` : ''}`
    );
  },

  async expulserMembre({ serveurId, utilisateurId, nouveauProprietaire }) {
    const suite = nouveauProprietaire
      ? `?nouveauProprietaire=${encodeURIComponent(nouveauProprietaire)}`
      : '';
    return this.appelHttp(
      `/api/servers/${encodeURIComponent(serveurId)}/members/${encodeURIComponent(utilisateurId)}${suite}`,
      { methode: 'DELETE' }
    );
  },

  async changerRoleMembre({ serveurId, utilisateurId, role }) {
    return this.appelHttp(
      `/api/servers/${encodeURIComponent(serveurId)}/members/${encodeURIComponent(utilisateurId)}`,
      { methode: 'PATCH', corps: { role } }
    );
  },

  async inviter({ serveurId, utilisateurId }) {
    return this.appelHttp(
      `/api/servers/${encodeURIComponent(serveurId)}/invitations`,
      { methode: 'POST', corps: { utilisateurId } }
    );
  },

  async accepterInvitation({ serveurId }) {
    return this.appelHttp(
      `/api/servers/${encodeURIComponent(serveurId)}/invitations/accept`,
      { methode: 'POST' }
    );
  },

  async refuserInvitation({ serveurId }) {
    await this.appelHttp(
      `/api/servers/${encodeURIComponent(serveurId)}/invitations/refuse`,
      { methode: 'POST' }
    );
    return { serveurId };
  },

  async creerSalon({ serveurId, nom, acces, ecriture }) {
    const brut = await this.appelHttp(
      `/api/servers/${encodeURIComponent(serveurId)}/channels`,
      { methode: 'POST', corps: { nom, acces, ecriture } }
    );
    this.salonVersServeur.set(brut.id, serveurId);
    this.assurerAdhesionSocketSeulement(brut.id);
    return this.mapperSalon(brut);
  },

  async modifierSalon({ salonId, nom, acces, ecriture }) {
    const corps = {};
    if (nom !== undefined) corps.nom = nom;
    if (acces !== undefined) corps.acces = acces;
    if (ecriture !== undefined) corps.ecriture = ecriture;
    const brut = await this.appelHttp(
      `/api/channels/${encodeURIComponent(salonId)}`,
      { methode: 'PATCH', corps }
    );
    return this.mapperSalon(brut);
  },

  async supprimerSalon(salonId) {
    await this.appelHttp(`/api/channels/${encodeURIComponent(salonId)}`, {
      methode: 'DELETE',
    });
    this.salonsRejoints.delete(salonId);
    this.roomsSocketRejointes.delete(salonId);
    this.salonVersServeur.delete(salonId);
    return { salonId };
  },
};
