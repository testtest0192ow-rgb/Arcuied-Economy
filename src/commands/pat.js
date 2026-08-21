const { createSocialActionCommand } = require('../utils/socialAction');
module.exports = createSocialActionCommand({
  name: 'pat',
  description: 'Погладить по голове',
  category: 'pat',
  message: (a, b) => `${a} гладит по голове ${b}. 🫳`,
});
