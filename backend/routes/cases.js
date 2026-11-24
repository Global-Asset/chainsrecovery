const express = require('express');
const db = require('../db');
const { isValidEmail } = require('../utils');
const router = express.Router();

router.post('/', (req, res) => {
  const { name, email, service, message } = req.body || {};
  const values = [name, email, service, message];
  if (values.some(value => typeof value !== 'string' || !value.trim())) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim();
  const cleanService = service.trim();
  const cleanMessage = message.trim();
  const allowedServices = [
    'Stolen & Scam Tracing',
    'Lost Wallet Access',
    'Smart Contract Exploits',
    'Wrong-Address Transfers',
    'Other'
  ];

  if (!isValidEmail(cleanEmail)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (cleanName.length > 100 || cleanEmail.length > 254 || cleanService.length > 80 || cleanMessage.length > 4000) {
    return res.status(400).json({ error: 'One or more fields exceed the allowed length' });
  }
  if (!allowedServices.includes(cleanService)) return res.status(400).json({ error: 'Select a valid case type' });

  const id = 'CR-' + Date.now().toString(36).toUpperCase();
  const now = Date.now();
  db.prepare(`
    INSERT INTO cases (id, name, email, service, message, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, cleanName, cleanEmail, cleanService, cleanMessage, now, now);
  res.json({ ok: true, id });
});

module.exports = router;