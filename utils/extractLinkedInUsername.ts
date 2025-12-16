/**
 * Utility to extract LinkedIn username from various URL formats
 */

export function extractLinkedInUsername(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  // Remove whitespace
  url = url.trim();

  // Common LinkedIn URL patterns:
  // https://www.linkedin.com/in/username/
  // https://linkedin.com/in/username
  // linkedin.com/in/username
  // /in/username
  // username (if it's just the username)

  const patterns = [
    /linkedin\.com\/in\/([^\/\?&#]+)/i,
    /\/in\/([^\/\?&#]+)/i,
    /^([a-z0-9-]+)$/i, // Just username
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extracts multiple usernames from an array of URLs or objects with LinkedIn URLs
 */
export function extractUsernamesFromLeads(leads: any[]): string[] {
  const usernames: string[] = [];
  const seen = new Set<string>();

  for (const lead of leads) {
    // Try various URL field names
    const urlFields = [
      'LinkedIn URL',
      'linkedin_url',
      'linkedinUrl',
      'navigationUrl',
      'profile_url',
      'profileUrl',
      'url',
      'linkedin',
    ];

    for (const field of urlFields) {
      const url = lead[field];
      if (url) {
        const username = extractLinkedInUsername(String(url));
        if (username && !seen.has(username)) {
          usernames.push(username);
          seen.add(username);
        }
      }
    }
  }

  return usernames;
}

