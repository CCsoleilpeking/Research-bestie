import { Router } from 'express';
import {
  getAllSessions, getSession, createSession, updateSessionTitle,
  deleteSession, archiveSession, getMessages, addMessage,
  updateMessage, deleteMessagesAfter, getMessageCount,
  clearSessionMessages, getSummaries, clearSummaries, forgetSession,
} from '../db.mjs';

const router = Router();

// --- Sessions ---

// GET /api/sessions
router.get('/', (req, res) => {
  const sessions = getAllSessions();
  res.json(sessions);
});

// POST /api/sessions
router.post('/', (req, res) => {
  const { id, title, createdAt } = req.body;
  createSession(id, title || 'New Chat', createdAt || new Date().toISOString());
  res.json({ ok: true });
});

// PATCH /api/sessions/:id
router.patch('/:id', (req, res) => {
  const { title, archived } = req.body;
  if (title !== undefined) updateSessionTitle(req.params.id, title);
  if (archived !== undefined) archiveSession(req.params.id, archived);
  res.json({ ok: true });
});

// DELETE /api/sessions/:id
router.delete('/:id', (req, res) => {
  deleteSession(req.params.id);
  res.json({ ok: true });
});

// --- Messages ---

// GET /api/sessions/:id/messages
router.get('/:id/messages', (req, res) => {
  const messages = getMessages(req.params.id);
  res.json(messages);
});

// POST /api/sessions/:id/messages
router.post('/:id/messages', (req, res) => {
  const { id: msgId, role, content, timestamp } = req.body;
  addMessage(msgId, req.params.id, role, content, timestamp);
  res.json({ ok: true });
});

// PUT /api/sessions/:id/messages/:msgId
router.put('/:id/messages/:msgId', (req, res) => {
  const { content } = req.body;
  updateMessage(req.params.msgId, content);
  res.json({ ok: true });
});

// DELETE /api/sessions/:id/messages-after/:timestamp
router.delete('/:id/messages-after/:timestamp', (req, res) => {
  deleteMessagesAfter(req.params.id, req.params.timestamp);
  res.json({ ok: true });
});

// GET /api/sessions/:id/message-count
router.get('/:id/message-count', (req, res) => {
  const count = getMessageCount(req.params.id);
  res.json({ count });
});

// --- Memory ---

// GET /api/sessions/:id/summaries
router.get('/:id/summaries', (req, res) => {
  const summaries = getSummaries(req.params.id);
  res.json(summaries);
});

// POST /api/sessions/:id/forget
router.post('/:id/forget', (req, res) => {
  forgetSession(req.params.id);
  res.json({ ok: true });
});

export default router;
