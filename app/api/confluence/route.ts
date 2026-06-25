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

    // Fetch spaces
    if (action === 'spaces') {
      const res = await conFetch(`${baseUrl}/wiki/rest/api/space?type=global&limit=100`);
      if (!res.ok) return NextResponse.json({ error: 'Gagal fetch spaces' }, { status: 500 });
      return NextResponse.json({
        spaces: (res.data.results || []).map((s: any) => ({
          key: s.key,
          name: s.name,
        })),
      });
    }

    // Fetch ALL pages in a space via CQL search (reliable across all Confluence instances)
    if (action === 'pages') {
      const spaceKey = searchParams.get('spaceKey') || 'PD';
      var allPages: any[] = [];
      var cql = `space=${encodeURIComponent(spaceKey)} AND type=page`;
      var searchUrl = `${baseUrl}/wiki/rest/api/search?cql=${encodeURIComponent(cql)}&limit=250`;
      // sort by id (ascending) so top-level pages come first (doesn't work on all instances, best effort)
      const res = await conFetch(searchUrl + '&sort=id');
      if (!res.ok) {
        // fallback: try without sort
        const fb = await conFetch(searchUrl);
        if (!fb.ok) return NextResponse.json({ error: 'Gagal: ' + (res.data?.message || JSON.stringify(res.data).slice(0,150)) + ' | ' + (fb.data?.message || JSON.stringify(fb.data).slice(0,150)) }, { status: 500 });
        allPages = fb.data.results || [];
      } else {
        allPages = res.data.results || [];
        var next = res.data._links?.next;
        for (var i = 0; i < 5 && next; i++) {
          var pgUrl = next.startsWith('http') ? next : `${baseUrl}${next}`;
          const pg = await conFetch(pgUrl);
          if (!pg.ok) break;
          allPages = allPages.concat(pg.data.results || []);
          next = pg.data._links?.next;
        }
      }
      return NextResponse.json({ pages: allPages.map((p: any) => ({ id: p.content.id, title: p.title })) });
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
