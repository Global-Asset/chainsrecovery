const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'chainrecover.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, country TEXT NOT NULL, phone TEXT NOT NULL,
      address TEXT NOT NULL, email TEXT NOT NULL UNIQUE, photo TEXT,
        password_hash TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0,
          locked INTEGER NOT NULL DEFAULT 0, lock_reason TEXT DEFAULT '',
            wallet_address TEXT NOT NULL, notes TEXT DEFAULT '',
              created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
              );
              CREATE TABLE IF NOT EXISTS balances (
                user_id INTEGER NOT NULL, coin TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0,
                  PRIMARY KEY (user_id, coin), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                  );
                  CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, coin TEXT NOT NULL,
                      type TEXT NOT NULL, amount REAL NOT NULL, note TEXT DEFAULT '',
                        created_by TEXT DEFAULT 'admin', created_at INTEGER NOT NULL,
                          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                          );
                          CREATE TABLE IF NOT EXISTS otps (
                            id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, code TEXT NOT NULL,
                              purpose TEXT NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0,
                                created_at INTEGER NOT NULL
                                );
                                CREATE TABLE IF NOT EXISTS cases (
                                  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT DEFAULT '',
                                    service TEXT NOT NULL, amount TEXT DEFAULT '', chain TEXT DEFAULT '',
                                      message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'New', notes TEXT DEFAULT '',
                                        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
                                        );
                                        `);
db.exec(`
  CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
        coin TEXT NOT NULL,
          amount REAL NOT NULL,
            address TEXT NOT NULL,
              status TEXT DEFAULT 'Pending',
                created_at INTEGER NOT NULL,
                  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                  );
                  `);
                                        module.exports = db;