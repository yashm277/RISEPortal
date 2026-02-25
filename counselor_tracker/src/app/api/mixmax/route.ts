import { NextResponse } from "next/server";

export interface MixmaxRecipient {
  email: string;
  name: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  sequenceName?: string;
  lastSentAt?: number | null; // unix ms
}

export interface MixmaxTotals {
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
}

export interface MixmaxInsightsResponse {
  totals: MixmaxTotals;
  recipients: MixmaxRecipient[];
  dateRange?: { start: string; end: string };
}

const BASE = "https://api.mixmax.com/v1";

async function mixmaxGet(path: string, apiKey: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-API-Token": apiKey },
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mixmax ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

interface MixmaxStage {
  state: string;
  sentAt?: number | null;
  opens: number;
  clicks: number;
  replied: number;
  bounced: number;
}

interface MixmaxApiRecipient {
  to: { email: string; name?: string | null };
  stages: MixmaxStage[];
}

interface MixmaxSequence {
  _id: string;
  name: string;
}

export async function GET() {
  const apiKey = process.env.MIXMAX_API_KEY;

  if (!apiKey || apiKey === "your_key_here") {
    return NextResponse.json(
      { error: "MIXMAX_API_KEY not configured" },
      { status: 503 }
    );
  }

  try {
    // 1. Fetch all sequences (paginate if needed)
    const sequences: MixmaxSequence[] = [];
    let cursor: string | null = null;

    do {
      const url = cursor
        ? `/sequences?next=${encodeURIComponent(cursor)}&limit=50`
        : "/sequences?limit=50";
      const page = await mixmaxGet(url, apiKey);
      sequences.push(...(page.results ?? []));
      cursor = page.hasNext ? page.next : null;
    } while (cursor);

    // 2. For each sequence fetch recipients and aggregate stats
    const recipientMap = new Map<string, MixmaxRecipient>();

    await Promise.all(
      sequences.map(async (seq) => {
        let offset = 0;
        const limit = 100;
        while (true) {
          const recipients: MixmaxApiRecipient[] = await mixmaxGet(
            `/sequences/${seq._id}/recipients?limit=${limit}&offset=${offset}`,
            apiKey
          );
          if (!Array.isArray(recipients) || recipients.length === 0) break;

          for (const r of recipients) {
            const email = r.to?.email ?? "";
            if (!email) continue;

            // Sum stats across all sent stages for this recipient
            let sent = 0, opened = 0, clicked = 0, replied = 0, bounced = 0;
            let lastSentAt: number | null = null;
            for (const stage of r.stages ?? []) {
              if (stage.state === "sent" || stage.sentAt) {
                sent++;
                opened += stage.opens ?? 0;
                clicked += stage.clicks ?? 0;
                replied += stage.replied ?? 0;
                bounced += stage.bounced ?? 0;
                if (stage.sentAt && (!lastSentAt || stage.sentAt > lastSentAt)) {
                  lastSentAt = stage.sentAt;
                }
              }
            }

            const key = `${email}::${seq._id}`;
            recipientMap.set(key, {
              email,
              name: r.to?.name ?? "",
              sent,
              opened,
              clicked,
              replied,
              bounced,
              sequenceName: seq.name,
              lastSentAt,
            });
          }

          if (recipients.length < limit) break;
          offset += limit;
        }
      })
    );

    const recipients = Array.from(recipientMap.values()).sort(
      (a, b) => b.sent - a.sent
    );

    // 3. Build totals
    const sent = recipients.reduce((s, r) => s + r.sent, 0);
    const opened = recipients.reduce((s, r) => s + r.opened, 0);
    const clicked = recipients.reduce((s, r) => s + r.clicked, 0);
    const replied = recipients.reduce((s, r) => s + r.replied, 0);
    const bounced = recipients.reduce((s, r) => s + r.bounced, 0);

    const totals: MixmaxTotals = {
      sent,
      opened,
      clicked,
      replied,
      bounced,
      openRate: sent > 0 ? Math.round((opened / sent) * 1000) / 10 : 0,
      clickRate: sent > 0 ? Math.round((clicked / sent) * 1000) / 10 : 0,
      replyRate: sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0,
    };

    const response: MixmaxInsightsResponse = { totals, recipients };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Mixmax API fetch failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
