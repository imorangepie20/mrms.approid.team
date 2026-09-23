type PlayIconProps = {
  className?: string;
};

export function PlayIcon({ className }: PlayIconProps) {
  return (
    <svg aria-hidden="true" className={className ? `play-icon ${className}` : "play-icon"} viewBox="0 0 16 16">
      <path d="M4.75 3.25v9.5L12 8 4.75 3.25Z" fill="currentColor" />
    </svg>
  );
}
