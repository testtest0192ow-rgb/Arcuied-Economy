const { MessageFlags } = require('discord.js');
const { container, COLORS, V2_EPHEMERAL } = require('../ui/CommandUI');

async function fail(interaction, text, color = COLORS.danger) {
  const payload = { components: [container('Не удалось выполнить действие', text, { color, eyebrow: 'ARCUEID · SYSTEM' })], flags: V2_EPHEMERAL };
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.reply(payload);
}

function amountOption(o, name = 'amount', description = 'Количество') {
  return o.setName(name).setDescription(description).setMinValue(1).setMaxValue(1_000_000_000).setRequired(true);
}
module.exports = { fail, amountOption };
