export default function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 30"
      fill="none"
      aria-hidden
    >
      <rect width="30" height="30" rx="11" fill="#15161B" />
      <rect x="8" y="12" width="3" height="9" rx="2" fill="#6C5CE7" />
      <rect x="13.5" y="8" width="3" height="13" rx="2" fill="#0CA678" />
      <rect x="19" y="15" width="3" height="6" rx="2" fill="#F08C00" />
    </svg>
  );
}
