import { Router } from 'express';
import {
  getAllSessions, createSession, updateSessionTitle,
  deleteSession, archiveSession, getMessages, addMessage,
  updateMessage, deleteMessagesAfter, getMessageCount,
  getSummaries, forgetSession,
} from '../db.mjs';

const router = Router();

function wrap(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      console.error(`[Sessions] ${req.method} ${req.path} error:`, err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

// --- Sessions ---

router.get('/', wrap((req, res) => {
  res.json(getAllSessions());
}));

router.post('/', wrap((req, res) => {
  const { id, title, createdAt } = req.body;
  createSession(id, title || 'New Chat', createdAt || new Date().toISOString());
  res.json({ ok: true });
}));

router.patch('/:id', wrap((req, res) => {
  const { title, archived } = req.body;
  if (title !== undefined) updateSessionTitle(req.params.id, title);
  if (archived !== undefined) archiveSession(req.params.id, archived);
  res.json({ ok: true });
}));

router.delete('/:id', wrap((req, res) => {
  deleteSession(req.params.id);
  res.json({ ok: true });
}));

// --- Messages ---

router.get('/:id/messages', wrap((req, res) => {
  res.json(getMessages(req.params.id));
}));

router.post('/:id/messages', wrap((req, res) => {
  const { id: msgId, role, content, timestamp } = req.body;
  addMessage(msgId, req.params.id, role, content, timestamp);
  res.json({ ok: true });
}));

router.put('/:id/messages/:msgId', wrap((req, res) => {
  updateMessage(req.params.msgId, req.body.content);
  res.json({ ok: true });
}));

router.delete('/:id/messages-after/:timestamp', wrap((req, res) => {
  deleteMessagesAfter(req.params.id, req.params.timestamp);
  res.json({ ok: true });
}));

router.get('/:id/message-count', wrap((req, res) => {
  res.json({ count: getMessageCount(req.params.id) });
}));

// --- Memory ---

router.get('/:id/summaries', wrap((req, res) => {
  res.json(getSummaries(req.params.id));
}));

router.post('/:id/forget', wrap((req, res) => {
  forgetSession(req.params.id);
  res.json({ ok: true });
}));

export default router;
