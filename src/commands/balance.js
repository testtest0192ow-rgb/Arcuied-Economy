const { SlashCommandBuilder } = require('discord.js');
const { transactionService } = require('../services/TransactionService');
const { container, money, V2 } = require('../ui/CommandUI');
const { fail } = require('../utils/commandGuard');
const { appEmoji } = require('../utils/appEmoji');
module.exports = { data: new SlashCommandBuilder().setName('balance').setDescription('Показать баланс'), async execute(i) { try { const w = await transactionService.getOrCreateWallet(i.guildId, i.user.id); const body = `${appEmoji('coin')}**Монеты**  ${money(w.coins)}\n${appEmoji('donate')}**Донат**  ${money(w.donateCoins)}\n\n-# Баланс хранится отдельно для каждого сервера.`; await i.reply({ components:[container('Баланс', body,{eyebrow:'ARCUEID · ECONOMY'})], flags:V2 }); } catch(e){ i.client.logger?.error?.('[/balance]',e); await fail(i,'Баланс временно недоступен.'); } } };
