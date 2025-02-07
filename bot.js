require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = 'Iangxfinans';

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

// Webhook Verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook Verified.');
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Verification failed');
  }
});

// Webhook Event Listener
app.post('/webhook', (req, res) => {
  console.log('Webhook event received:', JSON.stringify(req.body, null, 2));
  res.status(200).send('EVENT_RECEIVED');
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

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages], partials: ['CHANNEL', 'MESSAGE', 'USER'] });

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
    setTimeout(() => reply.delete().catch(() => {}), 120000);
  }

  if (interaction.customId === 'market') {
    if (userData.marketItems.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('Marknaden är tom')
        .setDescription('Just nu finns det inga varor på marknaden.')
        .setColor('#808080');
      
      const reply = await interaction.reply({ embeds: [embed], flags: 64 });
      setTimeout(() => reply.delete().catch(() => {}), 120000);
    } else {
      let items = userData.marketItems.map(item => `**${item.name}** - ${item.price} G-Coins`).join('\n');
      const embed = new EmbedBuilder()
        .setTitle('Marknad')
        .setDescription(items)
        .setColor('#00FF00');
      await interaction.reply({ embeds: [embed], flags: 64 });
    }
  }

  if (interaction.customId === 'raffle') {
    if (userData.raffles.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('Ingen aktiv Raffle')
        .setDescription('Det finns inga aktiva raffles just nu.')
        .setColor('#FF0000');
      
      const reply = await interaction.reply({ embeds: [embed], flags: 64 });
      setTimeout(() => reply.delete().catch(() => {}), 120000);
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);