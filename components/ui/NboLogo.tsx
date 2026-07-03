import Image from 'next/image';

// The NBO wordmark is white in NBO-Dark.png, so it vanishes on light
// backgrounds. Render both variants and let CSS pick per theme — no client
// JS needed, so there's no flash of the wrong logo on load.
export default function NboLogo({
  width,
  height,
  className = '',
}: {
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <>
      <Image
        src="/NBO-Light.png"
        alt="National Bank Open"
        width={width}
        height={height}
        style={{ height: 'auto' }}
        preload
        className={`dark:hidden ${className}`}
      />
      <Image
        src="/NBO-Dark.png"
        alt="National Bank Open"
        width={width}
        height={height}
        style={{ height: 'auto' }}
        preload
        className={`hidden dark:block ${className}`}
      />
    </>
  );
}
