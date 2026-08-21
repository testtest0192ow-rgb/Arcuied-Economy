const { createSocialActionCommand } = require('../utils/socialAction');
module.exports = createSocialActionCommand({
  name: 'slap',
  description: 'Дать пощёчину',
  category: 'slap',
  message: (a, b) => `${a} отвешивает пощёчину ${b}! 👋`,
});
