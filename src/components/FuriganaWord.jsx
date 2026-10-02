/**
 * props:
 *  - surface: '日本語'
 *  - reading: 'にほんご'
 *  - matched?: number     // count of reading chars typed correctly so far
 *  - active?: boolean     // highlight current word
 *  - concealed?: boolean  // furigana is off: keep its space, but hide it
 *  - revealed?: boolean   // concealed furigana shown anyway (tap to peek)
 */
export default function FuriganaWord({ surface, reading, matched = 0, active = false, concealed = false, revealed = false }) {
    const classes = ['furigana-word', active && 'active', concealed && 'concealed', revealed && 'revealed'];
    return (
        <span className={classes.filter(Boolean).join(' ')}>
            <span className="furigana">
                <span className="furigana-matched">{reading.slice(0, matched)}</span>
                {reading.slice(matched)}
            </span>
            <span className="surface">{surface}</span>
        </span>
    );
}
