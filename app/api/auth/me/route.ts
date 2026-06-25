import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const getJwtSecret = () => new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret-do-not-use-in-prod');

export async function GET(request: Request) {
  const cookie = request.headers.get('cookie');
  const sessionCookie = cookie
    ?.split(';')
    .find(c => c.trim().startsWith('session='))
    ?.split('=')[1];

  if (!sessionCookie) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    const { payload } = await jwtVerify(sessionCookie, getJwtSecret());

    return NextResponse.json({
      authenticated: true,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
