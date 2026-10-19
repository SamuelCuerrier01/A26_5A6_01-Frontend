const {
  RealGatewayRuntime,
} = require('../infrastructure/gateways/RealGatewayRuntime.js');
const {
  obtenirConfiguration,
} = require('../infrastructure/config/ConfigurationApi.js');

const configurationApi = obtenirConfiguration();
const chatGateway = new RealGatewayRuntime(configurationApi);
console.log(`[ChatVardage] Gateway actif : ${configurationApi.baseUrlHttp}`);

module.exports = { chatGateway, configurationApi };
