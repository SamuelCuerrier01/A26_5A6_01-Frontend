# Chatvardage — Client desktop

Application Electron de clavardage connectée aux services HTTP et temps réel de Chatvardage. Connexion, serveurs/salons, DM, profils, thème, langue et notifications passent par une instance de `RealGatewayRuntime`, accessible aux vues par IPC.

## Démarrer

1. Suivre le [démarrage complet dans Infra](https://github.com/Chatvardage/A26_5A6_01-Infra/blob/main/README.md) puis y lancer `./scripts/healthcheck.sh`.
2. Installer Node.js 22 et npm sur le poste desktop (le backend tourne entièrement dans Docker).
3. Dans ce dépôt :

```bash
npm ci
npm start
```

Développement : `npm run dev`. Le démarrage normal construit la connexion React automatiquement.
Gateway par défaut : `http://localhost:3000`. Variables facultatives : `CHATVARDAGE_API_URL`, `CHATVARDAGE_SOCKET_URL`, `CHATVARDAGE_PROFIL` (session isolée par profil).

Deux comptes en parallèle, dans deux terminaux Bash/WSL :

```bash
npm start
CHATVARDAGE_PROFIL=2 node scripts/start.js
```

PowerShell, deuxième terminal :

```powershell
$env:CHATVARDAGE_PROFIL='2'
node scripts/start.js
```

## Vérifier et construire

```bash
npm audit --audit-level=high
npm run lint
npm run format:check
npx tsc --noEmit
npm run test:coverage
npm run build
```

Installateurs : `npm run build:win`, `npm run build:mac`, `npm run build:linux` sur leur OS respectif. Les workflows construisent sur les trois OS lors d’un tag `v*`; le tag doit correspondre à `package.json` et au lockfile.

## Documentation

L’[architecture du frontend](https://github.com/Chatvardage/A26_5A6_01-Infra/blob/main/docs/architecture-frontend.md), le [guide détaillé](https://github.com/Chatvardage/A26_5A6_01-Infra/blob/main/docs/services/Frontend.md), le [contrat réseau](https://github.com/Chatvardage/A26_5A6_01-Infra/blob/main/docs/api/frontend.md) et la [validation fonctionnelle](https://github.com/Chatvardage/A26_5A6_01-Infra/blob/main/docs/validation.md) sont centralisés dans Infra. Voir [AGENTS.md](AGENTS.md) pour contribuer et le [guide des revues GitHub](https://github.com/Chatvardage/A26_5A6_01-Infra/blob/c5fc686f262127f7985684d8df3739b549255eea/docs/revues-github.md) pour configurer leur authentification.

Le CI vérifie la cohérence entre la version déclarée, le fichier de verrouillage npm et les tags de publication.

## Sécurité et limites

- Une origine distante exige HTTPS hors développement. `CHATVARDAGE_API_URL` et `CHATVARDAGE_SOCKET_URL` doivent être des origines HTTP(S), sans identifiants, chemin, paramètres ni fragment ; sans URL Socket séparée, le client utilise l'origine de l'API.
- Les jetons d’accès et de renouvellement ne sont persistés que chiffrés par `safeStorage` ; le backend Linux `basic_text` est refusé. Sans coffre sécurisé, la session reste en mémoire et l'ancien fichier est supprimé.
- L’accès de 15 minutes est renouvelé automatiquement avec rotation du jeton de renouvellement, partagé entre les requêtes concurrentes. Une rotation explicite attend d’abord tout renouvellement en cours, puis peut renouveler son accès au premier 401 ; les requêtes de fond ne déclenchent pas de renouvellement pendant cette rotation. La déconnexion efface immédiatement les jetons locaux et demande la révocation auprès d’Auth en arrière-plan, sans retarder le retour à la connexion. Les réponses HTTP et événements d’un ancien compte sont ignorés.
- « Déconnecter les autres appareils » vérifie que la réponse contient un nouveau jeton avant de remplacer la session.
- La synchronisation des non-lus, des lectures et de la pagination est décrite dans l'[architecture du frontend](https://github.com/Chatvardage/A26_5A6_01-Infra/blob/main/docs/architecture-frontend.md#flux-importants).
- `npm audit` garde huit alertes modérées de `sprintf-js`, tirées par `electron-builder` (`global-agent`, `roarr`) ; ne pas forcer de rétrogradation du packager. Rapport d'audit : [Infra](https://github.com/Chatvardage/A26_5A6_01-Infra/blob/develop/docs/audit-securite-2026-10-09.md).
