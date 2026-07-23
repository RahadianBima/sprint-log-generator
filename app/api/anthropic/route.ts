import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { system, user } = await request.json();
    const apiKey = process.env.ANTHROPIC_API_KEY || '';

    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not set in .env.local. Get your key at https://console.anthropic.com' },
        { status: 500 }
      );
    }

    const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        temperature: 0.1,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });

    if (!response.ok) {
      const errData = await response.text();
      console.error('Anthropic API Error:', errData);
      return NextResponse.json(
        { error: `Anthropic API error: ${errData.slice(0, 200)}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const textContent = (data.content || [])
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('');

    return NextResponse.json({ content: [{ type: 'text', text: textContent }] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
