import { corsHeaders } from '../_shared/cors.ts';

const OCR_PROMPT = `Extraia todo o texto visivel deste documento de viagem.
Retorne apenas texto bruto.
Nao invente palavras ilegiveis.
Se algo estiver ilegivel, simplesmente omita.`;

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

function extFromName(fileName: string | null | undefined) {
  if (!fileName) return '';
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

async function runOcrSpace(base64: string, mimeType: string | null) {
  const apiKey = Deno.env.get('OCR_SPACE_API_KEY');
  if (!apiKey) {
    return { text: '', error: 'OCR_SPACE_API_KEY não configurada.' };
  }

  const body = new URLSearchParams();
  body.append('apikey', apiKey);
  body.append('language', 'por');
  body.append('isOverlayRequired', 'false');
  body.append('OCREngine', '2');
  body.append('base64Image', `data:${mimeType || 'application/octet-stream'};base64,${base64}`);

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    body,
  });

  if (!res.ok) {
    return { text: '', error: `OCR.space HTTP ${res.status}` };
  }

  const json = await res.json();
  const parsed = Array.isArray(json?.ParsedResults) ? json.ParsedResults : [];
  const text = parsed.map((item: { ParsedText?: string }) => item.ParsedText || '').join('\n').trim();

  if (!text) {
    return { text: '', error: 'OCR.space sem texto extraído.' };
  }

  return { text, error: null as string | null };
}

async function runOpenAiVision(base64: string, mimeType: string | null) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return { text: '', error: 'OPENAI_API_KEY não configurada.' };
  }

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 1000,
      messages: [
        { role: 'system', content: OCR_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extraia texto bruto do documento.' },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType || 'image/png'};base64,${base64}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    return { text: '', error: `OpenAI vision falhou (${res.status}): ${raw.slice(0, 120)}` };
  }

  const json = await res.json();
  const text = (json?.choices?.[0]?.message?.content || '').trim();
  if (!text) {
    return { text: '', error: 'OpenAI vision sem texto extraído.' };
  }

  return { text, error: null as string | null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const body = await req.json();
    const fileBase64 = typeof body?.fileBase64 === 'string' ? body.fileBase64 : '';
    const fileName = typeof body?.fileName === 'string' ? body.fileName : null;
    const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : null;

    if (!fileBase64) {
      return new Response(JSON.stringify({ error: 'Arquivo base64 não informado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ext = extFromName(fileName);
    const warnings: string[] = [];

    const ocrResult = await runOcrSpace(fileBase64, mimeType);
    if (!ocrResult.error && ocrResult.text) {
      return new Response(JSON.stringify({ data: { text: ocrResult.text, method: 'ocr_space', warnings } }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    warnings.push(ocrResult.error || 'OCR.space indisponível.');
    console.error('[ocr-document]', requestId, 'ocr_space_failure', ocrResult.error);

    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext) || (mimeType || '').startsWith('image/')) {
      const vision = await runOpenAiVision(fileBase64, mimeType);
      if (!vision.error && vision.text) {
        return new Response(JSON.stringify({ data: { text: vision.text, method: 'openai_vision', warnings } }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      warnings.push(vision.error || 'OpenAI vision indisponível.');
      console.error('[ocr-document]', requestId, 'openai_vision_failure', vision.error);
    }

    return new Response(JSON.stringify({ error: 'Falha no OCR em todas as camadas.', data: { text: '', method: 'none', warnings } }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[ocr-document]', requestId, 'unexpected_error', error);
    return new Response(JSON.stringify({ error: 'Erro inesperado no OCR.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
