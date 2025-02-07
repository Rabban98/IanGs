require('dotenv').config(); // Läser in miljövariabler från .env-filen
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Skapa en Express-app för att hantera webhook och andra routes
const app = express();

// Sökväg till JSON-filen
const DATA_FILE = path.join(__dirname, 'data.json');

// Läs in data från JSON-filen
function loadUserData() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    const parsedData = JSON.parse(data);

    // Se till att activeTasks finns och är en array
    if (!parsedData.activeTasks || !Array.isArray(parsedData.activeTasks)) {
      parsedData.activeTasks = [];
    }

    return parsedData;
  } catch (error) {
    console.error('Kunde inte läsa datafilen:', error);
    return { users: {}, activeTasks: [] }; // Returnera en tom objektstruktur om filen inte finns
  }
}

// Sparar data tillbaka till JSON-filen
function saveUserData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(userData, null, 2), 'utf8');
    console.log('Data har sparats.');
  } catch (error) {
    console.error('Kunde inte spara datafilen:', error);
  }
}

// Ladda data när boten startar
let userData = loadUserData();

// Lägg till en ny användare
function addUser(discordId) {
  if (!userData.users[discordId]) {
    userData.users[discordId] = {
      instagramUsername: null,
      gCoins: 0,
      interactionHistory: [],
    };
    saveUserData(); // Sparar ändringarna
  }
}

// Hämta G-coins balans
function getGCoins(discordId) {
  return userData.users[discordId]?.gCoins || 0;
}

// Uppdatera G-coins
function updateGCoins(discordId, coinsToAdd) {
  if (!userData.users[discordId]) return;
  userData.users[discordId].gCoins += coinsToAdd;
  saveUserData(); // Sparar ändringarna
}

// Logga en interaktion
function logInteraction(discordId, postId, platform, actions) {
  if (!userData.users[discordId]) return;
  userData.users[discordId].interactionHistory.push({
    postId,
    platform,
    actions,
    timestamp: new Date().toISOString(),
  });
  saveUserData(); // Sparar ändringarna
}

// Skapa Discord-klienten
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', async () => {
  console.log('Bot is online!');
});

// Kommando för att starta processen
client.on('messageCreate', async (message) => {
  if (message.content === '/boot' && message.member.permissions.has('Administrator')) {
    const embed = new EmbedBuilder()
      .setTitle('Välkommen till G-Coin Bot!')
      .setDescription('Tryck på knappen nedan för att börja.')
      .setImage('https://i.imgur.com/eyvdfEw.png') // Logga-länk här
      .setColor('#FFD700'); // Gul färg för embed

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('link_account')
        .setLabel('Länka')
        .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
  }

  if (message.content.startsWith('/länka')) {
    const args = message.content.split(' ');
    const profileUrl = args[1];

    if (!profileUrl) {
      return message.reply('Ange din Instagram-länk. Exempel: `/länka https://www.instagram.com/dittanvandarnamn`');
    }

    const usernameMatch = profileUrl.match(/instagram\.com\/([\w._-]+)/);
    if (!usernameMatch || !usernameMatch[1]) {
      return message.reply('Ogiltig Instagram-URL. Se till att URL:en innehåller ett giltigt användarnamn.');
    }

    const username = usernameMatch[1];
    const discordId = message.author.id;

    addUser(discordId); // Se till att användaren finns i systemet
    userData.users[discordId].instagramUsername = username;
    saveUserData();

    await message.reply(`Ditt Instagram-konto (${username}) har länkats!`);

    // Aktivera knapparna i Discord
    const channel = message.channel;
    const lastMessage = await channel.messages.fetch({ limit: 1 }).then((messages) => messages.first());

    if (lastMessage && lastMessage.embeds.length > 0) {
      const updatedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('balance')
          .setLabel('Balance')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('market')
          .setLabel('Market')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('raffle')
          .setLabel('Raffle')
          .setStyle(ButtonStyle.Secondary)
      );

      await lastMessage.edit({
        embeds: [new EmbedBuilder().setTitle('Välkommen till G-Coin Bot!').setDescription('Tryck på knapparna nedan för att börja.').setImage('https://i.imgur.com/eyvdfEw.png').setColor('#FFD700')],
        components: [updatedRow],
      });
    }
  }
});

// Hantera knapptryckningar
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;

  switch (interaction.customId) {
    case 'link_account': {
      await interaction.reply({ content: 'Kolla dina privata meddelanden!', ephemeral: true });

      const dmChannel = await interaction.user.createDM();
      await dmChannel.send('Länka ditt Instagram-konto med `/länka https://www.instagram.com/dittanvandarnamn`.');

      break;
    }

    case 'balance': {
      const user = userData.users[userId];
      if (!user) {
        await interaction.reply({ content: 'Du måste länka ditt Instagram-konto först.', ephemeral: true });
        return;
      }
      await interaction.reply({ content: `Din G-coins balans är: ${user.gCoins}`, ephemeral: true });
      break;
    }

    case 'market': {
      await interaction.reply({ content: 'Marknad funktionen är inte implementerad än.', ephemeral: true });
      break;
    }

    case 'raffle': {
      await interaction.reply({ content: 'Lotteri funktionen är inte implementerad än.', ephemeral: true });
      break;
    }

    default:
      break;
  }
});

// Logga in på Discord-boten
if (!process.env.DISCORD_BOT_TOKEN) {
  console.error('FEL: DISCORD_BOT_TOKEN saknas. Boten kan inte logga in på Discord.');
  process.exit(1); // Avsluta programmet om Discord-token saknas
}

// Logga in på boten
client.login(process.env.DISCORD_BOT_TOKEN).catch((error) => {
  console.error('FEL: Kunde inte logga in på Discord:', error.message);
  process.exit(1); // Avsluta programmet om inloggningen misslyckas
});

