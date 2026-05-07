/**
 * Logo: $SPREAD Patient Zero mark.
 * Static PNG asset shipped from /public/logo.png.
 * The `className` prop is kept for layout / sizing utilities.
 */

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 48, className = '' }: LogoProps) {
  return (
    <img
      src="/logo.png"
      width={size}
      height={size}
      alt="Spread It"
      className={className}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}
