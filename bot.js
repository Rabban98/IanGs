require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const DATA_FILE = path.join(__dirname, 'data.json');

function loadUserData() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    const parsedData = JSON.parse(data);
    if (!parsedData.activeTasks) parsedData.activeTasks = [];
    return parsedData;
  } catch {
    return { users: {}, activeTasks: [] };
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

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', () => console.log('Bot is online!'));

client.on('messageCreate', async (message) => {
  if (message.content === '/boot') {
    const embed = new EmbedBuilder()
      .setTitle('Välkommen till G-Coin Bot!')
      .setDescription('Tryck på knappen nedan för att länka ditt Instagram-konto.')
      .setImage('https://i.imgur.com/eyvdfEw.png')
      .setColor('#FFD700');
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('link_account').setLabel('Länka').setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const userId = interaction.user.id;

  if (interaction.customId === 'link_account') {
    await interaction.reply({ content: 'Kolla dina privata meddelanden!', ephemeral: true });
    const dmChannel = await interaction.user.createDM();
    await dmChannel.send('Ange din Instagram-länk med `/länka <din-instagram-url>`.');
  }

  if (interaction.customId === 'balance' || interaction.customId === 'market' || interaction.customId === 'raffle') {
    if (!userData.users[userId]?.instagramUsername) {
      return await interaction.reply({ content: 'Du måste länka ditt Instagram-konto först.', ephemeral: true });
    }
    await interaction.reply({ content: `Funktion: ${interaction.customId} är på väg!`, ephemeral: true });
  }
});

client.on('messageCreate', async (message) => {
  if (message.content.startsWith('/länka')) {
    const args = message.content.split(' ');
    if (args.length < 2) return message.reply('Ange din Instagram-länk.');
    
    const usernameMatch = args[1].match(/instagram\.com\/([\w._-]+)/);
    if (!usernameMatch) return message.reply('Ogiltig Instagram-URL.');
    
    addUser(message.author.id);
    userData.users[message.author.id].instagramUsername = usernameMatch[1];
    saveUserData();
    
    await message.reply(`Ditt Instagram-konto (${usernameMatch[1]}) har länkats!`);
    
    const embed = new EmbedBuilder()
      .setTitle('Välkommen till G-Coin Bot!')
      .setDescription('Nya funktioner har låsts upp!')
      .setImage('https://i.imgur.com/eyvdfEw.png')
      .setColor('#FFD700');
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('balance').setLabel('Wallet').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('market').setLabel('Marknad').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('raffle').setLabel('Raffle').setStyle(ButtonStyle.Secondary)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
