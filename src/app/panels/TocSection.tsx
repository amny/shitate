import { useId } from 'react';
import { headingLevelSchema, tocDepthSchema } from '../../core/model';
import { useDocumentStore } from '../store/documentStore';
import { useNumberingStartLevel } from '../useNumberingStartLevel';
import { useTocDepth } from '../useTocDepth';

const DEPTHS = [1, 2, 3, 4, 5] as const;
const START_LEVELS = [1, 2, 3, 4, 5] as const;

/** TOC settings (design: 文書設定 > 目次). */
export function TocSection() {
  const depth = useTocDepth();
  const setTocDepth = useDocumentStore((state) => state.setTocDepth);
  const headingId = useId();
  const selectId = useId();
  const startLevel = useNumberingStartLevel();
  const setNumberingStartLevel = useDocumentStore((state) => state.setNumberingStartLevel);
  const startLevelId = useId();

  return (
    <section className="settings-section" aria-labelledby={headingId}>
      <h2 id={headingId} className="settings-heading">
        目次
      </h2>
      <div className="settings-row">
        <label htmlFor={selectId}>目次に載せる深さ</label>
        <select
          id={selectId}
          className="settings-select"
          value={depth}
          onChange={(event) => {
            const parsed = tocDepthSchema.safeParse(Number(event.target.value));
            if (parsed.success) {
              setTocDepth(parsed.data);
            }
          }}
        >
          {DEPTHS.map((d) => (
            <option key={d} value={d}>
              {d}階層
            </option>
          ))}
        </select>
      </div>
      <div className="settings-row">
        <label htmlFor={startLevelId}>見出し番号の開始レベル</label>
        <select
          id={startLevelId}
          className="settings-select"
          value={startLevel}
          onChange={(event) => {
            const parsed = headingLevelSchema.safeParse(Number(event.target.value));
            if (parsed.success) {
              setNumberingStartLevel(parsed.data);
            }
          }}
        >
          {START_LEVELS.map((level) => (
            <option key={level} value={level}>
              見出し{level}を「1」にする
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
