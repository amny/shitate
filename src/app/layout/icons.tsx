import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const UndoIcon = () => (
  <Icon>
    <path d="M5 4L2 7l3 3" />
    <path d="M2 7h8a4 4 0 010 8H7" />
  </Icon>
);

export const RedoIcon = () => (
  <Icon>
    <path d="M11 4l3 3-3 3" />
    <path d="M14 7H6a4 4 0 000 8h3" />
  </Icon>
);

export const BulletListIcon = () => (
  <Icon>
    <circle cx="3" cy="4" r="0.8" />
    <circle cx="3" cy="8" r="0.8" />
    <circle cx="3" cy="12" r="0.8" />
    <path d="M6 4h8M6 8h8M6 12h8" />
  </Icon>
);

export const OrderedListIcon = () => (
  <Icon>
    <path d="M2 3h1.5v3M2 6h3M2 10h3l-3 3h3" />
    <path d="M7 4.5h7M7 11.5h7" />
  </Icon>
);

export const QuoteIcon = () => (
  <Icon>
    <path d="M3 3v10M6 5h8M6 8h8M6 11h5" />
  </Icon>
);

export const CodeBlockIcon = () => (
  <Icon>
    <path d="M5 4L1.5 8 5 12M11 4l3.5 4-3.5 4" />
  </Icon>
);

export const LinkIcon = () => (
  <Icon>
    <path d="M6.5 9.5l3-3" />
    <path d="M7 4.5l1.5-1.5a2.8 2.8 0 014 4L11 8.5M9 11.5L7.5 13a2.8 2.8 0 01-4-4L5 7.5" />
  </Icon>
);

export const ImageIcon = () => (
  <Icon>
    <rect x="2" y="3" width="12" height="10" rx="1" />
    <path d="M2 10l3.5-3 3 2.5L11 7l3 3" />
  </Icon>
);

export const HorizontalRuleIcon = () => (
  <Icon>
    <path d="M2 8h12" />
  </Icon>
);

export const TableIcon = () => (
  <Icon>
    <rect x="2" y="3" width="12" height="10" rx="1" />
    <path d="M2 6.5h12M6.5 3v10" />
  </Icon>
);

export const CaptionIcon = () => (
  <Icon>
    <rect x="2" y="2" width="12" height="8" rx="1" />
    <path d="M4 13h8" />
  </Icon>
);

export const CrossRefIcon = () => (
  <Icon>
    <path d="M3 8h7M7.5 5L10.5 8 7.5 11" />
    <path d="M13 3v10" />
  </Icon>
);

export const TocIcon = () => (
  <Icon>
    <path d="M2 3.5h12M2 7h9M5 10.5h9M5 14h6" />
  </Icon>
);
