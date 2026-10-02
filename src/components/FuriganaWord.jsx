/**
 * props:
 *  - surface: '日本語'
 *  - reading: 'にほんご' ('' hides furigana but keeps its space)
 *  - matched?: number   // count of reading chars typed correctly so far
 *  - active?: boolean   // highlight current word
 */
export default function FuriganaWord({ surface, reading, matched = 0, active = false }) {
    return (
        <span className={`furigana-word${active ? ' active' : ''}`}>
            <span className="furigana">
                <span className="furigana-matched">{reading.slice(0, matched)}</span>
                {reading.slice(matched)}
            </span>
            <span className="surface">{surface}</span>
        </span>
    );
}
