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

    // Get user info
    let name = 'User';
    let picture = '';
    let accountId = '';

    // Decode access token JWT for account ID
    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1]));
      accountId = payload.sub || '';
    } catch {}

    // Try to get user name from accessible resources or /me
    const resources = await tryFetch('https://api.atlassian.com/oauth/token/accessible-resources', accessToken);
    const cloudId = resources?.[0]?.id || '';

    if (cloudId) {
      const jiraUser = await tryFetch(
        `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/user/current`,
        accessToken
      );
      if (jiraUser) {
        name = jiraUser.displayName || jiraUser.name || 'User';
        picture = jiraUser.avatarUrls?.['48x48'] || '';
      }
    }

    if (!picture) {
      const meData = await tryFetch('https://api.atlassian.com/me', accessToken);
      if (meData) {
        name = name || meData.name || meData.nickname || 'User';
        picture = meData.picture || '';
      }
    }

    // Create JWT session (no email restriction - anyone who can auth is allowed)
    const sessionToken = await new SignJWT({ name, picture, accountId })
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
