export type Segment = { text: string; match: boolean };

export function splitHighlight(text: string, term: string): Segment[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return [{ text, match: false }];
  const haystack = text.toLowerCase();
  if (haystack.length !== text.length) return [{ text, match: false }];

  const segments: Segment[] = [];
  let from = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
    if (at > from) segments.push({ text: text.slice(from, at), match: false });
    segments.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) segments.push({ text: text.slice(from), match: false });
  return segments.length ? segments : [{ text, match: false }];
}
