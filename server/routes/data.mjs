import { Router } from 'express';
import {
  getAllDailySummaries, upsertDailySummary, deleteDailySummary,
  getAllInsights, addInsight, updateInsight, deleteInsight,
  getAllTodayPapers, addTodayPaper, updateTodayPaper, deleteTodayPaper,
  getAllTodos, addTodo, updateTodo, deleteTodo,
} from '../db.mjs';

const router = Router();

function wrap(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      console.error(`[Data] ${req.method} ${req.path} error:`, err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

// --- Daily Summaries ---
router.get('/summaries', wrap((req, res) => {
  res.json(getAllDailySummaries());
}));

router.post('/summaries', wrap((req, res) => {
  const { id, date, content, fragments } = req.body;
  upsertDailySummary(id, date, content, fragments || []);
  res.json({ ok: true });
}));

router.delete('/summaries/:id', wrap((req, res) => {
  deleteDailySummary(req.params.id);
  res.json({ ok: true });
}));

// --- Insights ---
router.get('/insights', wrap((req, res) => {
  res.json(getAllInsights());
}));

router.post('/insights', wrap((req, res) => {
  const { id, content, createdAt } = req.body;
  addInsight(id, content, createdAt || new Date().toISOString());
  res.json({ ok: true });
}));

router.patch('/insights/:id', wrap((req, res) => {
  updateInsight(req.params.id, req.body.content);
  res.json({ ok: true });
}));

router.delete('/insights/:id', wrap((req, res) => {
  deleteInsight(req.params.id);
  res.json({ ok: true });
}));

// --- Today Papers ---
router.get('/papers', wrap((req, res) => {
  res.json(getAllTodayPapers());
}));

router.post('/papers', wrap((req, res) => {
  const { id, title, addedAt, link, notes } = req.body;
  addTodayPaper(id, title, addedAt || new Date().toISOString(), link, notes);
  res.json({ ok: true });
}));

router.patch('/papers/:id', wrap((req, res) => {
  updateTodayPaper(req.params.id, req.body);
  res.json({ ok: true });
}));

router.delete('/papers/:id', wrap((req, res) => {
  deleteTodayPaper(req.params.id);
  res.json({ ok: true });
}));

// --- Todos ---
router.get('/todos', wrap((req, res) => {
  res.json(getAllTodos());
}));

router.post('/todos', wrap((req, res) => {
  const { id, text, createdAt } = req.body;
  addTodo(id, text, createdAt || new Date().toISOString());
  res.json({ ok: true });
}));

router.patch('/todos/:id', wrap((req, res) => {
  updateTodo(req.params.id, req.body);
  res.json({ ok: true });
}));

router.delete('/todos/:id', wrap((req, res) => {
  deleteTodo(req.params.id);
  res.json({ ok: true });
}));

export default router;
