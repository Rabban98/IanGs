require('dotenv').config();
const mysql = require('mysql2/promise');

// Skapa en MySQL-anslutning
async function createConnection() {
  return await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
}

// Initiera databasen vid uppstart
async function initializeDatabase() {
  const connection = await createConnection();
  try {
    // Skapa tabeller om de inte redan finns
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        discordId VARCHAR(255) PRIMARY KEY,
        instagramUsername VARCHAR(255),
        gCoins INT DEFAULT 0,
        hasLinkedAccount BOOLEAN DEFAULT FALSE
      )
    `);
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS marketItems (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price INT NOT NULL,
        stock INT NOT NULL,
        image VARCHAR(255)
      )
    `);
    console.log('Databas och tabeller har initierats.');
  } catch (error) {
    console.error('Fel vid initiering av databas:', error);
  } finally {
    await connection.end();
  }
}

module.exports = { createConnection, initializeDatabase };

