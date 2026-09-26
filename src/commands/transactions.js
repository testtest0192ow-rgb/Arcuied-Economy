const { SlashCommandBuilder } = require('discord.js');
const { transactionService } = require('../services/TransactionService');
const { container, money, unix, V2, V2_EPHEMERAL } = require('../ui/CommandUI');
const { fail } = require('../utils/commandGuard');
const LABELS={give_sent:'Перевод',give_received:'Получение',timely:'Timely',shop_buy:'Покупка',shop_sell:'Продажа',gift_sent:'Подарок',gift_received:'Подарок',admin_add:'Начисление',admin_remove:'Списание'};
module.exports={data:new SlashCommandBuilder().setName('transactions').setDescription('История операций'),async execute(i){try{const rows=await transactionService.getTransactionHistory(i.guildId,i.user.id,15);const body=rows.length?rows.map(x=>`${x.amount>=0?'+':''}${money(x.amount)} · **${LABELS[x.type]||x.type}** · ${unix(x.createdAt)}`).join('\n'):'Операций пока нет.';await i.reply({components:[container('История операций',body,{eyebrow:'ARCUEID · ECONOMY'})],flags:V2_EPHEMERAL});}catch(e){await fail(i,'Историю операций получить не удалось.');}}};
