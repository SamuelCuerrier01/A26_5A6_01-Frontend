const { net, powerMonitor } = require('electron');
const { chatGateway } = require('./gateway');

const URL_SONDE_CONNECTIVITE =
  process.env.CHATVARDAGE_CONNECTIVITY_URL ??
  'https://www.gstatic.com/generate_204';
const INTERVALLE_SONDE_RESEAU_MS = 3000;
const DELAI_SONDE_RESEAU_MS = 3000;
const ECHECS_AVANT_HORS_LIGNE = 2;

async function reseauJoignable() {
  if (!net.isOnline()) return false;
  if (!URL_SONDE_CONNECTIVITE) return true;
  try {
    const reponse = await net.fetch(URL_SONDE_CONNECTIVITE, {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(DELAI_SONDE_RESEAU_MS),
    });
    return reponse.status < 500;
  } catch {
    return false;
  }
}

function surveillerReseauSysteme() {
  let dernierEtat = true;
  let echecsConsecutifs = 0;

  const sonder = async () => {
    const joignable = await reseauJoignable();
    echecsConsecutifs = joignable ? 0 : echecsConsecutifs + 1;
    const enLigne =
      joignable ||
      (net.isOnline() && echecsConsecutifs < ECHECS_AVANT_HORS_LIGNE);
    if (enLigne !== dernierEtat) {
      dernierEtat = enLigne;
      console.log(`[reseau] système ${enLigne ? 'en ligne' : 'hors ligne'}`);
      chatGateway.signalerReseauSysteme(enLigne);
    }
    setTimeout(sonder, INTERVALLE_SONDE_RESEAU_MS);
  };
  void sonder();

  powerMonitor.on('resume', () => chatGateway.signalerReveil());
}

module.exports = { surveillerReseauSysteme };
