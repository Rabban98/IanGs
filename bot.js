require('dotenv').config(); // Läser in miljövariabler från .env-filen
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

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
      tiktokUsername: null,
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

// Instagram API-inställningar
const INSTAGRAM_API_BASE_URL = 'https://graph.instagram.com';
const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID; // Lägg till i .env
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET; // Lägg till i .env
let instagramAccessToken = null;

// Hämta Instagram Access Token
async function getInstagramAccessToken() {
  try {
    const response = await axios.post('https://api.instagram.com/oauth/access_token', null, {
      params: {
        client_id: INSTAGRAM_APP_ID,
        client_secret: INSTAGRAM_APP_SECRET,
        grant_type: 'client_credentials',
      },
    });

    instagramAccessToken = response.data.access_token;
    console.log('Instagram Access Token har hämtats.');
  } catch (error) {
    console.error('Kunde inte hämta Instagram Access Token:', error.response?.data || error.message);
    throw error;
  }
}

// Skapa Discord-klienten
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', async () => {
  console.log('Bot is online!');
  try {
    await getInstagramAccessToken(); // Hämta Instagram Access Token när boten startar

    // Starta en timer för att regelbundet kontrollera interaktioner
    setInterval(checkAndRewardInteractions, 5 * 60 * 1000); // Var 5:e minut
  } catch (error) {
    console.error('Kunde inte starta boten:', error);
  }
});

// Kommando för att visa G-coins-balans
client.on('messageCreate', async (message) => {
  if (message.content === '/min-balans') {
    const discordId = message.author.id;
    const gCoins = getGCoins(discordId);

    message.reply(`Din G-coins balans är: ${gCoins}`);
  }

  if (message.content.startsWith('/länka')) {
    const args = message.content.split(' ');
    const platform = args[1]; // Plattform: instagram
    const profileUrl = args[2];

    if (!platform || !profileUrl) {
      return message.reply('Ange plattform och profil-URL. Exempel: `/länka instagram https://www.instagram.com/min_instagram_profil`');
    }

    let username;
    if (platform === 'instagram') {
      const usernameMatch = profileUrl.match(/instagram\.com\/([\w._-]+)/);
      if (!usernameMatch || !usernameMatch[1]) {
        return message.reply('Ogiltig Instagram-URL. Se till att URL:en innehåller ett giltigt användarnamn.');
      }
      username = usernameMatch[1];
    } else {
      return message.reply('Ogiltig plattform. Använd `instagram`.');
    }

    const discordId = message.author.id;
    addUser(discordId); // Se till att användaren finns i systemet
    userData.users[discordId].instagramUsername = username;
    saveUserData();

    message.reply(`Ditt Instagram-konto (${username}) har länkats till Discord.`);
  }

  if (message.content.startsWith('/ladda')) {
    const args = message.content.split(' ');
    const platform = args[1]; // Plattform: instagram
    const postUrl = args[2]; // URL till inlägget

    if (!platform || !postUrl) {
      return message.reply('Ange plattform och URL. Exempel: `/ladda instagram https://www.instagram.com/p/C1234567890/`');
    }

    let postId;
    if (platform === 'instagram') {
      const postIdMatch = postUrl.match(/\/p\/([a-zA-Z0-9_-]+)/);
      if (!postIdMatch || !postIdMatch[1]) {
        return message.reply('Ogiltig Instagram-inläggs-URL. Se till att URL:en innehåller ett giltigt Post-ID.');
      }
      postId = postIdMatch[1];
    } else {
      return message.reply('Ogiltig plattform. Använd `instagram`.');
    }

    if (!userData.activeTasks.some((task) => task.postId === postId && task.platform === platform)) {
      userData.activeTasks.push({ postId, platform, reward: 5 }); // Standardbelöning: 5 G-coins
      saveUserData();
    }

    message.reply(`Inlägg har laddats upp! Plattform: ${platform}, Post-ID: ${postId}\nGå in på detta inlägg och interagera för att tjäna G-coins!`);
  }

  if (message.content.startsWith('/uppgifter')) {
    if (userData.activeTasks.length === 0) {
      return message.reply('Det finns inga aktiva uppgifter just nu.');
    }

    const tasksList = userData.activeTasks
      .map((task) => `Plattform: ${task.platform}, Post-ID: ${task.postId} - Belöning: ${task.reward} G-coins`)
      .join('\n');

    message.reply(`Aktiva uppgifter:\n${tasksList}`);
  }
});

// Funktion för att automatiskt belöna interaktioner
async function checkAndRewardInteractions() {
  try {
    for (const task of userData.activeTasks) {
      if (task.platform === 'instagram') {
        const postId = task.postId;

        // Hämta interaktionsdata för inlägget
        const response = await axios.get(`${INSTAGRAM_API_BASE_URL}/${postId}`, {
          params: {
            fields: 'likes,comments',
            access_token: instagramAccessToken,
          },
        });

        const interactions = response.data;

        // Kontrollera gillningar
        if (interactions.likes && interactions.likes.data) {
          for (const like of interactions.likes.data) {
            const username = like.username;

            const discordUser = Object.keys(userData.users).find(
              (discordId) => userData.users[discordId].instagramUsername === username
            );

            if (discordUser) {
              const user = userData.users[discordUser];

              const hasLiked = user.interactionHistory.some(
                (interaction) => interaction.postId === postId && interaction.actions.includes('like')
              );

              if (!hasLiked) {
                updateGCoins(discordUser, 1);
                logInteraction(discordUser, postId, 'instagram', ['like']);
                console.log(`Belönade ${username} med 1 G-coin för gillning av post ${postId}`);
              }
            }
          }
        }

        // Kontrollera kommentarer
        if (interactions.comments && interactions.comments.data) {
          for (const comment of interactions.comments.data) {
            const username = comment.from.username;

            const discordUser = Object.keys(userData.users).find(
              (discordId) => userData.users[discordId].instagramUsername === username
            );

            if (discordUser) {
              const user = userData.users[discordUser];

              const hasCommented = user.interactionHistory.some(
                (interaction) => interaction.postId === postId && interaction.actions.includes('comment')
              );

              if (!hasCommented) {
                updateGCoins(discordUser, 2);
                logInteraction(discordUser, postId, 'instagram', ['comment']);
                console.log(`Belönade ${username} med 2 G-coins för kommentar på post ${postId}`);
              }
            }
          }
        }

        // Uppdatera data.json efter varje belöning
        saveUserData();
      }
    }
  } catch (error) {
    console.error('Ett fel uppstod när vi försökte hämta och belöna interaktioner:', error.response?.data || error.message);
  }
}

// Logga in på boten
client.login(process.env.DISCORD_BOT_TOKEN); // Ersätt med din Discord-bot-token