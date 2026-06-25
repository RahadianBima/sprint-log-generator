import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';

const getJwtSecret = () => new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret-do-not-use-in-prod');

async function tryFetch(url: string, token: string) {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return new Response('Atlassian OAuth error: ' + error, { status: 400 });
    }

    if (!code) {
      return new Response('Missing authorization code', { status: 400 });
    }

    // Validate state - check cookie
    const storedState = request.headers.get('cookie')
      ?.split(';')
      .find(c => c.trim().startsWith('oauth_state='))
      ?.split('=')[1];

    if (storedState && state !== storedState) {
      return new Response('Invalid state parameter', { status: 400 });
    }

    const clientId = process.env.ATLASSIAN_CLIENT_ID;
    const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET;
    const redirectUri = process.env.ATLASSIAN_REDIRECT_URI || 'http://localhost:3000/api/auth/callback';

    if (!clientId || !clientSecret) {
      return new Response('Atlassian OAuth credentials not configured', { status: 500 });
    }

    // Exchange code for token
    const tokenRes = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return new Response('Token exchange failed: ' + text, { status: 500 });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Try multiple ways to get user email
    let email = '';
    let name = '';
    let picture = '';

    // Method 1: api.atlassian.com/me
    const meData = await tryFetch('https://api.atlassian.com/me', accessToken);
    if (meData) {
      email = meData.email || '';
      name = meData.name || meData.nickname || '';
      picture = meData.picture || '';
    }

    // Method 2: auth.atlassian.com/userinfo
    if (!email) {
      const userInfo = await tryFetch('https://auth.atlassian.com/userinfo', accessToken);
      if (userInfo) {
        email = userInfo.email || userInfo.sub || '';
        name = name || userInfo.name || userInfo.nickname || '';
      }
    }

    // Method 3: Jira REST API user/current
    if (!email) {
      const resources = await tryFetch('https://api.atlassian.com/oauth/token/accessible-resources', accessToken);
      if (resources && resources[0]?.id) {
        const jiraUser = await tryFetch(
          `https://api.atlassian.com/ex/jira/${resources[0].id}/rest/api/3/user/current`,
          accessToken
        );
        if (jiraUser) {
          email = jiraUser.emailAddress || '';
          name = name || jiraUser.displayName || '';
          picture = picture || jiraUser.avatarUrls?.['48x48'] || '';
        }
      }
    }

    // Method 4: Decode access token JWT
    if (!email) {
      try {
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        email = payload.email || payload.sub || '';
        name = name || payload.name || '';
      } catch {}
    }

    if (!email) {
      return new Response(
        '<html><body style="font-family:sans-serif;padding:40px;text-align:center">' +
        '<h2>Gagal Mendapatkan Email</h2>' +
        '<p>Tidak bisa membaca profil pengguna dari Atlassian. Coba lagi atau hubungi admin.</p>' +
        '<a href="/" style="color:#0052CC">Kembali</a></body></html>',
        { status: 500, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Extract name from email if not found
    if (!name) name = email.split('@')[0];

    // Verify @mekari
    if (!email.endsWith('@mekari.com')) {
      return new Response(
        '<html><body style="font-family:sans-serif;padding:40px;text-align:center">' +
        '<h2>Akses Ditolak</h2>' +
        '<p>Hanya pengguna dengan email <strong>@mekari.com</strong> yang dapat mengakses aplikasi ini.</p>' +
        '<p>Email Anda: ' + email + '</p>' +
        '<a href="/" style="color:#0052CC">Kembali</a></body></html>',
        { status: 403, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Create JWT session
    const sessionToken = await new SignJWT({ email, name, picture })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(getJwtSecret());

    const response = NextResponse.redirect(new URL('/', request.url).origin);

    response.cookies.set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 24 hours
    });

    response.cookies.set('oauth_state', '', { maxAge: 0, path: '/' });

    return response;
  } catch (err: any) {
    return new Response('Callback error: ' + err.message, { status: 500 });
  }
}
