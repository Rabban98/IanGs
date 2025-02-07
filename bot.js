require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const express = require('express');
const { addUser, updateCoins, addItem, getMarketItems, removeItem, updateItemStock } = require('./mongo'); // Importera MongoDB-funktionerna

// Express app setup
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Discord bot setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: ['CHANNEL', 'MESSAGE']
});

client.once('ready', () => console.log('Bot is online!'));

// Kommando för /boot
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
  }

  // Lägga till föremål i marknaden
  if (message.content.startsWith('/addproduct')) {
    if (message.author.id !== message.guild.ownerId) {
      return message.reply('Endast serverns ägare kan använda detta kommando.');
    }

    const args = message.content.split('_');
    if (args.length < 4) {
      return message.reply('Användning: `/addproduct_name_price_stock`');
    }

    const itemName = args[1];
    const itemPrice = parseInt(args[2]);
    const itemStock = parseInt(args[3]);

    if (isNaN(itemPrice) || itemPrice <= 0) {
      return message.reply('Priset måste vara ett positivt tal.');
    }
    if (isNaN(itemStock) || itemStock <= 0) {
      return message.reply('Lagersaldo måste vara ett positivt tal.');
    }

    message.reply(`Vill du ladda upp en bild för "${itemName}"? Om ja, skicka bilden inom 1 minut.`);
    const filter = m => m.attachments.size > 0 && m.author.id === message.author.id;
    const collector = message.channel.createMessageCollector({ filter, time: 60000, max: 1 });

    collector.on('collect', async msg => {
      const attachment = msg.attachments.first();
      if (attachment) {
        await addItem(itemName, itemPrice, itemStock, attachment.url);
        message.reply(`Föremål "${itemName}" har lagts till i marknaden med ${itemStock} i lager.`);
      } else {
        message.reply('Ingen bild hittades. Föremålet har inte lagts till.');
      }
    });

    collector.on('end', async () => {
      if (collector.collected.size === 0) {
        await addItem(itemName, itemPrice, itemStock, null);
        message.reply(`Föremål "${itemName}" har lagts till i marknaden utan bild och med ${itemStock} i lager.`);
      }
    });
  }

  // Ta bort föremål från marknaden
  if (message.content.startsWith('/tabort')) {
    if (message.author.id !== message.guild.ownerId) {
      return message.reply('Endast serverns ägare kan använda detta kommando.');
    }

    const args = message.content.split(' ');
    if (args.length < 2) {
      return message.reply('Användning: `/tabort "föremålsnamn"`');
    }

    const itemName = args.slice(1).join(' ');
    await removeItem(itemName);
    message.reply(`Föremål "${itemName}" har tagits bort från marknaden.`);
  }

  // Visa marknad
  if (message.content === '/market') {
    const items = await getMarketItems();

    if (items.length === 0) {
      return message.reply('Marknaden är tom just nu.');
    }

    const embed = new EmbedBuilder()
      .setTitle('Marknad')
      .setColor('#FFD700');

    items.forEach((item) => {
      embed.addFields({
        name: `📦 ${item.name}`,
        value: `Pris: **${item.price} G-Coins** | Lager: **${item.stock}**${item.image ? ` | [Bild](${item.image})` : ''}`,
        inline: false
      });
    });

    message.reply({ embeds: [embed] });
  }
});

// Hantera interaktioner (knapptryckningar)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;

  if (interaction.customId === 'link_account') {
    await interaction.deferUpdate();
    const dmChannel = await interaction.user.createDM();
    await dmChannel.send('Ange din Instagram-länk med `/länka <din-instagram-url>`.');
  }

  if (interaction.customId === 'wallet') {
    const user = await User.findOne({ discordId: userId });
    const balance = user?.gCoins || 0;

    const embed = new EmbedBuilder()
      .setTitle('Din G-Coin Wallet')
      .setDescription(`Du har **${balance}** G-Coins!`)
      .setColor('#FFD700');

    const reply = await interaction.reply({ embeds: [embed], ephemeral: true });
    setTimeout(() => reply.delete().catch(() => {}), 180000);
  }

  if (interaction.customId === 'market') {
    const items = await getMarketItems();

    if (items.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('Marknaden är tom')
        .setDescription('Just nu finns det inga varor på marknaden.')
        .setColor('#808080');

      const reply = await interaction.reply({ embeds: [embed], ephemeral: true });
      setTimeout(() => reply.delete().catch(() => {}), 180000);
    } else {
      const embed = new EmbedBuilder()
        .setTitle('Marknad')
        .setDescription('Här är de tillgängliga varorna:')
        .setColor('#FFD700');

      const rows = [];
      items.forEach((item) => {
        embed.addFields({
          name: `📦 ${item.name}`,
          value: `Pris: **${item.price} G-Coins** | Lager: **${item.stock}**${item.image ? ` | [Bild](${item.image})` : ''}`,
          inline: false
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`buy_${item._id}`)
            .setLabel(`Köp (${item.price} G-Coins)`)
            .setStyle(ButtonStyle.Primary)
        );
        rows.push(row);
      });

      await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }
  }

  // Hantera köp av varor
  if (interaction.customId.startsWith('buy_')) {
    const itemId = interaction.customId.split('_')[1];
    const item = await MarketItem.findById(itemId);

    if (!item) {
      return interaction.reply({ content: 'Varan kunde inte hittas.', ephemeral: true });
    }

    const user = await User.findOne({ discordId: userId });

    if (!user || user.gCoins < item.price) {
      return interaction.reply({ content: 'Du har inte tillräckligt med G-Coins för att köpa denna vara.', ephemeral: true });
    }

    if (item.stock <= 0) {
      return interaction.reply({ content: 'Denna vara är slut i lager.', ephemeral: true });
    }

    // Uppdatera användarens saldo och varans lager
    await updateCoins(userId, -item.price);
    await updateItemStock(itemId, item.stock - 1);

    interaction.reply({
      content: `Du har köpt **${item.name}** för ${item.price} G-Coins! Du har nu ${user.gCoins - item.price} G-Coins kvar.`,
      ephemeral: true
    });
  }
});

// Länka Instagram-konto
client.on('messageCreate', async (message) => {
  if (message.channel.isDMBased() && message.content.startsWith('/länka')) {
    const args = message.content.split(' ');
    if (args.length < 2) return message.reply('Ange din Instagram-länk.');

    const usernameMatch = args[1].match(/instagram\.com\/([\w._-]+)/);
    if (!usernameMatch) return message.reply('Ogiltig Instagram-URL.');

    await addUser(message.author.id);
    const user = await User.findOne({ discordId: message.author.id });
    user.instagramUsername = usernameMatch[1];
    await user.save();

    await message.reply(`Ditt Instagram-konto (${usernameMatch[1]}) har länkats!`);
  }
});

// Logga in på Discord
client.login(process.env.DISCORD_BOT_TOKEN);