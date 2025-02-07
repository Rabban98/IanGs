const mongoose = require('mongoose');

// Hämta MONGO_URI från .env-filen
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('MONGO_URI är inte definierad i .env-filen.');
  process.exit(1); // Avsluta programmet om MONGO_URI saknas
}

// Anslut till MongoDB
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Ansluten till MongoDB!');
}).catch(err => {
  console.error('Fel vid anslutning till MongoDB:', err);
});

// Definiera scheman
const userSchema = new mongoose.Schema({
  discordId: { type: String, unique: true, required: true },
  instagramUsername: String,
  gCoins: { type: Number, default: 0 }
});

const itemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  stock: { type: Number, required: true },
  image: String
});

// Skapa modeller
const User = mongoose.model('User', userSchema);
const MarketItem = mongoose.model('MarketItem', itemSchema);

// Funktioner för att interagera med databasen

// Lägg till eller hämta en användare
async function addUser(discordId) {
  const user = await User.findOne({ discordId });
  if (!user) {
    const newUser = new User({ discordId });
    await newUser.save();
  }
}

// Uppdatera användares saldo
async function updateCoins(discordId, amount) {
  await User.updateOne({ discordId }, { $inc: { gCoins: amount } });
}

// Lägg till en vara i marknaden
async function addItem(name, price, stock, image) {
  const newItem = new MarketItem({ name, price, stock, image });
  await newItem.save();
}

// Hämta alla varor från marknaden
async function getMarketItems() {
  return await MarketItem.find();
}

// Ta bort en vara från marknaden
async function removeItem(itemName) {
  await MarketItem.deleteOne({ name: itemName });
}

// Uppdatera varans lager
async function updateItemStock(itemId, newStock) {
  await MarketItem.updateOne({ _id: itemId }, { stock: newStock });
}

module.exports = {
  addUser,
  updateCoins,
  addItem,
  getMarketItems,
  removeItem,
  updateItemStock
};