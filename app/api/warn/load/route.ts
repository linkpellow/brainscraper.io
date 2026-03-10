import { NextRequest, NextResponse } from 'next/server';
import { getDataFilePath, safeReadFile } from '@/utils/dataDirectory';

export async function GET(request: NextRequest) {
  const pathParam = request.nextUrl.searchParams.get('path');
  if (!pathParam || pathParam.includes('..')) {
    return NextResponse.json(
      { success: false, error: 'Invalid or missing path' },
      { status: 400 }
    );
  }
  const normalized = pathParam.replace(/^warn\/?/, 'warn/');
  if (!normalized.startsWith('warn/') || !normalized.endsWith('.json')) {
    return NextResponse.json(
      { success: false, error: 'Path must be warn/<filename>.json' },
      { status: 400 }
    );
  }

  try {
    const filePath = getDataFilePath(normalized);
    const raw = safeReadFile(filePath);
    if (!raw) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }
    const data = JSON.parse(raw);
    const rows = data.rows ?? [];
    return NextResponse.json({ success: true, data: { rows, meta: data.meta } });
  } catch (error) {
    console.error('[warn/load]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Load failed' },
      { status: 500 }
    );
  }
}
