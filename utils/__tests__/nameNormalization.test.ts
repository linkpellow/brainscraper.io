/**
 * Comprehensive Test Suite for Name Normalization Service
 */

import { 
  normalizeName, 
  quickNormalize, 
  recoverLastNameFromEmail,
  normalizeNameWithEmail 
} from '../nameNormalization';

describe('NameNormalizationService', () => {
  describe('Edge Cases from Requirements', () => {
    test('"Dr. Sally Spencer-Thomas" -> First: Sally, Last: Spencer-Thomas, Title: Dr.', () => {
      const result = normalizeName('Dr. Sally Spencer-Thomas');
      expect(result.firstName).toBe('Sally');
      expect(result.lastName).toBe('Spencer-Thomas');
      expect(result.prefix).toBe('Dr.');
      expect(result.suffixes).toEqual([]);
      expect(result.cleanFullName).toBe('Sally Spencer-Thomas');
    });

    test('"Gary Montague ⚡️" -> First: Gary, Last: Montague', () => {
      const result = normalizeName('Gary Montague ⚡️');
      expect(result.firstName).toBe('Gary');
      expect(result.lastName).toBe('Montague');
      expect(result.prefix).toBeUndefined();
      expect(result.suffixes).toEqual([]);
      expect(result.cleanFullName).toBe('Gary Montague');
    });

    test('"Christopher M. Bennett" -> First: Christopher, Last: Bennett', () => {
      const result = normalizeName('Christopher M. Bennett');
      expect(result.firstName).toBe('Christopher');
      expect(result.lastName).toBe('Bennett');
      expect(result.prefix).toBeUndefined();
      expect(result.suffixes).toEqual([]);
      expect(result.cleanFullName).toBe('Christopher Bennett');
    });

    test('"John Doe, MD, PhD" -> First: John, Last: Doe, Suffixes: [MD, PhD]', () => {
      const result = normalizeName('John Doe, MD, PhD');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.prefix).toBeUndefined();
      expect(result.suffixes).toContain('MD');
      expect(result.suffixes).toContain('PhD');
      expect(result.cleanFullName).toBe('John Doe');
    });

    test('"JB Miller" -> First: JB, Last: Miller', () => {
      const result = normalizeName('JB Miller');
      expect(result.firstName).toBe('JB');
      expect(result.lastName).toBe('Miller');
      expect(result.prefix).toBeUndefined();
      expect(result.suffixes).toEqual([]);
      expect(result.cleanFullName).toBe('JB Miller');
    });
  });

  describe('Emoji & Noise Removal', () => {
    test('Removes emojis from name', () => {
      const result = normalizeName('John 🚀 Smith ⚡️');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
      expect(result.cleanFullName).toBe('John Smith');
    });

    test('Removes various emoji types', () => {
      const result = normalizeName('Jane 🟢 Doe 🎯');
      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Doe');
    });

    test('Removes special symbols', () => {
      const result = normalizeName('Bob ★ Johnson');
      expect(result.firstName).toBe('Bob');
      expect(result.lastName).toBe('Johnson');
    });

    test('Handles multiple spaces', () => {
      const result = normalizeName('John    Smith');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
    });
  });

  describe('Prefix/Title Stripping', () => {
    test('Removes Dr. prefix', () => {
      const result = normalizeName('Dr. John Smith');
      expect(result.prefix).toBe('Dr.');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
    });

    test('Removes Dr prefix without period', () => {
      const result = normalizeName('Dr John Smith');
      expect(result.prefix).toBe('Dr.');
      expect(result.firstName).toBe('John');
    });

    test('Removes Professor prefix', () => {
      const result = normalizeName('Professor Jane Doe');
      expect(result.prefix).toBe('Professor');
      expect(result.firstName).toBe('Jane');
    });

    test('Removes Prof. prefix', () => {
      const result = normalizeName('Prof. Jane Doe');
      expect(result.prefix).toBe('Prof.');
      expect(result.firstName).toBe('Jane');
    });

    test('Removes Hon. prefix', () => {
      const result = normalizeName('Hon. Robert Brown');
      expect(result.prefix).toBe('Hon.');
      expect(result.firstName).toBe('Robert');
    });

    test('Removes Sir prefix', () => {
      const result = normalizeName('Sir David Williams');
      expect(result.prefix).toBe('Sir');
      expect(result.firstName).toBe('David');
    });

    test('Case insensitive prefix matching', () => {
      const result = normalizeName('dr. mary jones');
      expect(result.prefix).toBe('Dr.');
      expect(result.firstName).toBe('mary');
    });
  });

  describe('Middle Initial Removal', () => {
    test('Removes single letter middle initial', () => {
      const result = normalizeName('John M Smith');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
      expect(result.cleanFullName).toBe('John Smith');
    });

    test('Removes middle initial with period', () => {
      const result = normalizeName('John M. Smith');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
    });

    test('Removes multiple middle initials', () => {
      const result = normalizeName('John M. A. Smith');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
    });

    test('Preserves multi-character middle names', () => {
      const result = normalizeName('John Michael Smith');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
      // Middle name should be preserved in cleanFullName
      expect(result.cleanFullName).toContain('Michael');
    });
  });

  describe('Suffix Extraction', () => {
    test('Extracts MD suffix', () => {
      const result = normalizeName('John Smith MD');
      expect(result.suffixes).toContain('MD');
      expect(result.lastName).toBe('Smith');
    });

    test('Extracts multiple comma-separated suffixes', () => {
      const result = normalizeName('John Smith, MD, PhD');
      expect(result.suffixes).toContain('MD');
      expect(result.suffixes).toContain('PhD');
    });

    test('Extracts DDS suffix', () => {
      const result = normalizeName('Jane Doe DDS');
      expect(result.suffixes).toContain('DDS');
    });

    test('Extracts PhD suffix', () => {
      const result = normalizeName('Robert Brown PhD');
      expect(result.suffixes).toContain('PhD');
    });

    test('Extracts MBA suffix', () => {
      const result = normalizeName('Alice Johnson MBA');
      expect(result.suffixes).toContain('MBA');
    });

    test('Extracts CPA suffix', () => {
      const result = normalizeName('Bob Wilson CPA');
      expect(result.suffixes).toContain('CPA');
    });

    test('Extracts RN suffix', () => {
      const result = normalizeName('Mary Davis RN');
      expect(result.suffixes).toContain('RN');
    });

    test('Extracts JD suffix', () => {
      const result = normalizeName('Tom Anderson JD');
      expect(result.suffixes).toContain('JD');
    });

    test('Extracts PMP suffix', () => {
      const result = normalizeName('Sarah Lee PMP');
      expect(result.suffixes).toContain('PMP');
    });

    test('Extracts CFA suffix', () => {
      const result = normalizeName('Mike Taylor CFA');
      expect(result.suffixes).toContain('CFA');
    });

    test('Extracts PE suffix', () => {
      const result = normalizeName('David White PE');
      expect(result.suffixes).toContain('PE');
    });

    test('Extracts LSSGB suffix', () => {
      const result = normalizeName('Lisa Green LSSGB');
      expect(result.suffixes).toContain('LSSGB');
    });

    test('Handles suffixes with periods', () => {
      const result = normalizeName('John Smith M.D.');
      expect(result.suffixes.length).toBeGreaterThan(0);
    });
  });

  describe('Hyphenated Names', () => {
    test('Preserves hyphenated last name', () => {
      const result = normalizeName('John Spencer-Thomas');
      expect(result.lastName).toBe('Spencer-Thomas');
    });

    test('Preserves hyphenated last name with prefix', () => {
      const result = normalizeName('Dr. Mary Smith-Jones');
      expect(result.lastName).toBe('Smith-Jones');
      expect(result.prefix).toBe('Dr.');
    });

    test('Preserves hyphenated last name with suffix', () => {
      const result = normalizeName('Robert Brown-Wilson MD');
      expect(result.lastName).toBe('Brown-Wilson');
      expect(result.suffixes).toContain('MD');
    });

    test('Handles hyphenated first name', () => {
      const result = normalizeName('Mary-Jane Watson');
      expect(result.firstName).toBe('Mary-Jane');
      expect(result.lastName).toBe('Watson');
    });
  });

  describe('Initial-Only Names', () => {
    test('Preserves JB as first name', () => {
      const result = normalizeName('JB Miller');
      expect(result.firstName).toBe('JB');
      expect(result.lastName).toBe('Miller');
    });

    test('Preserves TJ as first name', () => {
      const result = normalizeName('TJ Johnson');
      expect(result.firstName).toBe('TJ');
      expect(result.lastName).toBe('Johnson');
    });

    test('Preserves AJ as first name', () => {
      const result = normalizeName('AJ Smith');
      expect(result.firstName).toBe('AJ');
      expect(result.lastName).toBe('Smith');
    });

    test('Preserves three-letter initial name', () => {
      const result = normalizeName('JFK O\'Brien');
      expect(result.firstName).toBe('JFK');
      expect(result.lastName).toBe('O\'Brien');
    });

    test('Removes single letter middle initial even with initial-only first name', () => {
      const result = normalizeName('JB M. Miller');
      expect(result.firstName).toBe('JB');
      expect(result.lastName).toBe('Miller');
    });
  });

  describe('Complex Real-World Cases', () => {
    test('Handles full professional name', () => {
      const result = normalizeName('Dr. John M. Smith, MD, PhD');
      expect(result.prefix).toBe('Dr.');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
      expect(result.suffixes).toContain('MD');
      expect(result.suffixes).toContain('PhD');
    });

    test('Handles name with emoji and suffix', () => {
      const result = normalizeName('Jane 🚀 Doe ⚡️ MBA');
      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Doe');
      expect(result.suffixes).toContain('MBA');
    });

    test('Handles name with prefix, middle initial, and suffix', () => {
      const result = normalizeName('Prof. Robert A. Johnson, CPA');
      expect(result.prefix).toBe('Prof.');
      expect(result.firstName).toBe('Robert');
      expect(result.lastName).toBe('Johnson');
      expect(result.suffixes).toContain('CPA');
    });

    test('Handles generational suffixes', () => {
      const result = normalizeName('John Smith Jr.');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
      expect(result.suffixes).toContain('Jr.');
    });

    test('Handles name with Jr. and professional suffix', () => {
      const result = normalizeName('John Smith Jr. MD');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
      expect(result.suffixes.length).toBeGreaterThan(0);
    });

    test('Handles apostrophes in names', () => {
      const result = normalizeName("Mary O'Brien");
      expect(result.firstName).toBe('Mary');
      expect(result.lastName).toBe("O'Brien");
    });

    test('Handles empty string', () => {
      const result = normalizeName('');
      expect(result.firstName).toBe('');
      expect(result.lastName).toBe('');
      expect(result.suffixes).toEqual([]);
    });

    test('Handles null/undefined gracefully', () => {
      const result1 = normalizeName(null as any);
      const result2 = normalizeName(undefined as any);
      expect(result1.firstName).toBe('');
      expect(result2.firstName).toBe('');
    });

    test('Handles single name', () => {
      const result = normalizeName('Madonna');
      expect(result.firstName).toBe('Madonna');
      expect(result.lastName).toBe('');
    });

    test('Handles name with only prefix', () => {
      const result = normalizeName('Dr. ');
      expect(result.prefix).toBe('Dr.');
      expect(result.firstName).toBe('');
    });
  });

  describe('Quick Normalize Function', () => {
    test('Returns only first and last name', () => {
      const result = quickNormalize('Dr. John M. Smith, MD');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
    });
  });

  describe('Real LinkedIn Name Patterns', () => {
    test('Handles LinkedIn profile with emoji', () => {
      const result = normalizeName('Sarah Johnson 🚀');
      expect(result.firstName).toBe('Sarah');
      expect(result.lastName).toBe('Johnson');
    });

    test('Handles name with status indicator', () => {
      const result = normalizeName('Mike Davis 🟢');
      expect(result.firstName).toBe('Mike');
      expect(result.lastName).toBe('Davis');
    });

    test('Handles name with multiple credentials', () => {
      const result = normalizeName('Dr. Lisa Chen, MD, MBA, PMP');
      expect(result.prefix).toBe('Dr.');
      expect(result.firstName).toBe('Lisa');
      expect(result.lastName).toBe('Chen');
      expect(result.suffixes.length).toBeGreaterThanOrEqual(3);
    });

    test('Handles compound credentials', () => {
      const result = normalizeName('John Smith MD/MPH');
      expect(result.suffixes.length).toBeGreaterThan(0);
    });
  });

  describe('Last Name Recovery from Email', () => {
    describe('Exact Match Pattern', () => {
      test('Recovers "Yemmingway" from "ralphyemmingway@gmail.com"', () => {
        const recovered = recoverLastNameFromEmail('Ralph', 'Y.', 'ralphyemmingway@gmail.com');
        expect(recovered).toBe('Yemmingway');
      });

      test('Recovers "Montague" from "garymontague77@gmail.com"', () => {
        const recovered = recoverLastNameFromEmail('Gary', 'M.', 'garymontague77@gmail.com');
        expect(recovered).toBe('Montague');
      });

      test('Handles case insensitivity', () => {
        const recovered = recoverLastNameFromEmail('RALPH', 'y', 'RALPHYEMMINGWAY@GMAIL.COM');
        expect(recovered).toBe('Yemmingway');
      });
    });

    describe('Initial Match Pattern', () => {
      test('Recovers "Yemmingway" from "ryemmingway@yahoo.com"', () => {
        const recovered = recoverLastNameFromEmail('Ralph', 'Y.', 'ryemmingway@yahoo.com');
        expect(recovered).toBe('Yemmingway');
      });

      test('Recovers "Doe" from "jdoe@company.com"', () => {
        const recovered = recoverLastNameFromEmail('John', 'D.', 'jdoe@company.com');
        expect(recovered).toBe('Doe');
      });

      test('Recovers "Smith" from "jsmith123@gmail.com"', () => {
        const recovered = recoverLastNameFromEmail('John', 'S.', 'jsmith123@gmail.com');
        expect(recovered).toBe('Smith');
      });
    });

    describe('Separator Pattern', () => {
      test('Recovers from dot separator "ralph.yemmingway@gmail.com"', () => {
        const recovered = recoverLastNameFromEmail('Ralph', 'Y.', 'ralph.yemmingway@gmail.com');
        expect(recovered).toBe('Yemmingway');
      });

      test('Recovers from underscore separator "john_doe@company.com"', () => {
        const recovered = recoverLastNameFromEmail('John', 'D.', 'john_doe@company.com');
        expect(recovered).toBe('Doe');
      });

      test('Recovers from hyphen separator "gary-montague@gmail.com"', () => {
        const recovered = recoverLastNameFromEmail('Gary', 'M.', 'gary-montague@gmail.com');
        expect(recovered).toBe('Montague');
      });
    });

    describe('Validation Rules', () => {
      test('Requires single character last initial', () => {
        const recovered = recoverLastNameFromEmail('John', 'Smith', 'jsmith@gmail.com');
        expect(recovered).toBe('');
      });

      test('Requires email to be present', () => {
        const recovered = recoverLastNameFromEmail('John', 'D.', '');
        expect(recovered).toBe('');
      });

      test('Validates recovered name starts with correct initial', () => {
        const recovered = recoverLastNameFromEmail('John', 'D.', 'jsmith@gmail.com');
        expect(recovered).toBe(''); // Should fail because 'S' != 'D'
      });

      test('Requires minimum length (3+ characters)', () => {
        const recovered = recoverLastNameFromEmail('John', 'D.', 'jd@gmail.com');
        expect(recovered).toBe(''); // "d" is too short
      });

      test('Handles "Initial + Initial" case (ry@gmail.com)', () => {
        const recovered = recoverLastNameFromEmail('Ralph', 'Y.', 'ry@gmail.com');
        expect(recovered).toBe(''); // "y" is too short
      });
    });

    describe('Noise Removal', () => {
      test('Removes numeric suffixes', () => {
        const recovered = recoverLastNameFromEmail('Gary', 'M.', 'garymontague77@gmail.com');
        expect(recovered).toBe('Montague');
      });

      test('Removes common noise suffixes like "hired"', () => {
        const recovered = recoverLastNameFromEmail('John', 'D.', 'jdoehired@gmail.com');
        expect(recovered).toBe('Doe');
      });

      test('Removes "work" suffix', () => {
        const recovered = recoverLastNameFromEmail('John', 'D.', 'jdoework@gmail.com');
        expect(recovered).toBe('Doe');
      });

      test('Removes "123" suffix', () => {
        const recovered = recoverLastNameFromEmail('John', 'D.', 'jdoe123@gmail.com');
        expect(recovered).toBe('Doe');
      });
    });

    describe('Company Email Handling', () => {
      test('Only looks at prefix, ignores domain', () => {
        const recovered = recoverLastNameFromEmail('Ralph', 'Y.', 'ralph.y@salesforce.com');
        expect(recovered).toBe(''); // Should not recover anything - "y" is just the initial, not a full name
      });

      test('Handles company email with proper name', () => {
        const recovered = recoverLastNameFromEmail('John', 'D.', 'john.doe@company.com');
        expect(recovered).toBe('Doe');
      });
    });

    describe('Edge Cases', () => {
      test('Handles empty first name', () => {
        const recovered = recoverLastNameFromEmail('', 'D.', 'jdoe@gmail.com');
        expect(recovered).toBe('');
      });

      test('Handles invalid email format', () => {
        const recovered = recoverLastNameFromEmail('John', 'D.', 'notanemail');
        expect(recovered).toBe('');
      });

      test('Handles email with no prefix', () => {
        const recovered = recoverLastNameFromEmail('John', 'D.', '@company.com');
        expect(recovered).toBe('');
      });

      test('Handles very short email prefix', () => {
        const recovered = recoverLastNameFromEmail('John', 'D.', 'jd@company.com');
        expect(recovered).toBe(''); // Too short
      });
    });

    describe('Integration with normalizeNameWithEmail', () => {
      test('Automatically recovers last name when email provided', () => {
        const result = normalizeNameWithEmail('Ralph Y.', 'ralphyemmingway@gmail.com');
        expect(result.firstName).toBe('Ralph');
        expect(result.lastName).toBe('Yemmingway');
        expect(result.recoveredLastName).toBe(true);
      });

      test('Does not recover if last name is not an initial', () => {
        const result = normalizeNameWithEmail('Ralph Smith', 'ralphsmith@gmail.com');
        expect(result.lastName).toBe('Smith');
        expect(result.recoveredLastName).toBe(false);
      });

      test('Does not recover if email not provided', () => {
        const result = normalizeNameWithEmail('Ralph Y.');
        expect(result.lastName).toBe('Y.');
        expect(result.recoveredLastName).toBe(false);
      });

      test('Handles full name with prefix and recovery', () => {
        const result = normalizeNameWithEmail('Dr. Ralph Y.', 'ralphyemmingway@gmail.com');
        expect(result.prefix).toBe('Dr.');
        expect(result.firstName).toBe('Ralph');
        expect(result.lastName).toBe('Yemmingway');
        expect(result.recoveredLastName).toBe(true);
      });
    });
  });
});
