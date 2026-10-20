ChatUiShared.afficherRailDepuisCache({
  conteneur: el.rail,
  avant: el.creerRail,
  serveurActifId,
  nonLus: new Set(),
  surChoix: (serveur) => changerServeur(serveur.id),
});
initialiser();
if (window.Inactivite?.initialiserPageInactivite) {
  void window.Inactivite.initialiserPageInactivite();
}
