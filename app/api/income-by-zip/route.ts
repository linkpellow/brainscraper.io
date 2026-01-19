import { NextRequest, NextResponse } from 'next/server';
import { fetchIncomeByZipWithFallback } from '@/utils/censusAPI';

/**
 * Household Income by Zip Code API endpoint
 * 
 * Primary: US Census API (direct, free)
 * Fallback: RapidAPI household-income-by-zip-code
 * 
 * Environment variables:
 * - US_CENSUS_API_KEY: US Census Bureau API key (required)
 * - RAPIDAPI_KEY: RapidAPI key (optional, for fallback)
 */

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const zipCode = searchParams.get('zip');

    if (!zipCode) {
      return NextResponse.json(
        { error: 'Zip code parameter is required' },
        { status: 400 }
      );
    }

    // Get API keys from environment variables
    const US_CENSUS_API_KEY = process.env.US_CENSUS_API_KEY;
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!US_CENSUS_API_KEY) {
      return NextResponse.json(
        { error: 'US_CENSUS_API_KEY not configured. Please add it to your .env.local file' },
        { status: 500 }
      );
    }

    // Fetch income data (Census API primary, RapidAPI fallback)
    const incomeData = await fetchIncomeByZipWithFallback(
      zipCode,
      US_CENSUS_API_KEY,
      RAPIDAPI_KEY
    );

    if (!incomeData || !incomeData.medianIncome) {
      return NextResponse.json(
        { 
          error: 'Income data not available for this ZIP code',
          zipCode,
        },
        { status: 404 }
      );
    }

    // Return standardized format
    return NextResponse.json({
      zipCode: incomeData.zipCode,
      medianIncome: incomeData.medianIncome,
      median_income: incomeData.medianIncome, // Alias for compatibility
      householdIncome: incomeData.medianIncome, // Alias for compatibility
      year: incomeData.year,
      source: incomeData.source,
      data: {
        medianIncome: incomeData.medianIncome,
        median_income: incomeData.medianIncome,
        householdIncome: incomeData.medianIncome,
        zipCode: incomeData.zipCode,
        year: incomeData.year,
        source: incomeData.source,
      },
    });
  } catch (error) {
    console.error('Income by zip API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { zip } = body;

    if (!zip) {
      return NextResponse.json(
        { error: 'Zip code is required in request body' },
        { status: 400 }
      );
    }

    // Get API keys from environment variables
    const US_CENSUS_API_KEY = process.env.US_CENSUS_API_KEY;
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!US_CENSUS_API_KEY) {
      return NextResponse.json(
        { error: 'US_CENSUS_API_KEY not configured. Please add it to your .env.local file' },
        { status: 500 }
      );
    }

    // Fetch income data (Census API primary, RapidAPI fallback)
    const incomeData = await fetchIncomeByZipWithFallback(
      zip,
      US_CENSUS_API_KEY,
      RAPIDAPI_KEY
    );

    if (!incomeData || !incomeData.medianIncome) {
      return NextResponse.json(
        { 
          error: 'Income data not available for this ZIP code',
          zipCode: zip,
        },
        { status: 404 }
      );
    }

    // Return standardized format
    return NextResponse.json({
      zipCode: incomeData.zipCode,
      medianIncome: incomeData.medianIncome,
      median_income: incomeData.medianIncome, // Alias for compatibility
      householdIncome: incomeData.medianIncome, // Alias for compatibility
      year: incomeData.year,
      source: incomeData.source,
      data: {
        medianIncome: incomeData.medianIncome,
        median_income: incomeData.medianIncome,
        householdIncome: incomeData.medianIncome,
        zipCode: incomeData.zipCode,
        year: incomeData.year,
        source: incomeData.source,
      },
    });
  } catch (error) {
    console.error('Income by zip API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

