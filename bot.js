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
const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID; // Lägg till i miljövariabler
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET; // Lägg till i miljövariabler
let instagramAccessToken = null;

// Hämta Instagram Access Token
async function getInstagramAccessToken() {
  try {
    // Kontrollera om INSTAGRAM_APP_ID och INSTAGRAM_APP_SECRET är satta
    if (!INSTAGRAM_APP_ID || !INSTAGRAM_APP_SECRET) {
      console.warn(
        'VARNING: INSTAGRAM_APP_ID eller INSTAGRAM_APP_SECRET saknas. Instagram-integration kommer inte att fungera.'
      );
      return null; // Returnera null om variablerna saknas
    }

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

// Route för att hantera Instagram OAuth-callback
app.get('/auth/callback', async (req, res) => {
  const code = req.query.code; // Hämta "code" från query-parametrar

  try {
    // Byt ut "code" mot en Access Token
    const response = await axios.post('https://api.instagram.com/oauth/access_token', null, {
      params: {
        client_id: INSTAGRAM_APP_ID,
        client_secret: INSTAGRAM_APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: 'https://iangs.onrender.com/auth/callback', // Din offentliga URL
        code: code,
      },
    });

    const accessToken = response.data.access_token;
    console.log('Access Token:', accessToken);
    res.send('Du har lyckats länka ditt Instagram-konto!');
  } catch (error) {
    console.error('Ett fel uppstod vid hämtning av Access Token:', error.response?.data || error.message);
    res.status(500).send('Ett fel uppstod.');
  }
});

// Route för att hantera Verify Token
const VERIFY_TOKEN = 'borje_balder123'; // Uppdaterat Verify Token
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Verifiera att token matchar
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verifierad.');
    res.status(200).send(challenge); // Skicka tillbaka challenge för att bekräfta
  } else {
    console.error('Verify Token matchade inte.');
    res.status(403).send('Verify Token matchade inte.');
  }
});

// Dummy-route för att hålla servern igång
app.get('/', (req, res) => {
  res.send('Bot is running!');
});

// Ange porten som servern ska lyssna på
const PORT = process.env.PORT || 3000;

// Starta servern
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Skapa Discord-klienten
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', async () => {
  console.log('Bot is online!');
  try {
    await getInstagramAccessToken(); // Försök hämta Instagram Access Token
  } catch (error) {
    console.warn(
      'VARNING: Kunde inte hämta Instagram Access Token. Instagram-integration kommer inte att fungera.',
      error.message
    );
  }

  // Starta en timer för att regelbundet kontrollera interaktioner
  setInterval(checkAndRewardInteractions, 5 * 60 * 1000); // Var 5:e minut
});

// Hantera knapptryckningar
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;

  // Svara direkt på interaktionen för att undvika timeout
  await interaction.deferReply({ ephemeral: true });

  switch (interaction.customId) {
    case 'link_account': {
      try {
        const dmChannel = await interaction.user.createDM();
        await dmChannel.send('Ange din Instagram-länk här. Exempel: `https://www.instagram.com/dittanvandarnamn`');

        const filter = (m) => m.author.id === userId;
        const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });

        const instagramLink = collected.first().content;
        const usernameMatch = instagramLink.match(/instagram\.com\/([\w._-]+)/);

        if (!usernameMatch || !usernameMatch[1]) {
          await dmChannel.send('Ogiltig Instagram-länk. Försök igen.');
          await interaction.editReply({ content: 'Länkningen misslyckades. Försök igen.', ephemeral: true });
          return;
        }

        const username = usernameMatch[1];
        addUser(userId);
        userData.users[userId].instagramUsername = username;
        saveUserData();

        await dmChannel.send(`Ditt Instagram-konto (${username}) har länkats!`);
        await interaction.editReply({ content: `Ditt Instagram-konto (${username}) har länkats!`, ephemeral: true });

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

        await interaction.message.edit({
          embeds: [new EmbedBuilder().setTitle('Välkommen till G-Coin Bot!').setDescription('Tryck på knapparna nedan för att börja.').setImage('https://i.imgur.com/eyvdfEw.png').setColor('#FFD700')],
          components: [updatedRow],
        });
      } catch (error) {
        console.error('Ett fel uppstod vid länkning:', error.message);
        await interaction.editReply({ content: 'Ett fel uppstod vid länkning. Försök igen.', ephemeral: true });
      }
      break;
    }

    case 'balance': {
      const user = userData.users[userId];
      if (!user) {
        await interaction.editReply({ content: 'Du måste länka ditt Instagram-konto först.', ephemeral: true });
        return;
      }
      await interaction.editReply({ content: `Din G-coins balans är: ${user.gCoins}`, ephemeral: true });
      break;
    }

    case 'market': {
      await interaction.editReply({ content: 'Marknad funktionen är inte implementerad än.', ephemeral: true });
      break;
    }

    case 'raffle': {
      await interaction.editReply({ content: 'Lotteri funktionen är inte implementerad än.', ephemeral: true });
      break;
    }

    default:
      break;
  }
});

// Funktion för att automatiskt belöna interaktioner
async function checkAndRewardInteractions() {
  try {
    if (!instagramAccessToken) {
      console.warn('VARNING: Instagram Access Token saknas. Kan inte kontrollera interaktioner.');
      return;
    }

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
    console.error('Ett fel uppstod vid kontroll av interaktioner:', error.message);
  }
}

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