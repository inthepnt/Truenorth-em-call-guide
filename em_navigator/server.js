'use strict';
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

const app          = express();
const PORT         = process.env.PORT || 3000;
const JWT_SECRET   = process.env.JWT_SECRET || 'gpc-em-nav-2024-secret';
const DATA_DIR     = path.join(__dirname, 'data');
const USERS_FILE   = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE= path.join(DATA_DIR, 'sessions.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ─── file helpers ─── */
const readJSON  = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

/* ─── seed demo users on first run ─── */
function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) {
    const seed = [
      { id: '1', username: 'demo',  password: bcrypt.hashSync('demo123',  10), name: 'Demo User',      role: 'Recruiter'       },
      { id: '2', username: 'admin', password: bcrypt.hashSync('admin123', 10), name: 'Admin',           role: 'Account Manager' },
    ];
    writeJSON(USERS_FILE, seed);
    console.log('  Seeded demo accounts: demo/demo123  admin/admin123');
  }
  if (!fs.existsSync(SESSIONS_FILE)) writeJSON(SESSIONS_FILE, []);
}

/* ─── auth middleware ─── */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalid or expired' });
  }
}

/* ─── POST /api/login ─── */
app.post('/api/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

  const users = readJSON(USERS_FILE);
  const user  = users.find(u => u.username === String(username).toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid username or password' });

  const token = jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ token, name: user.name, username: user.username, role: user.role });
});

/* ─── GET /api/sessions ─── */
app.get('/api/sessions', requireAuth, (req, res) => {
  const all = readJSON(SESSIONS_FILE);
  res.json(
    all.filter(s => s.userId === req.user.id)
       .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  );
});

/* ─── POST /api/sessions ─── */
app.post('/api/sessions', requireAuth, (req, res) => {
  const { contact, mode, summary, questionsAnswered, totalQuestions } = req.body ?? {};
  if (!summary) return res.status(400).json({ error: 'summary is required' });

  const sessions = readJSON(SESSIONS_FILE);
  const session = {
    id:                Date.now().toString(),
    userId:            req.user.id,
    createdAt:         new Date().toISOString(),
    contact:           String(contact || 'Emergency Medicine Call').slice(0, 200),
    mode:              mode === 'sales' ? 'sales' : 'recruiter',
    summary:           String(summary).slice(0, 50000),
    questionsAnswered: Number(questionsAnswered) || 0,
    totalQuestions:    Number(totalQuestions)    || 0,
  };
  sessions.push(session);
  writeJSON(SESSIONS_FILE, sessions);
  res.status(201).json(session);
});

/* ─── DELETE /api/sessions/:id ─── */
app.delete('/api/sessions/:id', requireAuth, (req, res) => {
  const sessions = readJSON(SESSIONS_FILE);
  const idx = sessions.findIndex(s => s.id === req.params.id && s.userId === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Session not found' });
  sessions.splice(idx, 1);
  writeJSON(SESSIONS_FILE, sessions);
  res.json({ ok: true });
});

ensureData();
app.listen(PORT, () => {
  console.log(`\nGPC Navigator — Emergency Medicine`);
  console.log(`→ http://localhost:${PORT}`);
  console.log(`\nDemo accounts:`);
  console.log(`  username: demo    password: demo123`);
  console.log(`  username: admin   password: admin123\n`);
});
