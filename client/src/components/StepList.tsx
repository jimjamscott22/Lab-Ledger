import { useEffect, useRef } from 'react';
import type { Step } from '@lab-ledger/shared';

interface Props {
  steps: Step[];
  checked: Set<number>;
  focusIndex: number;
  onToggle: (index: number, value: boolean) => void;
}

export function StepList({ steps, checked, focusIndex, onToggle }: Props) {
  const focused = useRef<HTMLLIElement>(null);
  useEffect(() => {
    focused.current?.scrollIntoView({ block: 'nearest' });
  }, [focusIndex]);

  let lastSection = '';
  return (
    <ol className="steps" aria-label="Steps">
      {steps.map((s) => {
        const header = s.section !== lastSection ? s.section : null;
        lastSection = s.section;
        return (
          <li
            key={s.key}
            ref={s.index === focusIndex ? focused : undefined}
            data-focused={s.index === focusIndex}
          >
            {header ? <div className="section-h">{header}</div> : null}
            <label>
              <input
                type="checkbox"
                checked={checked.has(s.index)}
                onChange={(e) => onToggle(s.index, e.target.checked)}
              />
              <span>{s.text}</span>
            </label>
          </li>
        );
      })}
    </ol>
  );
}
