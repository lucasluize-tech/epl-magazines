# Production Seed, Receipt Import & Admin Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the app for production deployment with real magazine data, historical receipts from staff tracking spreadsheets, admin magazine filters, and request logging.

**Architecture:** A Python extraction script parses 3 Excel spreadsheets into a JSON file of receipt records. The production seed creates one admin user, audited magazine catalog (with corrected cadences, quantities, branch assignments, notes), and imports the extracted receipts. The admin magazines page gets server-side filters via URL params. Edge middleware gets lightweight request logging to stdout.

**Tech Stack:** Python 3 (pandas), Prisma seed (TypeScript), Next.js App Router, shadcn/ui Select, Edge middleware

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `prisma/extract-receipts.py` | Create | Parse Excel spreadsheets, output `seed-receipts.json` |
| `prisma/seed-receipts.json` | Create (generated) | Structured receipt data for seed import |
| `prisma/seed.ts` | Modify | Production admin user, audited magazines, receipt import |
| `proxy.ts` | Modify | Add request logging to stdout |
| `app/(dashboard)/admin/magazines/page.tsx` | Modify | Add filter params to query, pass filter state to client |
| `components/MagazineFilters.tsx` | Create | Client component: filter dropdowns for cadence, language, status |

---

## Task 1: Extract Receipt Data from Spreadsheets

**Files:**
- Create: `prisma/extract-receipts.py`
- Create: `prisma/seed-receipts.json` (generated output)

This script reads all 3 Excel files and outputs structured receipt JSON. Run once, commit the JSON.

- [ ] **Step 1: Write the extraction script**

```python
#!/usr/bin/env python3
"""Extract receipt data from staff tracking spreadsheets.

Reads:
  - docs/Ebsco Magazines for Main 2025.xlsx (ML receipts Jan-Dec 2025)
  - docs/Ebsco Magazines for Main 2026.xlsx (ML receipts Jan-Apr 2026)
  - docs/Ebsco NE 2025-2026 Magazine List.xlsx (NE receipts, one sheet per month)

Outputs:
  - prisma/seed-receipts.json
"""
import json, re, sys
from datetime import date, datetime
from pathlib import Path
import pandas as pd

# Magazine name normalization map: spreadsheet name -> seed name
# Built by cross-referencing EBSCO invoices with tracking sheets
NAME_MAP = {}  # Populated by build_name_map() below

def build_name_map(seed_names: list[str], spreadsheet_names: list[str]) -> dict[str, str]:
    """Auto-build name mapping from spreadsheet names to seed names.

    Strategy:
    1. Strip trailing (N) issue counts: 'AARP BULLETIN(10)' -> 'AARP BULLETIN'
    2. Strip EBSCO descriptors from NE sheets: everything after '/**/'
    3. Case-insensitive match against seed names
    4. Fuzzy match for remaining unmatched (manual overrides below)
    """
    manual_overrides = {
        'ZOOKBOOK': 'Zoobooks',
        "WOMAN'S HEALTH": 'Womens Health',
        'BLOOMBERG BUSINESSWEEK': 'Bloomberg Businessweek',
        "COOK'S COUNTY": "Cook's County",
        'CONSUMER REPORTS ON HEALTH': 'Consumer Reports on Health',
        'ELLE DECOR': 'Elle Decor',
        'MAGNOLIA': 'Magnolia Journal',
        'FOOD NETWORK': 'Food Network Magazine',
        'FOOD & WINE': 'Food & Wine',
        # ... add more as discovered during extraction
    }
    # Implementation: normalize both sides, match, apply overrides
    pass

SEASON_DATES = {
    'SPRING': (3, 1), 'SUMMER': (6, 1), 'FALL': (9, 1),
    'AUTUMN': (9, 1), 'WINTER': (12, 1), 'HOLIDAY': (12, 1),
}

def parse_cell(value, year, month_idx):
    """Parse a spreadsheet cell into a list of receipt dates.
    Args: value=cell content, year=int, month_idx=0-based (0=Jan).
    Returns: list of date objects.
    """
    if pd.isna(value):
        return []
    s = str(value).strip()
    if not s:
        return []
    month = month_idx + 1  # 1-based

    # 'X' or 'x' -> 1st of month
    if s.lower() == 'x':
        return [date(year, month, 1)]

    # Comma-separated dates: '1/13,1/20,1/27'
    if re.match(r'^\d{1,2}/\d{1,2}', s) and ',' in s:
        dates = []
        for part in s.split(','):
            part = part.strip().rstrip(',')
            m = re.match(r'(\d{1,2})/(\d{1,2})', part)
            if m:
                dates.append(date(year, int(m.group(1)), int(m.group(2))))
        return dates

    # Date ranges for weeklies: '1/11-17' or '1/11-1/17'
    if re.match(r'\d{1,2}/\d{1,2}-', s):
        dates = []
        for part in s.split(','):
            m = re.match(r'(\d{1,2})/(\d{1,2})', part.strip())
            if m:
                dates.append(date(year, int(m.group(1)), int(m.group(2))))
        return dates

    # Seasonal: 'SPRING 2025', 'SUMMER 2025', etc.
    for season, (sm, sd) in SEASON_DATES.items():
        if season in s.upper():
            yr = year
            ym = re.search(r'20\d{2}', s)
            if ym: yr = int(ym.group())
            return [date(yr, sm, sd)]

    # Issue labels: 'JAN/FEB', 'MAR/APR', etc.
    months_map = {'JAN':1,'FEB':2,'MAR':3,'APR':4,'MAY':5,'JUN':6,
                  'JUL':7,'AUG':8,'SEP':9,'SEPT':9,'OCT':10,'NOV':11,'DEC':12}
    m = re.match(r'([A-Z]{3,4})\s*/\s*([A-Z]{3,4})', s.upper())
    if m and m.group(1) in months_map:
        return [date(year, months_map[m.group(1)], 1)]

    # Cross-year: 'DEC 2024/JAN 2025'
    if 'DEC' in s.upper() and 'JAN' in s.upper():
        return [date(year, 1, 1)]

    # 'DISPLAY UNTIL ...' or 'VOL...' -> 1st of month
    if 'DISPLAY' in s.upper() or 'VOL' in s.upper():
        return [date(year, month, 1)]

    # 'First, Second' (bi-weekly issues)
    if 'first' in s.lower():
        dates = [date(year, month, 1)]
        if 'second' in s.lower():
            dates.append(date(year, month, 15))
        return dates

    return []

def extract_main(path, year):
    """Extract receipts from Main Library tracking spreadsheet.
    Layout: Row 0 = header (Title Name, JAN..DEC, RECEIVED, did not RECEIVE)
    Row 1+ = magazine data. Col 0 = name, Cols 1-12 = months, Col 13 = received count.
    """
    df = pd.read_excel(path, header=None)
    receipts = []
    for row_idx in range(1, len(df)):
        raw_name = str(df.iloc[row_idx, 0]).strip()
        mag_name = normalize_name(raw_name)
        if not mag_name:
            continue
        for col_idx in range(1, 13):  # Columns 1-12 = Jan-Dec
            cell = df.iloc[row_idx, col_idx]
            month_idx = col_idx - 1  # 0-based
            dates = parse_cell(cell, year, month_idx)
            for d in dates:
                receipts.append({
                    'magazine': mag_name,
                    'branch': 'MAIN',
                    'date': d.isoformat(),
                    'notes': str(cell).strip() if not pd.isna(cell) else None,
                })
    return receipts

def extract_ne(path):
    """Extract receipts from NE tracking spreadsheet.
    Layout: One sheet per month (e.g., 'JAN 25', 'FEB 25', 'MAR26').
    Col 0 = magazine name (with EBSCO descriptors), Cols 1-5 = receipt entries.
    Rows 0-~111 are first copy, rows 112+ are second copy (duplicates for Qty 2).
    Only extract distinct receipts (deduplicate by magazine+date).
    """
    xls = pd.ExcelFile(path)
    receipts = []
    # Target sheets: JAN 25 through MAR 26
    target_sheets = [s for s in xls.sheet_names
                     if re.match(r'(JAN|FEB|MAR|APR|MAY|JUNE?|JULY?|AUG|SEPT?|OCT|NOV|DEC)\s*2[56]', s, re.I)]
    for sheet in target_sheets:
        month, year = parse_sheet_name(sheet)  # e.g., 'JAN 25' -> (1, 2025)
        df = pd.read_excel(xls, sheet_name=sheet, header=None)
        for row_idx in range(len(df)):
            raw_name = str(df.iloc[row_idx, 0]).strip()
            mag_name = normalize_ne_name(raw_name)  # Strip EBSCO descriptors
            if not mag_name:
                continue
            for col_idx in range(1, min(6, len(df.columns))):
                cell = df.iloc[row_idx, col_idx]
                dates = parse_ne_cell(cell, year, month)
                for d in dates:
                    receipts.append({
                        'magazine': mag_name,
                        'branch': 'NORTH',
                        'date': d.isoformat(),
                        'notes': str(cell).strip() if not pd.isna(cell) else None,
                    })
    return receipts

def main():
    receipts = []
    receipts.extend(extract_main('docs/Ebsco Magazines for Main 2025.xlsx', 2025))
    receipts.extend(extract_main('docs/Ebsco Magazines for Main 2026.xlsx', 2026))
    receipts.extend(extract_ne('docs/Ebsco NE 2025-2026 Magazine List.xlsx'))

    # Deduplicate by (magazine, branch, date)
    seen = set()
    unique = []
    for r in receipts:
        key = (r['magazine'], r['branch'], r['date'])
        if key not in seen:
            seen.add(key)
            unique.append(r)

    unique.sort(key=lambda r: (r['magazine'], r['branch'], r['date']))

    Path('prisma/seed-receipts.json').write_text(
        json.dumps(unique, indent=2, default=str)
    )
    print(f'Extracted {len(unique)} receipt records')

if __name__ == '__main__':
    main()
```

The full implementation will need:

**NAME_MAP**: A comprehensive dictionary mapping every spreadsheet magazine title variant to the canonical seed name. Derived from cross-referencing the EBSCO invoice images with both tracking sheets. Key patterns:
- Strip trailing `(N)` issue count: `'AARP BULLETIN(10)'` -> `'AARP Bulletin'`
- NE sheets have EBSCO descriptor suffixes: `'ARCHITECTURAL DIGEST /**/ /SURFACE MAIL/'` -> `'Architectural Digest'`
- Normalize "Bloomberg Businessweek" (not in EBSCO, separate subscription)
- Handle name variants: `'Zookbook'` -> `'Zoobooks'`, `'Woman's Health'` -> `'Womens Health'`

**parse_cell logic** (by cell format):
| Format | Example | Result |
|--------|---------|--------|
| `NaN` / empty | | Skip |
| `X` or `x` | `X` | `[date(year, month, 1)]` |
| Comma-separated dates | `1/13,1/20,1/27` | `[date(year,1,13), date(year,1,20), date(year,1,27)]` |
| Date ranges (weeklies) | `1/11-17` or `1/11-1/17` | `[date(year,1,11)]` (one receipt per range) |
| Issue labels | `JAN/FEB` or `MAR/APR` | `[date(year, first_month, 1)]` |
| Seasonal | `SPRING 2025`, `SUMMER 2025` | `[date(2025, season_month, 1)]` |
| Cross-year | `DEC 2024/JAN 2025` | `[date(2025, 1, 1)]` |
| `DISPLAY UNTIL ...` | `DISPLAY UNTIL MAR 12TH` | `[date(year, month, 1)]` |
| `VOL.XX NO.XX` | `VOL.78 NO.05` | `[date(year, month, 1)]` |
| `WINTER 2025`, `WINTER 2026` | | `[date(year, 12, 1)]` or `[date(year, 1, 1)]` depending on context |
| `First, Second` (bi-weekly) | | `[date(year, month, 1), date(year, month, 15)]` |
| NE date format | `2025-01-25 00:00:00` | `[date(2025, 1, 25)]` |
| NE shorthand | `DEC/JAN*2` | `[date(year, month, 1)]` (one receipt, note the *2 = 2 copies) |

**extract_ne logic**:
- Read sheets named `JAN 25` through `MAR26` (and variants like `MAR 25`, `APR 25`, ` JUNE 25`, `JULY 25`, etc.)
- Each sheet has magazine names in column 0 (with EBSCO descriptors to strip)
- Receipt data in columns 1-5 (variable width)
- NE has duplicate entries (rows 0-111 are first copy, rows 112+ are second copy for Qty 2+ magazines) — only count distinct receipts
- Month/year parsed from sheet name

- [ ] **Step 2: Run the extraction script**

Run: `python3 prisma/extract-receipts.py`
Expected: Outputs `prisma/seed-receipts.json` with ~800-1200 receipt records, prints count.

- [ ] **Step 3: Spot-check extracted data**

Verify a few known data points against spreadsheets:
- Economist (ML): Should have ~37 receipt dates in 2025 (from Main 2025 "RECEIVED" column = 37)
- Atlantic Monthly (ML): Should have ~9 receipts in 2025
- People (ML): Should have ~43 receipts in 2025
- Ananda Vikatan (ML): Should have weekly dates listed explicitly

Run: `python3 -c "import json; d=json.load(open('prisma/seed-receipts.json')); print('Economist ML:', len([r for r in d if r['magazine']=='Economist' and r['branch']=='MAIN'])); print('Atlantic ML:', len([r for r in d if r['magazine']=='Atlantic Monthly' and r['branch']=='MAIN'])); print('People ML:', len([r for r in d if r['magazine']=='People' and r['branch']=='MAIN']))"`

- [ ] **Step 4: Commit extraction script and data**

```bash
git add prisma/extract-receipts.py prisma/seed-receipts.json
git commit -m "feat: extract historical receipt data from staff tracking spreadsheets"
```

---

## Task 2: Audit and Update Magazine Data in seed.ts

**Files:**
- Modify: `prisma/seed.ts`

Cross-reference all 16 EBSCO invoice pages with the current MAGAZINES array. Apply corrections.

- [ ] **Step 1: Update MagSeed interface**

Add `notes` field and `YEARLY` cadence to the MagSeed interface:

```typescript
interface MagSeed {
  name: string
  cadence: 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'BI_MONTHLY' | 'SEASONAL' | 'YEARLY'
  language?: string
  notes?: string
  branches: { code: string; qty: number }[]
}
```

Then in the magazine creation loop, pass `notes`:
```typescript
const magazine = existing ?? await db.magazine.create({
  data: {
    name: mag.name,
    cadence: mag.cadence,
    language: mag.language ?? 'English',
    notes: mag.notes ?? null,
  },
})
```

- [ ] **Step 2: Update admin user**

Replace the two test users with the production admin:

```typescript
// Users — single admin for initial deployment
const adminHash = await bcrypt.hash('magTech', 10)
const admin = await db.user.upsert({
  where: { email: 'magapp@edisonpubliclibrary.org' },
  update: {},
  create: {
    name: 'Tech Admin',
    email: 'magapp@edisonpubliclibrary.org',
    passwordHash: adminHash,
    role: 'ADMIN',
  },
})
```

Remove the old `admin@library.org` and `staff@library.org` users entirely.

- [ ] **Step 3: Audit and correct magazine entries**

Apply all corrections from EBSCO invoice cross-reference. Key changes:

**Cadence corrections** (issues/year from invoices):
| Magazine | Invoice | Current Seed | Correct |
|----------|---------|-------------|---------|
| Forbes | 8/yr | BI_WEEKLY | BI_MONTHLY |
| Runners World | 4/yr | MONTHLY | SEASONAL |
| Cosmopolitan | 4/yr | MONTHLY | SEASONAL |
| Womens Health | 4/yr | MONTHLY | SEASONAL |
| Pioneer Woman | 4/yr | SEASONAL | SEASONAL (ok) |
| VegNews Magazine | 4/yr | BI_MONTHLY | SEASONAL |
| Fine Gardening | 4/yr | BI_MONTHLY | SEASONAL |
| Taste of Home | 4/yr | BI_MONTHLY | SEASONAL |
| Threads | 4/yr | BI_MONTHLY | SEASONAL |
| Pastel Journal | 4/yr | BI_MONTHLY | SEASONAL |
| Magnolia Journal | 4/yr | SEASONAL | SEASONAL (ok) |
| Make | 4/yr | BI_MONTHLY | SEASONAL |
| Inc | 5/yr | MONTHLY | BI_MONTHLY |
| Humpty Dumpty | 6/yr | BI_MONTHLY | BI_MONTHLY (ok) |
| Hockey News | 14/yr | MONTHLY | MONTHLY (ok, ~14 is close enough) |
| First for Women | 26/yr | MONTHLY | BI_WEEKLY |
| GQ | 8/yr | MONTHLY | BI_MONTHLY |
| Harpers Bazaar | 10/yr | MONTHLY | MONTHLY (ok) |
| Golf Digest | 11/yr | MONTHLY | MONTHLY (ok) |
| Food & Wine | 11/yr | MONTHLY | MONTHLY (ok) |
| Elle - American Ed | 10/yr | MONTHLY | MONTHLY (ok) |
| Readers Digest | 8/yr | MONTHLY | BI_MONTHLY |
| Readers Digest LP | 8/yr | MONTHLY | BI_MONTHLY |

**Name corrections** (non-English magazines must include language):
- Already correct in current seed: `Champak (Gujarati Edition)`, etc.
- Verify `China Today - Chinese Ed` matches invoice: "China Today - Chinese ed" (ok)

**Add "Comes with" notes** (from EBSCO invoices):
```typescript
{ name: 'AARP Bulletin', cadence: 'BI_MONTHLY', notes: 'Comes with: American Association of Retired Persons Membership - Ages 70 and Above', ... },
{ name: 'Inc 500', cadence: 'YEARLY', notes: 'Comes with: Inc (special issue)', ... },
{ name: 'Series Made Simple', cadence: 'YEARLY', notes: 'Comes with: School Library Journal', ... },
{ name: 'Consumer Reports Buying Guide', cadence: 'YEARLY', notes: 'Comes with: Consumer Reports (membership title)', ... },
```

**Add missing non-EBSCO magazines** (from tracking sheets, confirmed active 2025-2026):
```typescript
{ name: 'Bloomberg Businessweek', cadence: 'WEEKLY', branches: parseBranches('ML,NE,CB') },
{ name: "Cook's County", cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE') },
{ name: 'Consumer Reports on Health', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
{ name: 'Elle Decor', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
{ name: 'Superman', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
// Only add if they have 2025+ receipt data in the tracking sheets
```

**Quantity/branch corrections** (from EBSCO Qty column + handwritten annotations):
- Verify each magazine against Qty and annotations. Rules:
  - No Qty listed → handwritten branch (usually ML only)
  - Qty 1 → ML only (unless handwritten shows otherwise)
  - Qty 2 → ML + NE
  - Qty 3 → ML + NE + CB
  - Qty 5 (e.g., Consumer Reports) → ML(2) + NE(2) + CB(1)

- [ ] **Step 4: Add receipt import logic to seed**

After creating magazines and branches, import from `seed-receipts.json`:

```typescript
// Import historical receipts
import receipts from './seed-receipts.json'

// ... after magazine and branch creation ...

// Build lookup maps
const magazineByName = new Map<string, string>()
for (const mag of await db.magazine.findMany({ select: { id: true, name: true } })) {
  magazineByName.set(mag.name, mag.id)
}

let receiptCount = 0
for (const r of receipts) {
  const magazineId = magazineByName.get(r.magazine)
  const dbCode = BRANCH_MAP[r.branch] ?? r.branch
  const bId = branchMap.get(dbCode)
  if (!magazineId || !bId) {
    console.warn(`  Skipping receipt: ${r.magazine} @ ${r.branch} (not found)`)
    continue
  }

  await db.issueReceipt.create({
    data: {
      magazineId,
      branchId: bId,
      receivedById: admin.id,
      receivedDate: new Date(r.date),
      notes: r.notes || null,
    },
  })
  receiptCount++
}
console.log(`✓ ${receiptCount} historical receipts imported`)
```

- [ ] **Step 5: Test the seed**

```bash
rm prisma/dev.db && npx prisma migrate dev --name init && npm run seed
```

Expected output:
```
Seeding database...
  Branch: Main Library (MAIN)
  Branch: North Edison Branch Library (NORTH)
  Branch: Clara Barton Branch Library (CB)
  Branch: Bookmobile (MOBILE)
✓ 4 branches created
✓ ~160 magazines, ~310 subscriptions
✓ ~900 historical receipts imported
✓ Seed complete
  Admin: magapp@edisonpubliclibrary.org / magTech
```

- [ ] **Step 6: Verify dashboard shows real data**

Start dev server: `npm run dev`
Login with `magapp@edisonpubliclibrary.org` / `magTech`
Check dashboard buckets:
- Overdue: magazines where lastReceipt + cadence interval < today
- Expected this week: within 7 days
- Upcoming: beyond 7 days
- Never received: magazines with zero receipts (Library Journal, Publishers Weekly, etc.)

- [ ] **Step 7: Commit**

```bash
git add prisma/seed.ts prisma/seed-receipts.json
git commit -m "feat: production seed with audited magazines and historical receipts"
```

---

## Task 3: Add Filters to Admin Magazines Page

**Files:**
- Create: `components/MagazineFilters.tsx`
- Modify: `app/(dashboard)/admin/magazines/page.tsx`

- [ ] **Step 1: Create the MagazineFilters client component**

Create `components/MagazineFilters.tsx`:

```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface MagazineFiltersProps {
  languages: string[]
  cadences: string[]
}

const CADENCE_LABELS: Record<string, string> = {
  WEEKLY: 'Weekly',
  BI_WEEKLY: 'Bi-Weekly',
  MONTHLY: 'Monthly',
  BI_MONTHLY: 'Bi-Monthly',
  SEASONAL: 'Seasonal',
  YEARLY: 'Yearly',
}

const STATUS_OPTIONS = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'expected', label: 'Expected This Week' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'never', label: 'Never Received' },
]

export default function MagazineFilters({ languages, cadences }: MagazineFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function updateFilter(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete('page') // Reset pagination on filter change
    router.push(`/admin/magazines?${params.toString()}`)
  }

  function clearAll() {
    const params = new URLSearchParams()
    const search = searchParams.get('search')
    if (search) params.set('search', search)
    router.push(`/admin/magazines?${params.toString()}`)
  }

  const activeCadence = searchParams.get('cadence') || ''
  const activeLanguage = searchParams.get('language') || ''
  const activeStatus = searchParams.get('status') || ''
  const hasFilters = activeCadence || activeLanguage || activeStatus

  // shadcn Select cannot deselect once a value is chosen, so use "all" as the reset value
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Cadence filter */}
      <Select
        value={activeCadence || 'all'}
        onValueChange={(v) => updateFilter('cadence', v === 'all' ? null : v)}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Cadence" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Cadences</SelectItem>
          {cadences.map((c) => (
            <SelectItem key={c} value={c}>{CADENCE_LABELS[c] || c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Language filter */}
      <Select
        value={activeLanguage || 'all'}
        onValueChange={(v) => updateFilter('language', v === 'all' ? null : v)}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Language" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Languages</SelectItem>
          {languages.map((l) => (
            <SelectItem key={l} value={l}>{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Status filter */}
      <Select
        value={activeStatus || 'all'}
        onValueChange={(v) => updateFilter('status', v === 'all' ? null : v)}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear all filters */}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <X className="h-4 w-4 mr-1" /> Clear filters
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update the admin magazines page to support filters**

Modify `app/(dashboard)/admin/magazines/page.tsx`:

Add filter params extraction alongside existing `search` and `page`:
```typescript
const cadenceFilter = typeof params?.cadence === 'string' ? params.cadence : ''
const languageFilter = typeof params?.language === 'string' ? params.language : ''
const statusFilter = typeof params?.status === 'string' ? params.status : ''
```

Build a single combined `magazine` filter object (naive spread would overwrite):
```typescript
const magazineWhere: Record<string, unknown> = {}
if (search) magazineWhere.name = { contains: search }
if (cadenceFilter) magazineWhere.cadence = cadenceFilter
if (languageFilter) magazineWhere.language = languageFilter

const where = {
  branchId,
  ...(Object.keys(magazineWhere).length > 0 ? { magazine: magazineWhere } : {}),
}
```

For **status filter**: This requires post-query filtering since status is computed from receipt data. When `statusFilter` is set:
1. Fetch ALL matching subscriptions (no pagination)
2. Enrich with receipt data
3. Filter by status bucket (overdue/expected/upcoming/never)
4. Paginate the filtered result

Compute distinct languages and cadences for filter dropdowns:
```typescript
const distinctLanguages = await db.magazine.findMany({
  where: { branches: { some: { branchId } } },
  select: { language: true },
  distinct: ['language'],
  orderBy: { language: 'asc' },
})
const languages = distinctLanguages.map((m) => m.language)

const distinctCadences = await db.magazine.findMany({
  where: { branches: { some: { branchId } } },
  select: { cadence: true },
  distinct: ['cadence'],
})
const cadences = distinctCadences.map((m) => m.cadence)
```

Add filters component above the table, alongside the existing search:
```tsx
<div className="mb-6 space-y-3">
  <MagazineSearch magazines={allMagazineNames} currentSearch={search} />
  <MagazineFilters languages={languages} cadences={cadences} />
</div>
```

Update `pageUrl` helper to preserve filter params.

- [ ] **Step 3: Test filters in the browser**

Start dev: `npm run dev`
Navigate to `/admin/magazines`
Test:
- Cadence: select "Weekly" → should show only Economist, People, Us Weekly, etc.
- Language: select "Gujarati" → should show only Gujarati magazines
- Status: select "Overdue" → should show magazines past due
- Combine: Cadence=Monthly + Language=English
- Clear All button resets filters

- [ ] **Step 4: Commit**

```bash
git add components/MagazineFilters.tsx app/\(dashboard\)/admin/magazines/page.tsx
git commit -m "feat: add cadence, language, and status filters to admin magazines"
```

---

## Task 4: Add Request Logging to Production

**Files:**
- Modify: `proxy.ts`

- [ ] **Step 1: Read the current proxy.ts**

Read `proxy.ts` to understand the current middleware structure.

- [ ] **Step 2: Add request logging**

At the top of the middleware function, before any route logic, add:

```typescript
// Log all requests to stdout for Docker visibility
const start = Date.now()
const { method, nextUrl: { pathname } } = request
console.log(`[${new Date().toISOString()}] ${method} ${pathname}`)
```

This runs in Edge middleware, so `console.log` goes to stdout which Docker captures.

Keep it minimal — no external deps, no file I/O (Edge runtime doesn't support it).

- [ ] **Step 3: Test logging**

Run: `npm run dev`
Make a few requests, check terminal output shows:
```
[2026-03-30T12:00:00.000Z] GET /dashboard
[2026-03-30T12:00:01.000Z] GET /admin/magazines
```

- [ ] **Step 4: Commit**

```bash
git add proxy.ts
git commit -m "feat: add request logging to Edge middleware for production troubleshooting"
```

---

## Task 5: Final Verification

- [ ] **Step 1: Full reset and seed**

```bash
rm prisma/dev.db && npx prisma migrate dev --name init && npm run seed
```

- [ ] **Step 2: Verify in browser**

- Login: `magapp@edisonpubliclibrary.org` / `magTech`
- Dashboard: real overdue/on-track status
- Admin magazines: filters work (cadence, language, status)
- Magazine detail: receipt history shows imported data
- Request logging visible in terminal

- [ ] **Step 3: Docker build and test**

```bash
docker compose build && docker compose up -d
docker compose logs -f
```

Verify:
- Container starts healthy
- Request logging visible in Docker logs
- App accessible on port 3000

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -A && git commit -m "chore: production seed and ops cleanup"
```
