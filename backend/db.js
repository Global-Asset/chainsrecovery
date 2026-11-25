const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDb() {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, country TEXT NOT NULL, phone TEXT NOT NULL,
      address TEXT NOT NULL, email TEXT NOT NULL UNIQUE, photo TEXT, password_hash TEXT NOT NULL, 
      verified INTEGER NOT NULL DEFAULT 0, locked INTEGER NOT NULL DEFAULT 0, lock_reason TEXT DEFAULT '',
      wallet_address TEXT NOT NULL, notes TEXT DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS balances (
      user_id INTEGER NOT NULL, coin TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, coin), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, coin TEXT NOT NULL,
      type TEXT NOT NULL, amount REAL NOT NULL, note TEXT DEFAULT '',
      created_by TEXT DEFAULT 'admin', created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS otps (
      id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, code TEXT NOT NULL,
      purpose TEXT NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, coin TEXT NOT NULL,
      amount REAL NOT NULL, address TEXT NOT NULL, status TEXT DEFAULT 'Pending',
      created_at INTEGER NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );`
  ]);
  console.log("✅ Database tables verified/created.");
}

module.exports = { db, initDb };
