require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const DATA_FILE = path.join(__dirname, 'data.json');

function loadUserData() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    const parsedData = JSON.parse(data);
    parsedData.activeTasks ??= [];
    parsedData.raffles ??= [];
    parsedData.marketItems ??= [];
    return parsedData;
  } catch {
    return { users: {}, activeTasks: [], raffles: [], marketItems: [] };
  }
}

function saveUserData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(userData, null, 2), 'utf8');
}

let userData = loadUserData();

function addUser(discordId) {
  if (!userData.users[discordId]) {
    userData.users[discordId] = { instagramUsername: null, gCoins: 0 };
    saveUserData();
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages], partials: ['CHANNEL'] });

client.once('ready', () => console.log('Bot is online!'));

client.on('messageCreate', async (message) => {
  if (message.content === '/boot') {
    const embed = new EmbedBuilder()
      .setTitle('Välkommen till G-Coin Bot!')
      .setDescription('Tryck på knappen nedan för att länka ditt Instagram-konto.')
      .setImage('https://i.imgur.com/YOUR_NEW_IMAGE.png')
      .setColor('#FFD700');
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('link_account').setLabel('Länka').setStyle(ButtonStyle.Primary)
    );
    
    const sentMessage = await message.channel.send({ embeds: [embed], components: [row] });
    userData.bootMessageId = sentMessage.id;
    userData.bootChannelId = message.channel.id;
    saveUserData();
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const userId = interaction.user.id;

  if (interaction.customId === 'link_account') {
    await interaction.deferUpdate();
    const dmChannel = await interaction.user.createDM();
    await dmChannel.send('Ange din Instagram-länk med `/länka <din-instagram-url>`.');
  }

  if (interaction.customId === 'wallet') {
    const balance = userData.users[userId]?.gCoins || 0;
    const embed = new EmbedBuilder()
      .setTitle('Din G-Coin Wallet')
      .setDescription(`Du har **${balance}** G-Coins!`)
      .setColor('#FFD700');
    
    const reply = await interaction.reply({ embeds: [embed], flags: 64 });
    setTimeout(() => reply.delete().catch(() => {}), 120000);
  }

  if (interaction.customId.startsWith('buy_')) {
    const itemName = interaction.customId.replace('buy_', '');
    const item = userData.marketItems.find(i => i.name === itemName);
    if (!item) return interaction.reply({ content: 'Varan finns inte längre!', flags: 64 });
    if (userData.users[userId].gCoins < item.price) {
      return interaction.reply({ content: 'Du har inte tillräckligt med G-Coins!', flags: 64 });
    }
    userData.users[userId].gCoins -= item.price;
    saveUserData();

    const owner = await client.users.fetch(interaction.guild.ownerId);
    await owner.send(`🔔 **${interaction.user.username}** har köpt **${itemName}** för **${item.price} G-Coins**!`);

    await interaction.reply({ content: `Du har köpt **${itemName}**!`, flags: 64 });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 120000);
  }
});

client.on('messageCreate', async (message) => {
  if (!message.guild) return;
  const ownerId = message.guild.ownerId;

  if (message.content.startsWith('/add marknad')) {
    if (message.author.id !== ownerId) return message.reply('Endast serverägaren kan lägga till varor.');
    const args = message.content.split(' ');
    if (args.length < 4) return message.reply('Använd `/add marknad <namn> <pris>`.');
    
    const itemName = args[2];
    const itemPrice = parseInt(args[3]);
    if (isNaN(itemPrice) || itemPrice <= 0) return message.reply('Priset måste vara ett positivt tal.');
    
    userData.marketItems.push({ name: itemName, price: itemPrice });
    saveUserData();
    
    message.reply(`**${itemName}** har lagts till i marknaden för **${itemPrice} G-Coins**!`);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
