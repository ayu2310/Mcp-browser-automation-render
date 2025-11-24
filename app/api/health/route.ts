import { NextResponse } from 'next/server';

export async function GET() {
  const browserbaseApiKey = process.env.BROWSERBASE_API_KEY;
  const browserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID;
  const modelApiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? process.env.MODEL_API_KEY;

  const environment = {
    browserbaseApiKey: browserbaseApiKey
      ? `configured (starts with ${browserbaseApiKey.substring(0, 3)})`
      : 'missing',
    browserbaseProjectId: browserbaseProjectId ?? 'missing',
    modelApiKey: modelApiKey ? 'configured' : 'missing',
    statelessReplay: 'enabled',
  };

  return NextResponse.json({
    status: browserbaseApiKey && browserbaseProjectId ? 'ok' : 'degraded',
    mcp: 'ready',
    endpoint: '/api/mcp',
    timestamp: new Date().toISOString(),
    environment,
  });
}