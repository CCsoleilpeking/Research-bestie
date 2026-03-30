export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// --- Sessions ---
export async function fetchSessions() {
  const res = await fetch(`${API_URL}/api/sessions`);
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

export async function createSessionAPI(id: string, title: string, createdAt: string) {
  const res = await fetch(`${API_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, title, createdAt }),
  });
  if (!res.ok) throw new Error('Failed to create session');
}

export async function updateSessionAPI(id: string, data: { title?: string; archived?: boolean }) {
  const res = await fetch(`${API_URL}/api/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update session');
}

export async function deleteSessionAPI(id: string) {
  const res = await fetch(`${API_URL}/api/sessions/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete session');
}

// --- Messages ---
export async function fetchMessages(sessionId: string) {
  const res = await fetch(`${API_URL}/api/sessions/${sessionId}/messages`);
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

export async function addMessageAPI(sessionId: string, msg: { id: string; role: string; content: string; timestamp: string }) {
  const res = await fetch(`${API_URL}/api/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msg),
  });
  if (!res.ok) throw new Error('Failed to add message');
}

export async function deleteMessagesAfterAPI(sessionId: string, timestamp: string) {
  const res = await fetch(`${API_URL}/api/sessions/${sessionId}/messages-after/${encodeURIComponent(timestamp)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete messages');
}

// --- Daily Summaries ---
export async function fetchDailySummaries() {
  const res = await fetch(`${API_URL}/api/data/summaries`);
  if (!res.ok) throw new Error('Failed to fetch summaries');
  return res.json();
}

export async function upsertDailySummaryAPI(id: string, date: string, content: string, fragments: string[]) {
  await fetch(`${API_URL}/api/data/summaries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, date, content, fragments }),
  });
}

export async function deleteDailySummaryAPI(id: string) {
  await fetch(`${API_URL}/api/data/summaries/${id}`, { method: 'DELETE' });
}

// --- Insights ---
export async function fetchInsights() {
  const res = await fetch(`${API_URL}/api/data/insights`);
  if (!res.ok) throw new Error('Failed to fetch insights');
  return res.json();
}

export async function addInsightAPI(id: string, content: string, createdAt: string) {
  await fetch(`${API_URL}/api/data/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, content, createdAt }),
  });
}

export async function updateInsightAPI(id: string, content: string) {
  await fetch(`${API_URL}/api/data/insights/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

export async function deleteInsightAPI(id: string) {
  await fetch(`${API_URL}/api/data/insights/${id}`, { method: 'DELETE' });
}

// --- Today Papers ---
export async function fetchTodayPapers() {
  const res = await fetch(`${API_URL}/api/data/papers`);
  if (!res.ok) throw new Error('Failed to fetch papers');
  return res.json();
}

export async function addTodayPaperAPI(id: string, title: string, addedAt: string, link?: string, notes?: string) {
  await fetch(`${API_URL}/api/data/papers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, title, addedAt, link, notes }),
  });
}

export async function updateTodayPaperAPI(id: string, data: { title?: string; link?: string; notes?: string }) {
  await fetch(`${API_URL}/api/data/papers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteTodayPaperAPI(id: string) {
  await fetch(`${API_URL}/api/data/papers/${id}`, { method: 'DELETE' });
}

// --- Todos ---
export async function fetchTodos() {
  const res = await fetch(`${API_URL}/api/data/todos`);
  if (!res.ok) throw new Error('Failed to fetch todos');
  return res.json();
}

export async function addTodoAPI(id: string, text: string, createdAt: string) {
  await fetch(`${API_URL}/api/data/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, text, createdAt }),
  });
}

export async function updateTodoAPI(id: string, data: { text?: string; done?: boolean }) {
  await fetch(`${API_URL}/api/data/todos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteTodoAPI(id: string) {
  await fetch(`${API_URL}/api/data/todos/${id}`, { method: 'DELETE' });
}

// --- Health check ---
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
