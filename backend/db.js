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
