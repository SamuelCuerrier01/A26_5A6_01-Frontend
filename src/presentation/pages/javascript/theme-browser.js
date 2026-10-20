'use strict';

(function (global) {
  let themeActuel = 'sombre';

  const THEMES = ['sombre', 'clair'];
  const CLEF_CACHE = 'chatvardage:theme';

  function appliquerTheme(theme) {
    if (!THEMES.includes(theme)) return;
    themeActuel = theme;
    global.document.documentElement.dataset.theme = theme;
    try {
      global.localStorage.setItem(CLEF_CACHE, theme);
    } catch {}
  }

  global.document.documentElement.classList.add('i18n-en-attente');
  global.setTimeout(
    () => global.document.documentElement.classList.remove('i18n-en-attente'),
    1500
  );

  global.document.documentElement.classList.add('page-en-chargement');
  function pagePrete() {
    global.document.documentElement.classList.remove('page-en-chargement');
  }
  global.setTimeout(pagePrete, 2000);

  try {
    const themeCache = global.localStorage.getItem(CLEF_CACHE);
    if (THEMES.includes(themeCache)) appliquerTheme(themeCache);
  } catch {}

  function obtenirTheme() {
    return themeActuel;
  }

  async function initialiserDepuisElectronAPI(electronAPI) {
    try {
      const theme = await electronAPI.obtenirTheme();
      appliquerTheme(theme);
    } catch {
      appliquerTheme(themeActuel);
    }
    return themeActuel;
  }

  global.ThemeManager = Object.freeze({
    appliquerTheme,
    obtenirTheme,
    initialiserDepuisElectronAPI,
    pagePrete,
  });
})(window);
