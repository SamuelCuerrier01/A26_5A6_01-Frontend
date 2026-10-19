'use strict';

const {
  DUREE_PRIORITE_HORS_LIGNE_MS,
  MEMBRES_SUGGERES_PAR_SERVEUR,
  NOMBRE_MAX_IDS_LOOKUP,
  NOMBRE_MAX_IDS_PUBLICS,
} = require('./constantes');

module.exports = {
  enregistrerUtilisateurConnu(utilisateur) {
    if (!utilisateur || !utilisateur.id) return;
    if (!this.utilisateursConnus.has(utilisateur.id)) {
      this.planifierSuiviPresence();
    }
    const existant = this.utilisateursConnus.get(utilisateur.id) ?? {};
    this.utilisateursConnus.set(utilisateur.id, {
      id: utilisateur.id,
      pseudo: utilisateur.pseudo ?? existant.pseudo ?? utilisateur.id,
      role: utilisateur.role ?? existant.role,
    });
  },

  obtenirUtilisateurs() {
    return [...this.utilisateursConnus.values()].map((item) => ({
      ...item,
      alias: this.profilsPublics.get(item.id)?.alias ?? null,
      avatar: this.profilsPublics.get(item.id)?.avatar ?? null,
    }));
  },

  async resoudrePseudos(ids) {
    const uniques = [...new Set(ids)].filter(Boolean);
    const inconnus = uniques.filter((id) => !this.utilisateursConnus.has(id));
    const sansProfil = uniques.filter(
      (id) =>
        id !== this.utilisateurConnecte?.id && !this.profilsPublics.has(id)
    );
    await Promise.all([
      inconnus.length ? this.resoudrePseudosInconnus(inconnus) : null,
      sansProfil.length ? this.chargerProfilsPublics(sansProfil) : null,
    ]);
  },

  async resoudrePseudosInconnus(inconnus) {
    const lots = [];
    for (let i = 0; i < inconnus.length; i += NOMBRE_MAX_IDS_LOOKUP) {
      lots.push(inconnus.slice(i, i + NOMBRE_MAX_IDS_LOOKUP));
    }
    await Promise.all(
      lots.map(async (lot) => {
        try {
          const resultats = await this.appelHttp(
            `/api/users/lookup?ids=${lot.map(encodeURIComponent).join(',')}`
          );
          for (const item of resultats ?? []) {
            this.enregistrerUtilisateurConnu(item);
          }
        } catch {}
      })
    );
  },

  async chargerProfilsPublics(ids, { inclureAvatar = true } = {}) {
    const cibles = [...new Set(ids)].filter(
      (id) => id && id !== this.utilisateurConnecte?.id
    );
    const profilsModifies = [];
    for (let i = 0; i < cibles.length; i += NOMBRE_MAX_IDS_PUBLICS) {
      const lot = cibles.slice(i, i + NOMBRE_MAX_IDS_PUBLICS);
      let resultats;
      try {
        resultats = await this.appelHttp(
          `/api/config-utilisateur/publiques?ids=${lot.map(encodeURIComponent).join(',')}` +
            (inclureAvatar ? '' : '&inclureAvatar=false')
        );
      } catch {
        continue;
      }
      const parId = new Map((resultats ?? []).map((p) => [p.idUtilisateur, p]));
      for (const id of lot) {
        const profil = parId.get(id);
        const precedent = this.profilsPublics.get(id);
        const suivant = {
          alias: profil?.alias ?? null,
          avatar: inclureAvatar
            ? (profil?.avatar ?? null)
            : (precedent?.avatar ?? null),
        };
        if (
          precedent &&
          (precedent.alias !== suivant.alias ||
            precedent.avatar !== suivant.avatar)
        ) {
          profilsModifies.push(id);
        }
        this.profilsPublics.set(id, suivant);
        const horsLigneRecent =
          Date.now() - (this.horsLigneTempsReel.get(id) ?? 0) <
          DUREE_PRIORITE_HORS_LIGNE_MS;
        const confirmeEnLigne = this.enLigneTempsReel
          ? this.enLigneTempsReel.has(id)
          : !horsLigneRecent;
        const statut =
          profil?.actif && confirmeEnLigne ? 'en-ligne' : 'hors-ligne';
        if (this.presences[id] !== statut) {
          this.definirPresenceInterne({ utilisateurId: id, statut });
        }
      }
    }
    if (profilsModifies.length)
      this.emettre('profils-publics', profilsModifies);
  },

  decrireUtilisateurs(ids) {
    const moi = this.utilisateurConnecte?.id;
    return [...new Set(ids)]
      .filter((id) => id !== moi && this.utilisateursConnus.has(id))
      .map((id) => ({
        id,
        pseudo: this.utilisateursConnus.get(id).pseudo,
        alias: this.profilsPublics.get(id)?.alias ?? null,
        avatar: this.profilsPublics.get(id)?.avatar ?? null,
        present: this.presences[id] === 'en-ligne',
      }))
      .sort((a, b) =>
        (a.alias || a.pseudo).localeCompare(b.alias || b.pseudo, undefined, {
          sensitivity: 'base',
        })
      );
  },

  async obtenirSuggestionsDm() {
    const ids = new Set(this.partenairesDmConnus);
    try {
      const serveurs = await this.chargerServeurs();
      const pages = await Promise.all(
        serveurs.map((serveur) =>
          this.appelHttp(
            `/api/servers/${encodeURIComponent(serveur.id)}/members?limite=${MEMBRES_SUGGERES_PAR_SERVEUR}`
          ).catch(() => null)
        )
      );
      for (const page of pages) {
        for (const membre of page?.membres ?? []) ids.add(membre.utilisateurId);
      }
    } catch {}
    await this.resoudrePseudos([...ids]);
    return this.decrireUtilisateurs([...ids]);
  },

  async rechercherUtilisateurs(texte) {
    const q = String(texte ?? '')
      .trim()
      .slice(0, 20);
    if (!q) return [];
    const resultats = await this.appelHttp(
      `/api/users/search?q=${encodeURIComponent(q)}&limit=20`
    );
    for (const item of resultats ?? []) this.enregistrerUtilisateurConnu(item);
    const ids = (resultats ?? []).map((item) => item.id);
    await this.resoudrePseudos(ids);
    return this.decrireUtilisateurs(ids);
  },

  memoriserProfilSoi(config) {
    if (!this.utilisateurConnecte) return;
    this.profilsPublics.set(this.utilisateurConnecte.id, {
      alias: config.alias ?? null,
      avatar: config.avatar ?? null,
    });
  },
};
