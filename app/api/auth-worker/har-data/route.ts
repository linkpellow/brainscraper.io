/**
 * HAR Data Persistence API
 * 
 * Stores HAR file data, extracted endpoints, and automation groups per session
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDataDirectory } from '../../../../utils/dataDirectory';
import { promises as fs } from 'fs';
import path from 'path';

const HAR_DATA_DIR = 'har-data';

type HARData = {
  sessionId: string;
  harFileName: string;
  uploadedAt: number;
  artifactBundle: any; // ArtifactBundle from Step 1
  catalog: any; // EndpointCatalog from Step 2
  automationGroups: any[]; // AutomationEndpointGroup[]
};

/**
 * Get HAR data for a session
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId parameter is required' },
        { status: 400 }
      );
    }

    const dataDir = getDataDirectory();
    const harDataDir = path.join(dataDir, HAR_DATA_DIR);
    const filePath = path.join(harDataDir, `${sessionId}.json`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const harData: HARData = JSON.parse(content);
      return NextResponse.json({ success: true, data: harData });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return NextResponse.json({ success: true, data: null });
      }
      throw error;
    }
  } catch (error) {
    console.error('[HARData] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load HAR data' },
      { status: 500 }
    );
  }
}

/**
 * Save HAR data for a session
 */
export async function POST(request: NextRequest) {
  try {
    const harData: HARData = await request.json();

    if (!harData.sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const dataDir = getDataDirectory();
    const harDataDir = path.join(dataDir, HAR_DATA_DIR);

    // Ensure directory exists
    try {
      await fs.mkdir(harDataDir, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }

    const filePath = path.join(harDataDir, `${harData.sessionId}.json`);

    // Add upload timestamp if not present
    if (!harData.uploadedAt) {
      harData.uploadedAt = Date.now();
    }

    // Write to file (with error handling)
    try {
      await fs.writeFile(filePath, JSON.stringify(harData, null, 2), 'utf-8');
      console.log(`[HARData] Saved HAR data for session ${harData.sessionId} to ${filePath}`);
      console.log(`[HARData] File size: ${JSON.stringify(harData).length} bytes`);
    } catch (writeError: any) {
      console.error('[HARData] File write error:', writeError);
      throw new Error(`Failed to write file: ${writeError.message}`);
    }

    return NextResponse.json({ success: true, data: harData });
  } catch (error) {
    console.error('[HARData] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to save HAR data' },
      { status: 500 }
    );
  }
}

/**
 * Delete HAR data for a session
 */
export async function DELETE(request: NextRequest) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const dataDir = getDataDirectory();
    const harDataDir = path.join(dataDir, HAR_DATA_DIR);
    const filePath = path.join(harDataDir, `${sessionId}.json`);

    try {
      await fs.unlink(filePath);
      return NextResponse.json({ success: true });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return NextResponse.json({ success: true }); // Already deleted
      }
      throw error;
    }
  } catch (error) {
    console.error('[HARData] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete HAR data' },
      { status: 500 }
    );
  }
}

/**
 * List all HAR data files
 */
export async function PUT(request: NextRequest) {
  try {
    const dataDir = getDataDirectory();
    const harDataDir = path.join(dataDir, HAR_DATA_DIR);

    try {
      const files = await fs.readdir(harDataDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const harDataList: Array<{ sessionId: string; uploadedAt: number; harFileName: string }> = [];

      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(harDataDir, file), 'utf-8');
          const harData: HARData = JSON.parse(content);
          harDataList.push({
            sessionId: harData.sessionId,
            uploadedAt: harData.uploadedAt,
            harFileName: harData.harFileName,
          });
        } catch {
          // Skip invalid files
        }
      }

      return NextResponse.json({ success: true, data: harDataList });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return NextResponse.json({ success: true, data: [] });
      }
      throw error;
    }
  } catch (error) {
    console.error('[HARData] PUT error:', error);
    return NextResponse.json(
      { error: 'Failed to list HAR data' },
      { status: 500 }
    );
  }
}
