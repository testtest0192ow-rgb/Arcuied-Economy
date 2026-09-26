const { SlashCommandBuilder } = require('discord.js');
const { transactionService } = require('../services/TransactionService');
const { container, money, V2, COLORS } = require('../ui/CommandUI');
const { fail } = require('../utils/commandGuard');
module.exports={data:new SlashCommandBuilder().setName('timely').setDescription('Получить периодическую награду'),async execute(i){try{const r=await transactionService.claimTimely({guildId:i.guildId,userId:i.user.id,cooldownHours:24});await i.reply({components:[container('Награда получена',`+ **${money(r.reward)}** монет\nСерия: **${r.streak}**\nБаланс: **${money(r.wallet.coins)}**`,{color:COLORS.success,eyebrow:'ARCUEID · REWARDS'})],flags:V2});}catch(e){await fail(i,e.nextAvailableAt?`Следующая награда будет доступна ${e.nextAvailableAt}.`:'Награда пока недоступна.');}}};
