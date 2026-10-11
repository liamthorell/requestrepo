export function KebabMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M12 52 53 11M8 56l6-2-4-4-2 6Z"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect
        x="29"
        y="9"
        width="19"
        height="15"
        rx="5"
        transform="rotate(45 29 9)"
        fill="#f4ad57"
      />
      <rect
        x="24"
        y="25"
        width="19"
        height="11"
        rx="4"
        transform="rotate(45 24 25)"
        fill="#73bea1"
      />
      <rect
        x="13"
        y="32"
        width="19"
        height="15"
        rx="5"
        transform="rotate(45 13 32)"
        fill="#e88747"
      />
      <path
        d="m32 15 7 7M16 39l7 7"
        stroke="#704125"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
