import N5Set from './N5Set.json';
import N4Set from './N4Set.json';
import N3Set from './N3Set.json';

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
