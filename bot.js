require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');

// Express app setup
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => {
  res.send('Bot is running!');
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// MongoDB connection
async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Ansluten till MongoDB');
  } catch (error) {
    console.error('Kunde inte ansluta till MongoDB:', error);
    process.exit(1); // Avsluta boten om anslutningen misslyckas
  }
}
connectToDatabase();

// MongoDB schemas
const userSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  instagramUsername: { type: String, default: null },
  gCoins: { type: Number, default: 0 },
});

const marketItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  stock: { type: Number, required: true },
  image: { type: String, default: null },
});

const User = mongoose.model('User', userSchema);
const MarketItem = mongoose.model('MarketItem', marketItemSchema);

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

// Kommando för /boot
client.on('messageCreate', async (message) => {
  if (message.content === '/boot') {
    const embed = new EmbedBuilder()
      .setTitle('✨ Välkommen till G-Coin Bot! ✨')
      .setDescription('Tryck på knappen nedan för att länka ditt Instagram-konto.')
      .setImage('https://i.imgur.com/vLPjEI1.png')
      .setColor('#8A2BE2'); // Lila bakgrund

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('link_account').setLabel('🔗 Länka').setStyle(ButtonStyle.Primary),
    );

    const sentMessage = await message.channel.send({ embeds: [embed], components: [row] });
    await sentMessage.pin(); // Fäst meddelandet i kanalen
  }

  // Lägga till föremål i marknaden
  if (message.content.startsWith('/addproduct')) {
    if (message.author.id !== message.guild.ownerId) {
      return message.reply('❌ Endast serverns ägare kan använda detta kommando.');
    }

    const args = message.content.split('_');
    if (args.length < 4) {
      return message.reply('❌ Användning: `/addproduct_name_price_stock`');
    }

    const itemName = args[1];
    const itemPrice = parseInt(args[2]);
    const itemStock = parseInt(args[3]);

    if (isNaN(itemPrice) || itemPrice <= 0) {
      return message.reply('❌ Priset måste vara ett positivt tal.');
    }

    if (isNaN(itemStock) || itemStock <= 0) {
      return message.reply('❌ Lagersaldo måste vara ett positivt tal.');
    }

    message.reply(`📸 Vill du ladda upp en bild för "${itemName}"? Om ja, skicka bilden inom 1 minut.`);

    const filter = (m) => m.attachments.size > 0 && m.author.id === message.author.id;
    const collector = message.channel.createMessageCollector({ filter, time: 60000, max: 1 });

    collector.on('collect', async (msg) => {
      const attachment = msg.attachments.first();
      const item = new MarketItem({
        name: itemName,
        price: itemPrice,
        stock: itemStock,
        image: attachment ? attachment.url : null,
      });

      await item.save();
      message.reply(`✅ Föremål "${itemName}" har lagts till i marknaden med ${itemStock} i lager.`);
    });

    collector.on('end', async () => {
      if (collector.collected.size === 0) {
        const item = new MarketItem({
          name: itemName,
          price: itemPrice,
          stock: itemStock,
          image: null,
        });

        await item.save();
        message.reply(`✅ Föremål "${itemName}" har lagts till i marknaden utan bild och med ${itemStock} i lager.`);
      }
    });
  }

  // Ta bort föremål från marknaden
  if (message.content.startsWith('/tabort')) {
    if (message.author.id !== message.guild.ownerId) {
      return message.reply('❌ Endast serverns ägare kan använda detta kommando.');
    }

    const args = message.content.split(' ');
    if (args.length < 2) {
      return message.reply('❌ Användning: `/tabort "föremålsnamn"`');
    }

    const itemName = args.slice(1).join(' ');
    const deletedItem = await MarketItem.findOneAndDelete({ name: { $regex: new RegExp(`^${itemName}$`, 'i') } });

    if (!deletedItem) {
      return message.reply(`❌ Föremål "${itemName}" finns inte i marknaden.`);
    }

    message.reply(`✅ Föremål "${itemName}" har tagits bort från marknaden.`);
  }
});

// Hantera interaktioner (knapptryckningar)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const customId = interaction.customId;

  // Visa marknad när "Marknad"-knappen trycks
  if (customId === 'market') {
    const items = await MarketItem.find();
    if (items.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('🛒 Marknaden är tom 🛒')
        .setDescription('Just nu finns det inga varor på marknaden.')
        .setColor('#8A2BE2'); // Lila bakgrund

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    for (const item of items) {
      const embed = new EmbedBuilder()
        .setTitle(`🌟 ${item.name} 🌟`)
        .setDescription(`\n**💰 Pris:** ${item.price.toLocaleString()} G-Coins\n**📦 Lager:** ${item.stock.toLocaleString()}\n\n`)
        .setImage(item.image || 'https://i.imgur.com/placeholder.png')
        .setColor('#8A2BE2'); // Lila bakgrund

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`buy_${item._id}`)
          .setLabel('🛒 Köp Nu!')
          .setStyle(ButtonStyle.Success),
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });
    }

    await interaction.reply({ content: '🛒 Marknaden har öppnats!', ephemeral: true });
  }

  // Köpknappshantering
  if (customId.startsWith('buy_')) {
    const itemId = customId.split('_')[1];
    const item = await MarketItem.findById(itemId);

    if (!item) {
      return interaction.reply({ content: '❌ Detta föremål finns inte längre.', ephemeral: true });
    }

    const user = await User.findOne({ discordId: userId });
    if (!user || user.gCoins < item.price) {
      return interaction.reply({ content: '❌ Du har inte tillräckligt med G-Coins för att köpa detta.', ephemeral: true });
    }

    if (item.stock <= 0) {
      return interaction.reply({ content: '❌ Detta föremål är slut i lager.', ephemeral: true });
    }

    user.gCoins -= item.price;
    item.stock -= 1;

    await user.save();
    await item.save();

    await interaction.reply({
      content: `🎉 Du har köpt **${item.name}** för ${item.price.toLocaleString()} G-Coins! Du har nu ${user.gCoins.toLocaleString()} G-Coins kvar.`,
      ephemeral: true,
    });

    if (item.stock === 0) {
      await MarketItem.findByIdAndDelete(itemId);
    }
  }

  // Övriga knappar
  if (customId === 'link_account') {
    await interaction.deferUpdate();
    const dmChannel = await interaction.user.createDM();
    await dmChannel.send('Ange din Instagram-länk med `/länka `.');
  }

  if (customId === 'wallet') {
    const user = await User.findOne({ discordId: userId }) || { gCoins: 0 };
    const embed = new EmbedBuilder()
      .setTitle('💼 Din G-Coin Wallet 💼')
      .setDescription(`Du har **${user.gCoins.toLocaleString()}** G-Coins!`)
      .setColor('#8A2BE2'); // Lila bakgrund

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

// Länka Instagram-konto
client.on('messageCreate', async (message) => {
  if (message.channel.isDMBased() && message.content.startsWith('/länka')) {
    const args = message.content.split(' ');
    if (args.length < 2) return message.reply('❌ Ange din Instagram-länk.');

    const usernameMatch = args[1].match(/instagram\.com\/([\w._-]+)/);
    if (!usernameMatch) return message.reply('❌ Ogiltig Instagram-URL.');

    let user = await User.findOne({ discordId: message.author.id });
    if (!user) {
      user = new User({ discordId: message.author.id });
    }

    user.instagramUsername = usernameMatch[1];
    await user.save();

    await message.reply(`✅ Ditt Instagram-konto (${usernameMatch[1]}) har länkats!`);
  }
});

// Logga in på Discord
client.login(process.env.DISCORD_BOT_TOKEN);