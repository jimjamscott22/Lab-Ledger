import { useCallback, useEffect, useRef } from 'react';

interface Props {
  slug: string;
  title: string;
  checked: Set<number>;
  onToggle: (index: number, value: boolean) => void;
  onKey: (e: KeyboardEvent) => void;
}

export function LabFrame({ slug, title, checked, onToggle, onKey }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const boxes = useRef<HTMLInputElement[]>([]);
  const toggleRef = useRef(onToggle);
  toggleRef.current = onToggle;

  const apply = useCallback(() => {
    boxes.current.forEach((box, i) => {
      const want = checked.has(i);
      if (box.checked !== want) box.checked = want;
    });
  }, [checked]);

  useEffect(apply, [apply]);

  const onLoad = () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    boxes.current = Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    boxes.current.forEach((box, i) => box.addEventListener('change', () => toggleRef.current(i, box.checked)));
    doc.addEventListener('keydown', onKey);
    apply();
  };

  return (
    <iframe
      ref={frame}
      key={slug}
      title={`Lab: ${title}`}
      sandbox="allow-same-origin"
      src={`/api/labs/${slug}/raw`}
      onLoad={onLoad}
    />
  );
}
