require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const mysql = require('mysql2/promise');

// Express app setup
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// MySQL connection
let dbConnection;
async function ensureDatabaseConnection() {
  if (!dbConnection || dbConnection.state === 'disconnected') {
    try {
      dbConnection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'discord_bot',
      });
      console.log('✅ MySQL connection established.');
    } catch (error) {
      console.error('❌ Failed to connect to MySQL:', error);
      throw error;
    }
  }
}

// Initialize database tables
async function initializeDatabase() {
  await ensureDatabaseConnection();
  try {
    await dbConnection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        discordId VARCHAR(255) PRIMARY KEY,
        instagram_username VARCHAR(255),
        g_coins INT DEFAULT 0,
        has_linked_account BOOLEAN DEFAULT FALSE,
        last_claim TIMESTAMP NULL
      )
    `);
    await dbConnection.execute(`
      CREATE TABLE IF NOT EXISTS marketItems (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price INT NOT NULL,
        stock INT NOT NULL,
        image VARCHAR(255)
      )
    `);
    console.log('✅ Database and tables initialized.');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
  }
}
initializeDatabase();

// Global variables for boot message ID
let bootMessageId = null;
let bootChannelId = null;

// Discord bot setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: ['CHANNEL', 'MESSAGE'],
});
client.once('ready', () => console.log('Bot is online!'));

// /boot command
client.on('messageCreate', async (message) => {
  if (message.content === '/boot') {
    const userId = message.author.id;
    await ensureDatabaseConnection();
    try {
      const [users] = await dbConnection.execute('SELECT * FROM users WHERE discordId = ?', [userId]);
      const user = users[0];
      const embed = new EmbedBuilder()
        .setTitle('✨ Välkommen till G-Coin Bot! ✨')
        .setDescription('Tryck på knappen nedan för att länka ditt Instagram-konto.')
        .setImage('https://i.imgur.com/vLPjEI1.png')
        .setColor('#8A2BE2'); // Lila bakgrund
      const row = new ActionRowBuilder();
      if (!user || !user.has_linked_account) {
        row.addComponents(
          new ButtonBuilder().setCustomId('link_account').setLabel('🔗 Länka').setStyle(ButtonStyle.Primary)
        );
      } else {
        row.addComponents(
          new ButtonBuilder().setCustomId('wallet').setLabel('💼 Wallet').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('market').setLabel('🛒 Marknad').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('raffle').setLabel('🎲 Raffle').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('auction').setLabel('📢 Auktion').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('claim').setLabel('🎁 Claim').setStyle(ButtonStyle.Success)
        );
      }
      const sentMessage = await message.channel.send({ embeds: [embed], components: [row] });
      bootMessageId = sentMessage.id;
      bootChannelId = message.channel.id;
      await sentMessage.pin();
    } catch (error) {
      console.error('Error handling /boot:', error);
    }
  }
});

// Add product command
client.on('messageCreate', async (message) => {
  if (message.content.startsWith('/addproduct')) {
    if (message.author.id !== message.guild.ownerId) {
      return message.reply('❌ Endast serverns ägare kan använda detta kommando.');
    }
    const args = message.content.split(' ');
    if (args.length < 4) {
      return message.reply('❌ Användning: `/addproduct [namn] [pris] [stock]`');
    }
    const name = args[1];
    const price = parseInt(args[2]);
    const stock = parseInt(args[3]);
    if (isNaN(price) || price <= 0) {
      return message.reply('❌ Priset måste vara ett positivt tal.');
    }
    if (isNaN(stock) || stock <= 0) {
      return message.reply('❌ Stock måste vara ett positivt tal.');
    }
    try {
      await ensureDatabaseConnection();
      await dbConnection.execute(
        'INSERT INTO marketItems (name, price, stock, image) VALUES (?, ?, ?, ?)',
        [name, price, stock, null]
      );
      message.reply(`📸 Vill du ladda upp en bild för "${name}"? Om ja, skicka bilden inom 1 minut.`);
      const filter = m => m.attachments.size > 0 && m.author.id === message.author.id;
      const collector = message.channel.createMessageCollector({ filter, time: 60000, max: 1 });
      collector.on('collect', async msg => {
        const attachment = msg.attachments.first();
        if (attachment) {
          await dbConnection.execute('UPDATE marketItems SET image = ? WHERE name = ?', [attachment.url, name]);
          message.reply(`✅ Föremål "${name}" har lagts till i marknaden med ${stock} i lager och en bild.`);
        }
      });
      collector.on('end', async () => {
        if (collector.collected.size === 0) {
          await dbConnection.execute(
            'UPDATE marketItems SET image = ? WHERE name = ?',
            ['https://i.imgur.com/placeholder.png', name]
          );
          message.reply(`✅ Föremål "${name}" har lagts till i marknaden utan bild och med ${stock} i lager.`);
        }
      });
    } catch (error) {
      console.error('Error adding product:', error);
      message.reply('❌ Ett fel inträffade när föremålet skulle läggas till.');
    }
  }
});

// Remove product command
client.on('messageCreate', async (message) => {
  if (message.content.startsWith('/tabort')) {
    if (message.author.id !== message.guild.ownerId) {
      return message.reply('❌ Endast serverns ägare kan använda detta kommando.');
    }
    const args = message.content.split(' ');
    if (args.length < 2) {
      return message.reply('❌ Användning: `/tabort "föremålsnamn"`');
    }
    const itemName = args.slice(1).join(' ');
    try {
      await ensureDatabaseConnection();
      const [rows] = await dbConnection.execute('SELECT * FROM marketItems WHERE name = ?', [itemName]);
      if (rows.length === 0) {
        return message.reply(`❌ Föremål "${itemName}" finns inte i marknaden.`);
      }
      await dbConnection.execute('DELETE FROM marketItems WHERE name = ?', [itemName]);
      message.reply(`✅ Föremål "${itemName}" har tagits bort från marknaden.`);
    } catch (error) {
      console.error('Error removing product:', error);
      message.reply('❌ Ett fel inträffade när föremålet skulle tas bort.');
    }
  }
});

// Show market when "Market" button is clicked
client.on('interactionCreate', async (interaction) => {
  if (interaction.customId === 'market') {
    await ensureDatabaseConnection();
    try {
      const [items] = await dbConnection.execute('SELECT * FROM marketItems');
      if (items.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('🛒 Marknaden är tom 🛒')
          .setDescription('Just nu finns det inga varor på marknaden.')
          .setColor('#8A2BE2');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      for (const item of items) {
        const embed = new EmbedBuilder()
          .setTitle(`🌟 ${item.name} 🌟`)
          .setDescription(
            `\n**💰 Pris:** ${item.price.toLocaleString()} G-Coins\n` +
            `**📦 Lager:** ${item.stock.toLocaleString()}\n\n`
          )
          .setImage(item.image || 'https://i.imgur.com/placeholder.png') // Fallback image
          .setColor('#8A2BE2');
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`buy_${item.id}`)
            .setLabel('🛒 Köp Nu!')
            .setStyle(ButtonStyle.Success)
        );
        await interaction.channel.send({ embeds: [embed], components: [row] });
      }
      await interaction.reply({ content: '🛒 Marknaden har öppnats!', ephemeral: true });
    } catch (error) {
      console.error('Error fetching market items:', error);
      await interaction.reply({ content: '❌ Ett fel uppstod. Försök igen senare.', ephemeral: true });
    }
  }
});

// Handle purchase and create a ticket channel
client.on('interactionCreate', async (interaction) => {
  if (interaction.customId.startsWith('buy_')) {
    const itemId = interaction.customId.split('_')[1];
    const userId = interaction.user.id;
    try {
      await ensureDatabaseConnection();
      const [itemRows] = await dbConnection.execute('SELECT * FROM marketItems WHERE id = ?', [itemId]);
      const item = itemRows[0];
      if (!item) {
        return interaction.reply({ content: '❌ Detta föremål finns inte längre.', ephemeral: true });
      }
      const [userRows] = await dbConnection.execute('SELECT * FROM users WHERE discordId = ?', [userId]);
      const user = userRows[0];
      if (!user || user.g_coins < item.price) {
        return interaction.reply({ content: '❌ Du har inte tillräckligt med G-Coins för att köpa detta.', ephemeral: true });
      }
      if (item.stock <= 0) {
        return interaction.reply({ content: '❌ Detta föremål är slut i lager.', ephemeral: true });
      }
      await dbConnection.execute('UPDATE users SET g_coins = g_coins - ? WHERE discordId = ?', [item.price, userId]);
      await dbConnection.execute('UPDATE marketItems SET stock = stock - 1 WHERE id = ?', [itemId]);
      if (item.stock - 1 === 0) {
        await dbConnection.execute('DELETE FROM marketItems WHERE id = ?', [itemId]);
      }
      const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const guild = interaction.guild;
      const categoryID = process.env.ORDER_CATEGORY_ID; // Set this in your .env file
      const category = guild.channels.cache.get(categoryID);
      if (!category) {
        return interaction.reply({ content: '❌ Kategorin för orders hittades inte.', ephemeral: true });
      }
      const channelName = `order-${orderNumber}`;
      const channel = await guild.channels.create({
        name: channelName,
        type: 0, // Text channel
        parent: categoryID,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: userId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
          },
          {
            id: guild.ownerId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
          },
        ],
      });
      const orderEmbed = new EmbedBuilder()
        .setTitle(`🛒 Ny Order: ${orderNumber}`)
        .setDescription(
          `**Köpare:** <@${userId}>\n` +
          `**Produkt:** ${item.name}\n` +
          `**Pris:** ${item.price.toLocaleString()} G-Coins\n` +
          `**Tidpunkt:** `
        )
        .setColor('#8A2BE2')
        .setThumbnail(item.image || 'https://i.imgur.com/placeholder.png');
      await channel.send({ embeds: [orderEmbed] });
      await interaction.reply({
        content: `🎉 Du har köpt **${item.name}** för ${item.price.toLocaleString()} G-Coins! Din order har registrerats i kanalen: <#${channel.id}>.`,
        ephemeral: true,
      });
    } catch (error) {
      console.error('Error processing purchase:', error);
      await interaction.reply({ content: '❌ Ett fel uppstod. Försök igen senare.', ephemeral: true });
    }
  }
});

// Link Instagram account
client.on('messageCreate', async (message) => {
  if (message.channel.isDMBased() && message.content.startsWith('/länka')) {
    const args = message.content.split(' ');
    if (args.length < 2) return message.reply('❌ Ange din Instagram-länk.');
    const usernameMatch = args[1].match(/instagram\.com\/([\w._-]+)/);
    if (!usernameMatch) return message.reply('❌ Ogiltig Instagram-URL.');
    try {
      await ensureDatabaseConnection();
      await dbConnection.execute(
        'INSERT INTO users (discordId, instagram_username, has_linked_account) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE instagram_username = ?, has_linked_account = 1',
        [message.author.id, usernameMatch[1], 1, usernameMatch[1]]
      );
      await message.reply(`✅ Ditt Instagram-konto (${usernameMatch[1]}) har länkats!`);
      if (bootMessageId && bootChannelId) {
        try {
          const channel = await client.channels.fetch(bootChannelId);
          const bootMessage = await channel.messages.fetch(bootMessageId);
          const updatedRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('wallet').setLabel('💼 Wallet').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('market').setLabel('🛒 Marknad').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('raffle').setLabel('🎲 Raffle').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('auction').setLabel('📢 Auktion').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('claim').setLabel('🎁 Claim').setStyle(ButtonStyle.Success)
          );
          await bootMessage.edit({ components: [updatedRow] });
        } catch (error) {
          console.error('Error updating boot message:', error);
        }
      }
    } catch (error) {
      console.error('Error linking Instagram account:', error);
      await message.reply('❌ Ett fel inträffade vid länkning av ditt konto. Försök igen senare.');
    }
  }
});

// Show wallet balance
client.on('interactionCreate', async (interaction) => {
  if (interaction.customId === 'wallet') {
    const userId = interaction.user.id;
    try {
      await ensureDatabaseConnection();
      const [users] = await dbConnection.execute('SELECT * FROM users WHERE discordId = ?', [userId]);
      const user = users[0] || { g_coins: 0 };
      const embed = new EmbedBuilder()
        .setTitle('💼 Din G-Coin Wallet 💼')
        .setDescription(`Du har **${user.g_coins.toLocaleString()}** G-Coins!`)
        .setColor('#8A2BE2');
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
      await interaction.reply({ content: '❌ Ett fel uppstod. Försök igen senare.', ephemeral: true });
    }
  }
});

// Handle "Claim" button for daily rewards
client.on('interactionCreate', async (interaction) => {
  if (interaction.customId === 'claim') {
    const userId = interaction.user.id;
    try {
      await ensureDatabaseConnection();
      const [users] = await dbConnection.execute('SELECT * FROM users WHERE discordId = ?', [userId]);
      const user = users[0];
      if (!user) {
        return interaction.reply({ content: '❌ Du måste först länka ditt Instagram-konto.', ephemeral: true });
      }
      const now = new Date();
      const lastClaim = user.last_claim ? new Date(user.last_claim) : null;
      if (lastClaim && now - lastClaim < 24 * 60 * 60 * 1000) {
        return interaction.reply({ content: '❌ Du har redan hämtat din dagliga belöning idag.', ephemeral: true });
      }
      const rewardAmount = 1; // Antal G-Coins att ge vid claim
      await dbConnection.execute('UPDATE users SET g_coins = g_coins + ?, last_claim = ? WHERE discordId = ?', [rewardAmount, now, userId]);
      await interaction.reply({ content: `🎉 Du har fått ${rewardAmount} G-Coins som daglig belöning!`, ephemeral: true });
    } catch (error) {
      console.error('Error handling claim:', error);
      await interaction.reply({ content: '❌ Ett fel uppstod. Försök igen senare.', ephemeral: true });
    }
  }
});

// Link account button sends DM
client.on('interactionCreate', async (interaction) => {
  if (interaction.customId === 'link_account') {
    await interaction.deferUpdate();
    const dmChannel = await interaction.user.createDM();
    await dmChannel.send('Ange din Instagram-länk med `/länka [din_länk]`.');
  }
});

// Log in to Discord
client.login(process.env.DISCORD_BOT_TOKEN);

// Cleanup database connection when bot shuts down
process.on('exit', async () => {
  if (dbConnection) {
    await dbConnection.end();
    console.log('MySQL connection closed.');
  }
});
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;