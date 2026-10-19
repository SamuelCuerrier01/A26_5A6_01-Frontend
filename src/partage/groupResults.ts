import type { SearchResult } from './search';

export type ResultSection = {
  key: string;
  kind: 'dm' | 'server' | 'channels';
  title?: string;
  data: SearchResult[];
};

export function groupResults(results: SearchResult[]): ResultSection[] {
  const dm: ResultSection = { key: 'dm', kind: 'dm', data: [] };
  const servers = new Map<string, ResultSection>();
  for (const result of results) {
    if (result.kind === 'dm') {
      dm.data.push(result);
      continue;
    }
    const key = result.serverName ? `server:${result.serverName}` : 'channels';
    let section = servers.get(key);
    if (!section) {
      section = result.serverName
        ? { key, kind: 'server', title: result.serverName, data: [] }
        : { key, kind: 'channels', data: [] };
      servers.set(key, section);
    }
    section.data.push(result);
  }
  return [...(dm.data.length ? [dm] : []), ...servers.values()];
}
