import { getUnreadChats } from './whatsapp';
import { loadJSON } from './storage';

interface DigestItem {
  name: string;
  jid: string;
  count: number;
  isGroup: boolean;
}

interface DigestResult {
  total: number;
  items: DigestItem[];
  summary: string;
}

export async function buildDigest(): Promise<DigestResult> {
  const chats = await getUnreadChats();
  const settings = loadJSON<{ summarize_threshold?: number }>('settings.json', {});

  const total = chats.reduce((sum, c) => sum + c.unreadCount, 0);

  const items: DigestItem[] = chats.map((c) => ({
    name: c.name,
    jid: c.jid,
    count: c.unreadCount,
    isGroup: c.isGroup,
  }));

  const summary = buildSummaryText(total, items);

  return { total, items, summary };
}

function buildSummaryText(total: number, items: DigestItem[]): string {
  if (total === 0) return 'You have no unread messages.';

  const parts: string[] = [];

  const directs = items.filter((i) => !i.isGroup);
  const groups = items.filter((i) => i.isGroup);

  for (const d of directs.slice(0, 3)) {
    parts.push(`${d.count} from ${d.name}`);
  }
  if (directs.length > 3) {
    const extra = directs.slice(3).reduce((s, d) => s + d.count, 0);
    parts.push(`${extra} from ${directs.length - 3} other contacts`);
  }

  for (const g of groups.slice(0, 2)) {
    parts.push(`${g.count} from the ${g.name} group`);
  }
  if (groups.length > 2) {
    const extra = groups.slice(2).reduce((s, g) => s + g.count, 0);
    parts.push(`${extra} from other groups`);
  }

  return `You have ${total} unread message${total !== 1 ? 's' : ''}. ${parts.join(', ')}.`;
}
