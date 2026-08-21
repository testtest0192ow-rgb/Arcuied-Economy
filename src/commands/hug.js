const { createSocialActionCommand } = require('../utils/socialAction');
module.exports = createSocialActionCommand({
  name: 'hug',
  description: 'Обнять пользователя',
  category: 'hug',
  message: (a, b) => `${a} обнимает ${b}. 🤗`,
  selfMessage: '{user} обнимает сам себя... ну ладно.',
});
