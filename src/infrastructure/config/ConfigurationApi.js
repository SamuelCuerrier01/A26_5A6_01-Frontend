'use strict';

const URL_API_HTTP_PAR_DEFAUT = 'http://localhost:3000';
const URL_SOCKET_PAR_DEFAUT = 'http://localhost:3000';

function obtenirConfiguration() {
  const baseUrlHttp = verifierOrigine(
    process.env.CHATVARDAGE_API_URL || URL_API_HTTP_PAR_DEFAUT
  );
  return {
    baseUrlHttp,
    baseUrlSocket: verifierOrigine(
      process.env.CHATVARDAGE_SOCKET_URL || baseUrlHttp
    ),
  };
}

function verifierOrigine(valeur) {
  const url = new URL(valeur);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Le serveur doit être une origine HTTP(S) sans identifiants.'
    );
  }
  const locale = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.protocol !== 'https:' &&
    !locale &&
    process.env.NODE_ENV !== 'development'
  ) {
    throw new Error('HTTPS est requis pour un serveur distant.');
  }
  return url.origin;
}

module.exports = {
  URL_API_HTTP_PAR_DEFAUT,
  URL_SOCKET_PAR_DEFAUT,
  obtenirConfiguration,
  verifierOrigine,
};
