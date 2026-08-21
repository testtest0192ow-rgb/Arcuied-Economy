const { createSocialActionCommand } = require('../utils/socialAction');
module.exports = createSocialActionCommand({
  name: 'highfive',
  description: 'Дать пять',
  category: 'highfive',
  message: (a, b) => `${a} даёт пять ${b}! ✋`,
});
