/**
 * Parse SmartFAQ strings stored as Markdown: **Question?** then answer body.
 * Used for accordion UI; falls back to raw markdown if no pairs match.
 */
export function parseFaqMarkdownToPairs(faqs: string): { question: string; answer: string }[] {
  const trimmed = faqs.trim();
  if (!trimmed) return [];

  const chunks = trimmed.split(/\n(?=\*\*)/).filter((c) => c.trim().length > 0);
  const pairs: { question: string; answer: string }[] = [];

  for (const chunk of chunks) {
    const m = /^\*\*(.+?)\*\*\s*\n?([\s\S]*)$/.exec(chunk.trim());
    if (m) {
      pairs.push({ question: m[1].trim(), answer: m[2].trim() });
    }
  }

  return pairs;
}
