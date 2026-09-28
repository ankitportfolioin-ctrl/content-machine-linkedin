/**
 * Step D: minimal RFC-4180-style CSV parser (no new dependencies).
 * Handles quoted fields, embedded commas/newlines, escaped quotes (""),
 * and CRLF/LF line endings. Returns rows of raw cell strings.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let hasCell = false;

  const pushCell = () => {
    row.push(cell);
    cell = '';
    hasCell = false;
  };
  const pushRow = () => {
    pushCell();
    // Skip fully-empty lines (whitespace-only file padding).
    if (row.length === 1 && row[0]!.trim() === '') {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    hasCell = true;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushCell();
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      pushRow();
    } else if (ch === '\n') {
      pushRow();
    } else {
      cell += ch;
    }
  }
  if (hasCell || row.length > 0) pushRow();
  if (inQuotes) {
    throw new Error('Malformed CSV: unterminated quoted field.');
  }
  return rows;
}

const HEADER_ALIASES: Record<string, string> = {
  name: 'name',
  linkedinurl: 'linkedinUrl',
  linkedin_url: 'linkedinUrl',
  url: 'linkedinUrl',
  headline: 'headline',
  title: 'headline',
  company: 'company',
  organisation: 'company',
  organization: 'company',
  location: 'location',
};

export interface LeadImportRow {
  rowNumber: number;
  name: string;
  linkedinUrl?: string;
  headline?: string;
  company?: string;
  location?: string;
}

/**
 * Maps parsed rows to lead fields using the header row. Requires a header
 * containing at least a "name" column; anything else is an honest 400-class
 * error, never guessed mapping.
 */
export function mapLeadRows(rows: string[][]): { leads: LeadImportRow[]; columns: string[] } {
  if (rows.length === 0) {
    throw new Error('CSV is empty: no header row found. Expected headers: name, linkedinUrl, headline, company, location.');
  }
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const mapped = header.map((h) => HEADER_ALIASES[h] ?? '');
  if (!mapped.includes('name')) {
    throw new Error(
      'CSV header must include a "name" column. Expected headers: name, linkedinUrl, headline, company, location.'
    );
  }
  const leads: LeadImportRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    const get = (col: string): string | undefined => {
      const idx = mapped.indexOf(col);
      if (idx < 0) return undefined;
      const value = (cells[idx] ?? '').trim();
      return value.length > 0 ? value : undefined;
    };
    const name = get('name');
    if (!name) continue;
    leads.push({
      rowNumber: r + 1,
      name,
      linkedinUrl: get('linkedinUrl'),
      headline: get('headline'),
      company: get('company'),
      location: get('location'),
    });
  }
  return { leads, columns: header };
}
