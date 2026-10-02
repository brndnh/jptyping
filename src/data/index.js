import N5Set from './N5Set.json';
import N4Set from './N4Set.json';
import N3Set from './N3Set.json';
import N5Sentences from './N5Sentences.json';
import N4Sentences from './N4Sentences.json';
import N3Sentences from './N3Sentences.json';

// keyed by each set's id, easiest first
export const SETS = {
    N5: N5Set,
    N4: N4Set,
    N3: N3Set,
};

export const DEFAULT_SET_ID = 'N5';

export function listSets() {
    return Object.values(SETS).map(s => ({
        id: s.id,
        label: s.label ?? s.id,
        description: s.description ?? '',
        size: Array.isArray(s.items) ? s.items.length : 0,
    }));
}

export function getSet(id) {
    const set = SETS[id] || SETS[DEFAULT_SET_ID];
    // Very light validation/normalization
    const items = Array.isArray(set.items) ? set.items : [];
    return {
        id: set.id || id,
        label: set.label || set.id || id,
        description: set.description || '',
        items: items.map(it => ({
            surface: String(it.surface ?? ''),
            reading: String(it.reading ?? ''),
            romaji: it.romaji ? String(it.romaji) : '',
        })),
    };
}

// sentences split into typeable chunks (word + particle); punctuation is shown, not typed
export const SENTENCE_SETS = {
    N5: N5Sentences,
    N4: N4Sentences,
    N3: N3Sentences,
};

export function getSentenceSet(id) {
    const set = SENTENCE_SETS[id] || SENTENCE_SETS[DEFAULT_SET_ID];
    return {
        id: set.id,
        label: set.label,
        items: set.items.map((it) => ({
            en: String(it.en ?? ''),
            segments: it.segments.map((seg) => ({
                surface: String(seg.surface ?? ''),
                reading: String(seg.reading ?? ''),
                punct: seg.punct ? String(seg.punct) : '',
            })),
        })),
    };
}
