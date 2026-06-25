import { NextResponse } from 'next/server';

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';

export async function POST(request: Request) {
  try {
    const { system, user } = await request.json();
    const apiKey = process.env.GROQ_API_KEY || '';

    if (!apiKey) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY belum diisi di .env.local. Daftar gratis di https://console.groq.com' },
        { status: 500 }
      );
    }

    const response = await fetch(GROQ_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errData = await response.text();
      console.error('Groq API Error:', errData);
      return NextResponse.json(
        { error: `Groq API gagal: ${errData.slice(0, 200)}` },
        { status: response.status }
      );
    }

    const groqData = await response.json();
    const textContent = groqData.choices?.[0]?.message?.content || '';

    // Format sama kayak sebelumnya biar frontend gak perlu diubah
    const formattedData = {
      content: [
        {
          type: 'text',
          text: textContent,
        },
      ],
    };

    return NextResponse.json(formattedData);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
