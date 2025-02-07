require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const express = require('express');
const axios = require('axios');
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
    if (!parsedData.activeTasks) parsedData.activeTasks = [];
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
    
    const reply = await interaction.reply({ embeds: [embed], ephemeral: true });
    setTimeout(() => reply.delete().catch(() => {}), 180000);
  }

  if (interaction.customId === 'raffle') {
    if (userData.raffles.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('Inga aktiva Raffles')
        .setDescription('Det finns inga aktiva raffles just nu.')
        .setColor('#FF0000');
      
      const reply = await interaction.reply({ embeds: [embed], ephemeral: true });
      setTimeout(() => reply.delete().catch(() => {}), 180000);
    }
  }

  if (interaction.customId === 'market') {
    if (userData.marketItems.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('Marknaden är tom')
        .setDescription('Just nu finns det inga varor på marknaden.')
        .setColor('#808080');
      
      const reply = await interaction.reply({ embeds: [embed], ephemeral: true });
      setTimeout(() => reply.delete().catch(() => {}), 180000);
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.channel.isDMBased() && message.content.startsWith('/länka')) {
    const args = message.content.split(' ');
    if (args.length < 2) return message.reply('Ange din Instagram-länk.');
    
    const usernameMatch = args[1].match(/instagram\.com\/([\w._-]+)/);
    if (!usernameMatch) return message.reply('Ogiltig Instagram-URL.');
    
    addUser(message.author.id);
    userData.users[message.author.id].instagramUsername = usernameMatch[1];
    saveUserData();
    
    await message.reply(`Ditt Instagram-konto (${usernameMatch[1]}) har länkats!`);
    
    if (!userData.bootMessageId || !userData.bootChannelId) return;
    try {
      const channel = await client.channels.fetch(userData.bootChannelId);
      const bootMessage = await channel.messages.fetch(userData.bootMessageId);
    
      const embed = new EmbedBuilder()
        .setTitle('Välkommen till G-Coin Bot!')
        .setDescription('Nya funktioner har låsts upp!')
        .setImage('https://i.imgur.com/YOUR_NEW_IMAGE.png')
        .setColor('#FFD700');
    
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('wallet').setLabel('Wallet').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('market').setLabel('Marknad').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('raffle').setLabel('Raffle').setStyle(ButtonStyle.Secondary)
      );
    
      await bootMessage.edit({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('Fel vid uppdatering av boot-meddelandet:', error);
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);

