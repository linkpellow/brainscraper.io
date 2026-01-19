#!/usr/bin/env node
/**
 * CLI interface for Network Inspector
 */

import * as fs from 'fs';
import * as path from 'path';
import { processHarFile } from './index';

interface CliOptions {
  har: string;
  out: string;
  top?: number;
  'phase-map'?: string;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: Partial<CliOptions> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.substring(2).replace(/-/g, '-') as keyof CliOptions;
      const nextArg = args[i + 1];

      if (key === 'har' || key === 'out' || key === 'phase-map') {
        if (nextArg && !nextArg.startsWith('--')) {
          options[key] = nextArg;
          i++;
        } else {
          throw new Error(`Missing value for --${key}`);
        }
      } else if (key === 'top') {
        if (nextArg && !nextArg.startsWith('--')) {
          options.top = parseInt(nextArg, 10);
          i++;
        } else {
          throw new Error(`Missing value for --top`);
        }
      }
    }
  }

  if (!options.har) {
    throw new Error('--har is required');
  }

  if (!options.out) {
    throw new Error('--out is required');
  }

  return options as CliOptions;
}

async function main() {
  try {
    const options = parseArgs();

    // Validate HAR file exists
    if (!fs.existsSync(options.har)) {
      throw new Error(`HAR file not found: ${options.har}`);
    }

    // Create output directory if it doesn't exist
    if (!fs.existsSync(options.out)) {
      fs.mkdirSync(options.out, { recursive: true });
    }

    console.log('🔍 Network Inspector');
    console.log('');
    console.log(`📁 Input: ${options.har}`);
    console.log(`📤 Output: ${options.out}`);
    if (options.top) {
      console.log(`📊 Top N: ${options.top}`);
    }
    if (options['phase-map']) {
      console.log(`🗺️  Phase Map: ${options['phase-map']}`);
    }
    console.log('');

    console.log('Processing HAR file...');
    const { events, summaries } = await processHarFile(options.har, options.out, {
      topN: options.top,
      phaseMapPath: options['phase-map'],
    });

    console.log('');
    console.log('✅ Processing complete!');
    console.log('');
    console.log(`📊 Total requests: ${events.length}`);
    console.log(`🔗 Unique endpoints: ${summaries.length}`);
    console.log(`⭐ High-importance endpoints: ${summaries.filter((s) => s.score > 0).length}`);
    console.log('');
    console.log(`📄 Reports generated:`);
    console.log(`   - ${path.join(options.out, 'important_endpoints.json')}`);
    console.log(`   - ${path.join(options.out, 'network_dedupe_report.md')}`);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
