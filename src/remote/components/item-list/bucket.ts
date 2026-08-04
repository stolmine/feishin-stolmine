export const BASE_BUCKETS: string[] = [
    '#',
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
    'G',
    'H',
    'I',
    'J',
    'K',
    'L',
    'M',
    'N',
    'O',
    'P',
    'Q',
    'R',
    'S',
    'T',
    'U',
    'V',
    'W',
    'X',
    'Y',
    'Z',
];

const KANA_ROWS: Array<{ label: string; members: string }> = [
    { label: 'あ', members: 'あいうえお' },
    { label: 'か', members: 'かきくけこがぎぐげご' },
    { label: 'さ', members: 'さしすせそざじずぜぞ' },
    { label: 'た', members: 'たちつてとだぢづでどっ' },
    { label: 'な', members: 'なにぬねの' },
    { label: 'は', members: 'はひふへほばびぶべぼぱぴぷぺぽ' },
    { label: 'ま', members: 'まみむめも' },
    { label: 'や', members: 'やゆよゃゅょ' },
    { label: 'ら', members: 'らりるれろ' },
    { label: 'わ', members: 'わをんゎ' },
];

const KANA_ROW_LABELS = KANA_ROWS.map((row) => row.label);

// Maps every individual hiragana character in each gojūon row (dakuten/
// handakuten and small youon/tsu folded into their base row) to that row's
// bucket label. Katakana input is converted to hiragana (see `toHiragana`)
// before lookup, so this map only needs hiragana keys.
const KANA_ROW_MAP: Map<string, string> = new Map();
for (const row of KANA_ROWS) {
    for (const member of Array.from(row.members)) {
        KANA_ROW_MAP.set(member, row.label);
    }
}

// Anything in the kana block that isn't a mapped gojūon member (e.g. the
// prolonged sound mark ー, standalone dakuten/handakuten marks) falls back to
// the あ row rather than throwing.
function kanaBucket(char: string): string {
    return KANA_ROW_MAP.get(toHiragana(char)) ?? 'あ';
}

// Standard katakana block (U+30A1–U+30F6) maps onto the hiragana block
// (U+3041–U+3096) by subtracting 0x60. Characters outside that sub-range
// (e.g. the prolonged sound mark ー, or plain hiragana) pass through unchanged.
function toHiragana(char: string): string {
    const code = char.codePointAt(0);

    if (code === undefined) {
        return char;
    }

    if (code >= 0x30a1 && code <= 0x30f6) {
        return String.fromCodePoint(code - 0x60);
    }

    return char;
}

const LATIN_LETTER_RE = /^[A-Za-z]$/;
const DIGIT_RE = /^[0-9]$/;
const COMBINING_DIACRITICS_RE = /[̀-ͯ]/g;

export function bucketOf(name: string): string {
    const trimmed = name.trim();

    if (trimmed.length === 0) {
        return '#';
    }

    const originalFirst = Array.from(trimmed)[0];

    // NFKD-normalize + strip combining diacritics so accented Latin leads
    // (é → e) fall into their base letter's bucket. Kana/CJK/Hangul checks
    // below deliberately use the ORIGINAL (non-normalized) leading code
    // point instead, since NFKD can decompose those scripts in unwanted ways.
    const normalized = trimmed.normalize('NFKD').replace(COMBINING_DIACRITICS_RE, '');
    const normalizedFirst = Array.from(normalized)[0] ?? originalFirst;

    if (LATIN_LETTER_RE.test(normalizedFirst)) {
        return normalizedFirst.toUpperCase();
    }

    if (DIGIT_RE.test(normalizedFirst)) {
        return '#';
    }

    const code = originalFirst.codePointAt(0) ?? 0;

    if (code >= 0x3040 && code <= 0x30ff) {
        return kanaBucket(originalFirst);
    }

    if (code >= 0x4e00 && code <= 0x9fff) {
        return '漢';
    }

    if (code >= 0xac00 && code <= 0xd7a3) {
        return '한';
    }

    return '⋯';
}

const ORDERED_BUCKETS: string[] = [...BASE_BUCKETS, ...KANA_ROW_LABELS, '漢', '한', '⋯'];

const BUCKET_ORDINALS: Map<string, number> = new Map(
    ORDERED_BUCKETS.map((label, index) => [label, index]),
);

export function compareBuckets(a: string, b: string): number {
    const ordinalA = BUCKET_ORDINALS.get(a) ?? Infinity;
    const ordinalB = BUCKET_ORDINALS.get(b) ?? Infinity;

    return ordinalA - ordinalB;
}

export function orderedBuckets(present: Iterable<string>): string[] {
    const union = new Set<string>(BASE_BUCKETS);

    for (const bucket of present) {
        union.add(bucket);
    }

    return Array.from(union).sort(compareBuckets);
}
