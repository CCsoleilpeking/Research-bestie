export interface Paper {
  id: string;
  title: string;
  link: string;
  summary: string;
  addedAt: string;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
}

export interface InsightItem {
  id: string;
  content: string;
  source?: string;
  createdAt: string;
}

export interface DailySummaryItem {
  id: string;
  date: string;
  content: string;
  fragments?: string[];
}

export interface TodayPaper {
  id: string;
  title: string;
  link?: string;
  notes?: string;
  addedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  archived?: boolean;
}

export interface AppState {
  papers: Paper[];
  todos: TodoItem[];
  insights: InsightItem[];
  dailySummaries: DailySummaryItem[];
  chatSessions: ChatSession[];
  activeChatId: string;
}

export type LLMProvider = 'openai' | 'claude' | 'deepseek' | 'kimi' | 'gemini' | 'ionet';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  apiKeys: Partial<Record<LLMProvider, string>>;
  model: string;
}
