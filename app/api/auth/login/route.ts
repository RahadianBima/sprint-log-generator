import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

export async function GET() {
  const clientId = process.env.ATLASSIAN_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: 'ATLASSIAN_CLIENT_ID not configured' }, { status: 500 });

  // Generate state for CSRF protection
  const state = randomBytes(16).toString('hex');

  const redirectUri = process.env.ATLASSIAN_REDIRECT_URI || 'http://localhost:3000/api/auth/callback';

  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: clientId,
    scope: 'read:jira-user email openid',
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    prompt: 'consent',
  });

  const response = NextResponse.redirect(`https://auth.atlassian.com/authorize?${params}`);

  // Store state in cookie for CSRF validation in callback
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
  });

  return response;
}
