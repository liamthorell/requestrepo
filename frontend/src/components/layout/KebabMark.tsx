// A döner spit: the cone is drawn in the accent colour, the skewer in currentColor.
export function KebabMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M16 2v28M11 28.5h10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M7.5 7Q16 5.4 24.5 7L21 24.2Q16 25.4 11 24.2Z"
        fill="var(--lab-accent)"
      />
      <path
        d="M8.6 12.4Q16 13.8 23.4 12.4M9.7 17.8Q16 19.2 22.3 17.8"
        stroke="var(--lab-bg)"
        strokeWidth="1.5"
      />
    </svg>
  );
}
