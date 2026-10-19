const { app, Menu } = require('electron');
const { t } = require('../i18n/i18n.js');
const { etat, isDev } = require('./contexte');

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.getName(),
            submenu: [
              { role: 'quit', label: t(etat.langueActuelle, 'menu.quit') },
            ],
          },
        ]
      : []),
    {
      label: t(etat.langueActuelle, 'menu.file'),
      submenu: [
        process.platform === 'darwin'
          ? { role: 'close', label: t(etat.langueActuelle, 'menu.close') }
          : { role: 'quit', label: t(etat.langueActuelle, 'menu.quit') },
      ],
    },
    {
      label: t(etat.langueActuelle, 'menu.edit'),
      submenu: [
        { role: 'copy', label: t(etat.langueActuelle, 'menu.copy') },
        { role: 'paste', label: t(etat.langueActuelle, 'menu.paste') },
        { role: 'selectAll', label: t(etat.langueActuelle, 'menu.selectAll') },
      ],
    },
    ...(isDev
      ? [
          {
            label: t(etat.langueActuelle, 'menu.development'),
            submenu: [
              {
                role: 'toggleDevTools',
                label: t(etat.langueActuelle, 'menu.toggleDevTools'),
              },
              { role: 'reload', label: t(etat.langueActuelle, 'menu.reload') },
            ],
          },
        ]
      : []),
  ];
  return Menu.buildFromTemplate(template);
}

module.exports = { buildMenu };
