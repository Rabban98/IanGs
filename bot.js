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
    if (!parsedData.raffles) parsedData.raffles = [];
    if (!parsedData.marketItems) parsedData.marketItems = [];
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

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const userId = interaction.user.id;

  if (interaction.customId === 'wallet') {
    const balance = userData.users[userId]?.gCoins || 0;
    const embed = new EmbedBuilder()
      .setTitle('Din G-Coin Wallet')
      .setDescription(`Du har **${balance}** G-Coins!`)
      .setColor('#FFD700');
    
    const reply = await interaction.reply({ embeds: [embed], flags: 64 });
    setTimeout(() => reply.delete().catch(() => {}), 180000);
  }

  if (interaction.customId === 'market') {
    if (userData.marketItems.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('Marknaden är tom')
        .setDescription('Just nu finns det inga varor på marknaden.')
        .setColor('#808080');
      
      const reply = await interaction.reply({ embeds: [embed], flags: 64 });
      setTimeout(() => reply.delete().catch(() => {}), 180000);
    } else {
      let items = userData.marketItems.map(item => `**${item.name}** - ${item.price} G-Coins`).join('\n');
      const embed = new EmbedBuilder()
        .setTitle('Marknad')
        .setDescription(items)
        .setColor('#00FF00');
      await interaction.reply({ embeds: [embed], flags: 64 });
    }
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

  if (message.content.startsWith('/tabort marknad')) {
    if (message.author.id !== ownerId) return message.reply('Endast serverägaren kan ta bort varor.');
    const args = message.content.split(' ');
    if (args.length < 3) return message.reply('Använd `/tabort marknad <namn>`.');
    
    const itemName = args[2];
    const index = userData.marketItems.findIndex(item => item.name === itemName);
    if (index === -1) return message.reply('Varan hittades inte i marknaden.');
    
    userData.marketItems.splice(index, 1);
    saveUserData();
    
    message.reply(`**${itemName}** har tagits bort från marknaden!`);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
