const { createSocialActionCommand } = require('../utils/socialAction');
module.exports = createSocialActionCommand({
  name: 'poke',
  description: 'Ткнуть пользователя',
  category: 'poke',
  message: (a, b) => `${a} тыкает ${b}. 👉`,
  selfMessage: '{user} тычет сам себя.',
});
