const { createSocialActionCommand } = require('../utils/socialAction');
module.exports = createSocialActionCommand({
  name: 'tickle',
  description: 'Пощекотать пользователя',
  category: 'tickle',
  message: (a, b) => `${a} щекочет ${b}! 😆`,
});
