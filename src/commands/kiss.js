const { createSocialActionCommand } = require('../utils/socialAction');
module.exports = createSocialActionCommand({
  name: 'kiss',
  description: 'Поцеловать пользователя',
  category: 'kiss',
  message: (a, b) => `${a} нежно целует ${b}. 💋`,
});
