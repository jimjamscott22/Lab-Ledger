import { useRef, type RefObject } from 'react';

const GROUPS = [
  {
    title: 'Anywhere',
    shortcuts: [
      ['?', 'Open keyboard help (outside text fields)'],
      ['Ctrl/Cmd + K', 'Open search or focus the search field'],
      ['Esc', 'Close keyboard help'],
    ],
  },
  {
    title: 'Lab viewer',
    shortcuts: [
      ['← / →', 'Previous / next lab'],
      ['j / k', 'Next / previous step'],
      ['Space', 'Toggle the focused step'],
      ['s', 'Cycle lab status'],
      ['n', 'Open and focus the journal'],
    ],
  },
  {
    title: 'Interview practice',
    shortcuts: [
      ['R', 'Reveal the answer'],
      ['1 / 2 / 3 / 4', 'Rate Again / Hard / Good / Easy after revealing'],
    ],
  },
];

export function ShortcutHelp({
  dialogRef,
  onClose,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <dialog
      ref={dialogRef}
      className="shortcut-help"
      aria-labelledby="shortcut-help-title"
      onClose={onClose}
      onKeyDown={(event) => {
        // This dialog has one interactive control. Keep Tab from moving to browser chrome.
        if (event.key === 'Tab') {
          event.preventDefault();
          closeRef.current?.focus();
        }
      }}
    >
      <h2 id="shortcut-help-title">Keyboard shortcuts</h2>
      <p>Viewer and practice shortcuts pause while you type or use this help.</p>
      {GROUPS.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h3>{group.title}</h3>
          <dl>
            {group.shortcuts.map(([key, description]) => (
              <div key={key}>
                <dt>
                  <kbd>{key}</kbd>
                </dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <form method="dialog">
        <button ref={closeRef} type="submit" autoFocus>
          Close
        </button>
      </form>
    </dialog>
  );
}
