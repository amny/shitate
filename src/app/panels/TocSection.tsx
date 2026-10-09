import { useId } from 'react';
import { tocDepthSchema } from '../../core/model';
import { useDocumentStore } from '../store/documentStore';
import { useTocDepth } from '../useTocDepth';

const DEPTHS = [1, 2, 3, 4, 5] as const;

/** TOC settings (design: 文書設定 > 目次). */
export function TocSection() {
  const depth = useTocDepth();
  const setTocDepth = useDocumentStore((state) => state.setTocDepth);
  const headingId = useId();
  const selectId = useId();

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
    </section>
  );
}
