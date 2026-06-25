import { NextResponse } from 'next/server';

export async function GET() {
  const response = NextResponse.redirect(new URL('/', process.env.BASE_URL || 'http://localhost:3000'));
  response.cookies.set('session', '', { maxAge: 0, path: '/' });
  return response;
}
