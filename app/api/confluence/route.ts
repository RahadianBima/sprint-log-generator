import { NextResponse } from 'next/server';

async function conFetch(url: string, options: any = {}) {
  const baseUrl = process.env.JIRA_BASE_URL || 'https://jurnal.atlassian.net';
  const email = process.env.JIRA_USER_EMAIL || '';
  const token = process.env.JIRA_API_TOKEN || '';
  const auth = Buffer.from(`${email.trim()}:${token.trim()}`).toString('base64');
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const baseUrl = process.env.JIRA_BASE_URL || 'https://jurnal.atlassian.net';

    // Fetch spaces (v2 API to get IDs)
    if (action === 'spaces') {
      const res = await conFetch(`${baseUrl}/wiki/api/v2/spaces?type=global&limit=250`);
      if (!res.ok) return NextResponse.json({ error: 'Gagal fetch spaces' }, { status: 500 });
      return NextResponse.json({
        spaces: (res.data.results || []).map((s: any) => ({
          key: s.key,
          name: s.name,
          id: s.id,
        })),
      });
    }

    // Fetch ALL pages in a space (v2 API: /spaces/{spaceId}/pages)
    if (action === 'pages') {
      const spaceKey = searchParams.get('spaceKey') || 'PD';
      // Resolve spaceKey → spaceId via v2 API (keys filter is supported)
      const spaceRes = await conFetch(`${baseUrl}/wiki/api/v2/spaces?keys=${encodeURIComponent(spaceKey)}&limit=1`);
      if (!spaceRes.ok) {
        return NextResponse.json({ error: 'Gagal cari space ID: ' + (spaceRes.data?.message || JSON.stringify(spaceRes.data).slice(0,150)) }, { status: 500 });
      }
      const spaceId = spaceRes.data.results?.[0]?.id;
      if (!spaceId) {
        return NextResponse.json({ error: 'Space tidak ditemukan: ' + spaceKey }, { status: 404 });
      }
      var allPages: any[] = [];
      var nextUrl = `${baseUrl}/wiki/api/v2/spaces/${spaceId}/pages?limit=250&status=current,draft,archived,trashed`;
      const res = await conFetch(nextUrl);
      if (!res.ok) {
        return NextResponse.json({ error: 'Gagal: ' + (res.data?.message || JSON.stringify(res.data).slice(0,150)) }, { status: 500 });
      }
      allPages = allPages.concat(res.data.results || []);
      var next = res.data._links?.next;
      for (var i = 0; i < 20 && next; i++) {
        var pgUrl = next.startsWith('http') ? next : `${baseUrl}${next}`;
        const pg = await conFetch(pgUrl);
        if (!pg.ok) break;
        allPages = allPages.concat(pg.data.results || []);
        next = pg.data._links?.next;
      }
      return NextResponse.json({ pages: allPages.map((p: any) => ({ id: p.id, title: p.title })), total: allPages.length });
    }

    return NextResponse.json({ error: 'action tidak dikenal' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { title, body, spaceKey: reqSpaceKey, parentId: reqParentId } = await request.json();
    const baseUrl = process.env.JIRA_BASE_URL || 'https://jurnal.atlassian.net';
    const spaceKey = reqSpaceKey || process.env.CONFLUENCE_SPACE_KEY || 'PD';
    const parentId = reqParentId || process.env.CONFLUENCE_PARENT_ID || '';

    const email = process.env.JIRA_USER_EMAIL || '';
    const token = process.env.JIRA_API_TOKEN || '';
    if (!email || !token) {
      return NextResponse.json(
        { error: 'JIRA_USER_EMAIL atau JIRA_API_TOKEN belum diisi di .env.local' },
        { status: 500 }
      );
    }

    // Try create page
    const payload: any = {
      type: 'page',
      title,
      space: { key: spaceKey },
      body: { storage: { value: body, representation: 'storage' } },
    };
    if (parentId) payload.ancestors = [{ id: parentId }];

    const create = await conFetch(`${baseUrl}/wiki/rest/api/content`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (create.ok) {
      return NextResponse.json({
        pageId: create.data.id,
        pageUrl: baseUrl + '/wiki' + (create.data._links?.webui || `/spaces/${spaceKey}/pages/${create.data.id}`),
      });
    }

    // If already exists, find and update
    if (create.status === 400) {
      const search = await conFetch(
        `${baseUrl}/wiki/rest/api/content?spaceKey=${spaceKey}&title=${encodeURIComponent(title)}&limit=1`
      );

      if (search.ok && search.data?.results?.[0]) {
        const existing = search.data.results[0];
        const version = existing.version?.number || 1;

        const update = await conFetch(`${baseUrl}/wiki/rest/api/content/${existing.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...payload,
            id: existing.id,
            version: { number: version + 1 },
          }),
        });

        if (update.ok) {
          return NextResponse.json({
            pageId: update.data.id,
            pageUrl: baseUrl + '/wiki' + (update.data._links?.webui || `/spaces/${spaceKey}/pages/${update.data.id}`),
          });
        }

        return NextResponse.json({ error: `Gagal update page: ${update.status} ${JSON.stringify(update.data).slice(0,200)}` }, { status: 500 });
      }
    }

    return NextResponse.json(
      { error: `Confluence ${create.status}: ${JSON.stringify(create.data).slice(0, 300)}` },
      { status: 500 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
