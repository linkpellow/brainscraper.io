/**
 * Debug endpoint to check auth worker file locations
 */

import { NextResponse } from 'next/server';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

export async function GET() {
  try {
    const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
    const authWorkersDir = join(DATA_DIR, 'auth-workers');
    const buildDir = join(process.cwd(), 'data', 'auth-workers');

    const result: any = {
      DATA_DIR,
      authWorkersDir,
      buildDir,
      dataDirExists: existsSync(DATA_DIR),
      authWorkersDirExists: existsSync(authWorkersDir),
      buildDirExists: existsSync(buildDir),
    };

    if (existsSync(authWorkersDir)) {
      const files = readdirSync(authWorkersDir).filter(f => f.endsWith('.json'));
      result.authWorkersFiles = files;
      result.authWorkersFileCount = files.length;

      // Try to read first file
      if (files.length > 0) {
        try {
          const firstFile = join(authWorkersDir, files[0]);
          const content = readFileSync(firstFile, 'utf-8');
          const session = JSON.parse(content);
          result.firstFile = {
            filename: files[0],
            sessionId: session.sessionId,
            stabilized: session.stabilized,
            version: session.version,
            targetDomain: session.targetDomain,
          };
        } catch (e: any) {
          result.firstFileError = e.message;
        }
      }
    }

    if (existsSync(buildDir)) {
      const buildFiles = readdirSync(buildDir).filter(f => f.endsWith('.json'));
      result.buildFiles = buildFiles;
      result.buildFileCount = buildFiles.length;
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
