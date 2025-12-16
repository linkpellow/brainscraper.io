import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { getDataFilePath, safeReadFile, ensureDataDirectory } from '@/utils/dataDirectory';

/**
 * API endpoint to restore leads from the saved text file
 * Returns the restored leads data
 */
export async function GET(request: NextRequest) {
  try {
    ensureDataDirectory();
    const restoredLeadsPath = getDataFilePath('restored-leads.json');
    
    const fileContent = safeReadFile(restoredLeadsPath);
    if (!fileContent) {
      return NextResponse.json(
        { success: false, error: 'Restored leads file not found. Please run the restore script first.' },
        { status: 404 }
      );
    }
    
    const leads = JSON.parse(fileContent);
    
    return NextResponse.json({
      success: true,
      leads,
      count: leads.length,
    });
  } catch (error) {
    console.error('Error restoring leads:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint to restore leads directly to the response
 */
export async function POST(request: NextRequest) {
  try {
    ensureDataDirectory();
    const restoredLeadsPath = getDataFilePath('restored-leads.json');
    
    const fileContent = safeReadFile(restoredLeadsPath);
    if (!fileContent) {
      return NextResponse.json(
        { success: false, error: 'Restored leads file not found. Please run the restore script first.' },
        { status: 404 }
      );
    }
    
    const leads = JSON.parse(fileContent);
    
    return NextResponse.json({
      success: true,
      enrichedLeads: leads,
      count: leads.length,
    });
  } catch (error) {
    console.error('Error restoring leads:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
