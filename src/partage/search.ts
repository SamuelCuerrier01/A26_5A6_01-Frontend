export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;

export type SearchResult = {
  id: string;
  conversationId: string;
  kind: 'dm' | 'room';
  senderId: string;
  senderName?: string;
  conversationTitle?: string;
  serverName?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type SearchPage = { results: SearchResult[]; nextCursor: string | null };

export type SearchInput = {
  q: string;
  cursor?: string | null;
  conversationId?: string;
  limit?: number;
  signal?: AbortSignal;
};

export function normalizeQuery(text: string): string | null {
  const q = text.trim();
  return q.length >= MIN_QUERY_LENGTH ? q.slice(0, MAX_QUERY_LENGTH) : null;
}
