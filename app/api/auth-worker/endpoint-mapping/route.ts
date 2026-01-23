/**
 * Endpoint Mapping API
 * 
 * Server-side storage for endpoint mappings
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDataDirectory } from '../../../../utils/dataDirectory';
import { promises as fs } from 'fs';
import path from 'path';

const MAPPINGS_FILE = 'endpoint-mappings.json';

type EndpointMapping = {
  siteKey: string;
  automationKey: string;
  endpointSignature: {
    method: string;
    host: string;
    normalizedPathTemplate: string;
    bodyShapeHash: string;
  };
  requiredHeaders?: string[];
  contentType?: string;
  csrfHeaderName?: string;
  mappedAt: number;
};

/**
 * Get all mappings
 */
export async function GET(request: NextRequest) {
  try {
    const dataDir = getDataDirectory();
    const mappingsPath = path.join(dataDir, MAPPINGS_FILE);
    
    try {
      const content = await fs.readFile(mappingsPath, 'utf-8');
      const mappings: EndpointMapping[] = JSON.parse(content);
      return NextResponse.json({ mappings });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, return empty array
        return NextResponse.json({ mappings: [] });
      }
      throw error;
    }
  } catch (error) {
    console.error('[EndpointMapping] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load mappings' },
      { status: 500 }
    );
  }
}

/**
 * Save a mapping
 */
export async function POST(request: NextRequest) {
  try {
    const mapping: EndpointMapping = await request.json();
    
    const dataDir = getDataDirectory();
    const mappingsPath = path.join(dataDir, MAPPINGS_FILE);
    
    // Read existing mappings
    let mappings: EndpointMapping[] = [];
    try {
      const content = await fs.readFile(mappingsPath, 'utf-8');
      mappings = JSON.parse(content);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    
    // Check if mapping already exists (same site + automation key)
    const existingIndex = mappings.findIndex(
      m => m.siteKey === mapping.siteKey && m.automationKey === mapping.automationKey
    );
    
    if (existingIndex >= 0) {
      // Update existing mapping
      mappings[existingIndex] = mapping;
    } else {
      // Add new mapping
      mappings.push(mapping);
    }
    
    // Write back to file
    await fs.writeFile(mappingsPath, JSON.stringify(mappings, null, 2), 'utf-8');
    
    return NextResponse.json({ success: true, mapping });
  } catch (error) {
    console.error('[EndpointMapping] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to save mapping' },
      { status: 500 }
    );
  }
}

/**
 * Delete a mapping
 */
export async function DELETE(request: NextRequest) {
  try {
    const { siteKey, automationKey } = await request.json();
    
    if (!siteKey || !automationKey) {
      return NextResponse.json(
        { error: 'siteKey and automationKey are required' },
        { status: 400 }
      );
    }
    
    const dataDir = getDataDirectory();
    const mappingsPath = path.join(dataDir, MAPPINGS_FILE);
    
    // Read existing mappings
    let mappings: EndpointMapping[] = [];
    try {
      const content = await fs.readFile(mappingsPath, 'utf-8');
      mappings = JSON.parse(content);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    
    // Remove mapping
    mappings = mappings.filter(
      m => !(m.siteKey === siteKey && m.automationKey === automationKey)
    );
    
    // Write back to file
    await fs.writeFile(mappingsPath, JSON.stringify(mappings, null, 2), 'utf-8');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[EndpointMapping] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete mapping' },
      { status: 500 }
    );
  }
}
