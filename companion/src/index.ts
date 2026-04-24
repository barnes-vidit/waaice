import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initWhatsApp, getConnectionStatus, getUnreadChats, sendMessage, getContacts, getOwnJid, getStoreStats } from './whatsapp';
import { parseIntent, summarizeMessages, refineMessage, transcribeAudio } from './gemma';
import { buildDigest } from './digest';
import { loadJSON, saveJSON } from './storage';
import { log, getLogs, clearLogs } from './logger';

// Use os.tmpdir() so the path is correct on both Windows and Linux
const UPLOAD_DIR = path.join(os.tmpdir(), 'waaice-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR });

const app = express();
app.use(cors());
app.use(express.json());

// Log every incoming request
app.use((req, _res, next) => {
  log('HTTP', `${req.method} ${req.path}`);
  next();
});

const PORT = process.env.PORT || 3000;

app.get('/status', (_req, res) => {
  res.json({ status: getConnectionStatus() });
});

app.get('/me', (_req, res) => {
  const jid = getOwnJid();
  if (!jid) return res.status(503).json({ error: 'Not connected' });
  res.json({ jid });
});

app.get('/unread', async (_req, res) => {
  try {
    const chats = await getUnreadChats();
    res.json(chats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/send', async (req, res) => {
  const { contact, message } = req.body;
  if (!contact || !message) {
    return res.status(400).json({ error: 'contact and message required' });
  }
  try {
    await sendMessage(contact, message);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/parse-intent', async (req, res) => {
  const { transcript, context } = req.body;
  if (!transcript) return res.status(400).json({ error: 'transcript required' });
  try {
    const intent = await parseIntent(transcript, context ?? 'compose');
    res.json(intent);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/summarize', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }
  try {
    const summary = await summarizeMessages(messages);
    res.json({ summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/refine-message', async (req, res) => {
  const { message, tone } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  try {
    const refined = await refineMessage(message, tone);
    res.json({ refined });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/contacts', async (_req, res) => {
  try {
    const contacts = await getContacts();
    res.json(contacts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/digest', async (_req, res) => {
  try {
    const digest = await buildDigest();
    res.json(digest);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/ignore-group', (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).json({ error: 'jid required' });
  const ignored: string[] = loadJSON('ignored_groups.json', []);
  if (!ignored.includes(jid)) {
    ignored.push(jid);
    saveJSON('ignored_groups.json', ignored);
  }
  res.json({ success: true });
});

app.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'audio file required' });
  const language = (req.body.language as string) || 'en';
  log('HTTP:transcribe', `File: ${req.file.originalname} size:${req.file.size} lang:${language}`);
  try {
    const transcript = await transcribeAudio(req.file.path, language);
    res.json({ transcript });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Debug endpoints ────────────────────────────────────────────────────────
app.get('/debug/logs', (_req, res) => {
  res.json(getLogs());
});

app.delete('/debug/logs', (_req, res) => {
  clearLogs();
  res.json({ ok: true });
});

app.get('/debug/store', (_req, res) => {
  res.json(getStoreStats());
});

// Bind to 0.0.0.0 so phones on the same Wi-Fi can reach this server.
app.listen(PORT, '0.0.0.0', () => {
  log('Server', `Companion running on http://0.0.0.0:${PORT} — phone: http://<YOUR_PC_IP>:${PORT}`);
  initWhatsApp();
});
