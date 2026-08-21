const { createSocialActionCommand } = require('../utils/socialAction');
module.exports = createSocialActionCommand({
  name: 'cuddle',
  description: 'Прижаться к пользователю',
  category: 'cuddle',
  message: (a, b) => `${a} прижимается к ${b}. 🥰`,
});
