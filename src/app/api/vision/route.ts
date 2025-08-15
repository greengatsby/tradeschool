import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type VisionBody = {
  imageBase64: string; // data URL or raw base64
  question: string; // what the agent wants to know
};

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Expected application/json' }, { status: 400 });
    }

    const body = (await req.json()) as VisionBody;
    const { imageBase64, question } = body || {} as VisionBody;

    if (!imageBase64) return NextResponse.json({ error: 'Missing imageBase64' }, { status: 400 });
    if (!question) return NextResponse.json({ error: 'Missing question' }, { status: 400 });

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!OPENAI_API_KEY) {
      // Fallback mock if no key is configured
      const mockAnswer = `Mock vision answer to: ${question}`;
      return NextResponse.json({ answer: mockAnswer, mock: true });
    }

    // If client sent raw base64, convert to data URL; otherwise pass-through
    const isDataUrl = imageBase64.startsWith('data:');
    const dataUrl = isDataUrl ? imageBase64 : `data:image/png;base64,${imageBase64}`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: question },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 100,
        temperature: 0.2,
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      return NextResponse.json({ error: 'Vision LLM error', details: err }, { status: openaiRes.status });
    }

    const json = await openaiRes.json();
    const answer: string = json?.choices?.[0]?.message?.content || '';
    return NextResponse.json({ answer });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Vision analysis failed' }, { status: 500 });
  }
}


