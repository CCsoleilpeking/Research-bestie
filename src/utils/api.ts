const API_URL = 'http://localhost:3001';

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

// --- Health check ---
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
