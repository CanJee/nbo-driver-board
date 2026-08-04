// Full-colour artwork for the six away buttons, inlined as JSX.
//
// These were plain emoji characters in lib/types.ts until dispatchers noticed the
// board didn't match machine to machine: a bare ⛽ is drawn by whatever emoji font
// the OS ships — Apple Color Emoji on a Mac, Segoe UI Emoji on Windows — so the
// same button was a different picture depending on who was looking at it. Shipping
// the vectors ourselves makes every icon identical across Windows/Mac and
// Chrome/Edge, with no font to wait on and no request to make.
//
// Artwork: Twemoji (https://github.com/jdecked/twemoji), CC-BY 4.0. The paths are
// upstream's, copied verbatim — to change one, re-download its source SVG rather
// than editing coordinates here.

import type { ComponentPropsWithoutRef, ComponentType, ReactNode } from 'react';
import type { AwayReason } from './types';

/** `size` drives both dimensions, which is why width/height are off the table: a
 *  caller passing just one of them would stretch the glyph. Everything else an
 *  <svg> accepts (aria-hidden, role, style…) passes straight through. */
type AwayIconProps = Omit<
  ComponentPropsWithoutRef<'svg'>,
  'width' | 'height' | 'children'
> & {
  size?: number | string;
};

export type AwayIcon = ComponentType<{ size?: number | string; className?: string }>;

/** The shared canvas, so each icon below is nothing but upstream's artwork. The
 *  36x36 viewBox is Twemoji's own grid and the paths are drawn for it — rescaling
 *  it would knock them off the pixel grid at the 14/16px the board renders at.
 *  Icons default to aria-hidden because they are decorative: every away button
 *  already carries a visible text label from AWAY_SHORT_LABELS. */
function Twemoji({
  size = 16,
  className,
  children,
  ...rest
}: AwayIconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 36 36"
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Fuel pump (Twemoji 26fd). */
function Gas(props: AwayIconProps) {
  return (
    <Twemoji {...props}>
      <path fill="#99AAB5" d="M30 33c-2.417 0-5-1.313-5-5 0-2.071 1.118-3.478 2.199-4.838.423-.532.851-1.07 1.239-1.666C26.883 20.077 25.172 19 24 19v-2c1.621 0 3.603 1.133 5.382 2.67.378-.995.618-2.177.618-3.67h2c0 2.169-.448 3.816-1.077 5.149 1.445 1.542 2.591 3.23 3.025 4.534.688 2.066.483 4.228-.535 5.642C32.635 32.405 31.422 33 30 33zm-.13-10.052c-.368.53-.747 1.008-1.105 1.458C27.779 25.646 27 26.627 27 28c0 2.479 1.632 3 3 3 .784 0 1.387-.284 1.791-.845.64-.888.741-2.395.261-3.839-.327-.978-1.15-2.202-2.182-3.368z" />
      <path fill="#FFAC33" d="M21.252 10H9c-2.209 0-3.883 1.791-3.74 4l1.17 18c.144 2.209 1.775 4 3.645 4h10.102c1.869 0 3.501-1.791 3.645-4l1.171-18c.142-2.209-1.532-4-3.741-4z" />
      <path fill="#AAB8C2" d="M26 33H4c-.552 0-1 .447-1 1v2h24v-2c0-.553-.447-1-1-1z" />
      <path fill="#FFAC33" d="M31 10c-.553 0-1-.448-1-1V5.764l2.105-4.211c.248-.494.848-.695 1.342-.447.494.247.694.848.447 1.342L32 6.236V9c0 .552-.447 1-1 1z" />
      <path fill="#BE1931" d="M33.5 16h-.777c.172-.295.277-.634.277-1v-4c0-.738-.404-1.376-1-1.723V9c0-.552-.447-1-1-1s-1 .448-1 1v.277c-.596.347-1 .984-1 1.723v4c0 .366.105.705.277 1H28.5c-.276 0-.5.224-.5.5s.224.5.5.5h5c.276 0 .5-.224.5-.5s-.224-.5-.5-.5z" />
      <path fill="#99AAB5" d="M25 14c0 .552.447 1 1 1h5c.553 0 1-.448 1-1s-.447-1-1-1h-5c-.553 0-1 .448-1 1z" />
      <path fill="#E1E8ED" d="M27 14c0 2.209-1.791 4-4 4H7c-2.209 0-4-1.791-4-4V4c0-2.209 1.791-4 4-4h16c2.209 0 4 1.791 4 4v10z" />
      <path fill="#66757F" d="M25 14c0 1.104-.896 2-2 2H7c-1.104 0-2-.896-2-2V4c0-1.104.896-2 2-2h16c1.104 0 2 .896 2 2v10z" />
      <path fill="#AAB8C2" d="M13 5h9v3h-9z" />
    </Twemoji>
  );
}

/** Bar of soap (Twemoji 1f9fc). */
function Carwash(props: AwayIconProps) {
  return (
    <Twemoji {...props}>
      <circle fill="#CCD6DD" cx="28.5" cy="26.5" r="3.5" />
      <circle fill="#F5F8FA" cx="29.5" cy="25.5" r="2.5" />
      <circle fill="#CCD6DD" cx="26" cy="30" r="3" />
      <circle fill="#F5F8FA" cx="26.5" cy="29.5" r="2.5" />
      <path fill="#EA596E" d="M32.469 8.188s1.156 2.375.531 6.844-2.428 7.734-7.384 12.737c-8.411 8.493-14.321 9.461-19.461 4.271-1.883-1.901-2.627-3.883-2.936-5.977S2.991 21.306 3 21c.034-1.234 1.188-4.667 1.188-4.667l28.281-8.145z" />
      <path fill="#F4ABBA" d="M10.261 8.358C13.468 5.076 17.79 1.834 21.281 1c3.582-.856 6.319.766 8.484 2.881 1.87 1.827 3.482 4.751 3.141 7.775-.438 3.889-3.512 8.087-7.167 11.827-3.095 3.167-7.228 6.373-10.614 7.267-3.723.982-6.652-.602-8.891-2.79-1.933-1.889-3.565-4.781-3.141-7.929.515-3.813 3.608-8.031 7.168-11.673z" />
      <path fill="#FFCCD6" d="M11.626 8.375c3.179-3.24 6.801-6.001 10.03-6.531 2.428-.399 4.675.785 6.111 2.193 1.363 1.337 2.642 3.525 2.389 5.807-.368 3.319-3.118 7.05-6.418 10.414-2.682 2.734-6.094 5.501-8.926 6.336-3.049.9-5.481-.297-7.215-1.998-1.618-1.587-2.826-3.994-2.191-6.815.678-3.01 3.345-6.475 6.22-9.406z" />
      <circle fill="#CCD6DD" cx="9" cy="10" r="3" />
      <circle fill="#F5F8FA" cx="9.5" cy="9.5" r="2.5" />
      <circle fill="#CCD6DD" cx="5.5" cy="8.5" r="2.5" />
      <circle fill="#CCD6DD" cx="12" cy="6" r="3" />
      <circle fill="#CCD6DD" cx="9" cy="3" r="2" />
      <circle fill="#CCD6DD" cx="3.5" cy="4.5" r="1.5" />
      <circle fill="#CCD6DD" cx="18" cy="4" r="2" />
      <circle fill="#CCD6DD" cx="5" cy="15" r="2" />
      <circle fill="#CCD6DD" cx="32.5" cy="25.5" r="2.5" />
      <circle fill="#CCD6DD" cx="33" cy="19" r="2" />
      <circle fill="#F5F8FA" cx="6" cy="8" r="2" />
      <circle fill="#F5F8FA" cx="5.5" cy="14.5" r="1.5" />
      <circle fill="#F5F8FA" cx="12.5" cy="5.5" r="2.5" />
      <circle fill="#F5F8FA" cx="9.5" cy="2.5" r="1.5" />
      <circle fill="#F5F8FA" cx="4" cy="4" r="1" />
      <circle fill="#F5F8FA" cx="18.5" cy="3.5" r="1.5" />
      <circle fill="#F5F8FA" cx="33" cy="25" r="2" />
      <circle fill="#F5F8FA" cx="33.5" cy="18.5" r="1.5" />
    </Twemoji>
  );
}

/** Tennis ball (Twemoji 1f3be). */
function Practice(props: AwayIconProps) {
  return (
    <Twemoji {...props}>
      <circle fill="#77B255" cx="18" cy="18" r="18" />
      <path fill="#A6D388" d="M26 18c0 6.048 2.792 10.221 5.802 11.546C34.42 26.42 36 22.396 36 18c0-4.396-1.58-8.42-4.198-11.546C28.792 7.779 26 11.952 26 18z" />
      <path fill="#FFF" d="M27 18c0-6.048 1.792-10.221 4.802-11.546-.445-.531-.926-1.028-1.428-1.504C27.406 6.605 25 10.578 25 18c0 7.421 2.406 11.395 5.374 13.05.502-.476.984-.973 1.428-1.504C28.792 28.221 27 24.048 27 18z" />
      <path fill="#A6D388" d="M10 18c0-6.048-2.792-10.22-5.802-11.546C1.58 9.58 0 13.604 0 18c0 4.396 1.58 8.42 4.198 11.546C7.208 28.22 10 24.048 10 18z" />
      <path fill="#FFF" d="M4.198 6.454C7.208 7.78 9 11.952 9 18c0 6.048-1.792 10.22-4.802 11.546.445.531.926 1.027 1.428 1.504C8.593 29.395 11 25.421 11 18c0-7.421-2.406-11.395-5.374-13.049-.502.476-.984.972-1.428 1.503z" />
    </Twemoji>
  );
}

/** Minibus (Twemoji 1f690). */
function Parking(props: AwayIconProps) {
  return (
    <Twemoji {...props}>
      <path fill="#CCD6DD" d="M35 10c0-1-1-4-4-4H9.401C6 6 0 18 0 21v6c0 2.209 1.791 4 4 4h28c2.209 0 4-1.791 4-4V17c0-1.027-1-7-1-7z" />
      <path fill="#66757F" d="M0 23h36v3H0z" />
      <path fill="#E1E8ED" d="M9 25c-3.267 0-5.918 2.612-5.993 5.861.32.081.648.139.993.139h11c0-3.313-2.686-6-6-6zm23.993 5.86C32.918 27.612 30.268 25 27 25c-3.312 0-6 2.687-6 6h11c.345 0 .674-.058.993-.14z" />
      <path fill="#99AAB5" d="M5.686 26h6.629c-.95-.631-2.088-1-3.314-1-1.227 0-2.366.368-3.315 1zm18.001 0h6.629c-.949-.632-2.089-1-3.315-1s-2.364.369-3.314 1z" />
      <circle fill="#292F33" cx="9" cy="31" r="4" />
      <circle fill="#99AAB5" cx="9" cy="31" r="2" />
      <circle fill="#292F33" cx="27" cy="31" r="4" />
      <circle fill="#99AAB5" cx="27" cy="31" r="2" />
      <path fill="#55ACEE" d="M5 13h6v7H2zm8 0h8v7h-8zm10 0v7h13v-3c0-.526-.262-2.347-.518-4H23z" />
      <path fill="#99AAB5" d="M33 11H7c-.552 0-1-.448-1-1s.448-1 1-1h26c.553 0 1 .448 1 1s-.447 1-1 1z" />
    </Twemoji>
  );
}

/** Hotel (Twemoji 1f3e8). */
function UptownShuttle(props: AwayIconProps) {
  return (
    <Twemoji {...props}>
      <path fill="#C1694F" d="M21 15c0 2.209-1.791 4-4 4H4c-2.209 0-4-1.791-4-4v-3c0-2.209 1.791-4 4-4h13c2.209 0 4 1.791 4 4v3z" />
      <path fill="#C1694F" d="M36 6c0 2.209-1.791 4-4 4H20c-2.209 0-4-1.791-4-4V5c0-2.209 1.791-4 4-4h12c2.209 0 4 1.791 4 4v1z" />
      <path fill="#FFCC4D" d="M0 12v22c0 1.104.896 2 2 2h31V12H0z" />
      <path fill="#55ACEE" d="M2 32h12v4H2zm0-6h16v4H2z" />
      <path fill="#FFE8B6" d="M16 5v31h18c1.104 0 2-.896 2-2V5H16z" />
      <path fill="#55ACEE" d="M18 20h16v4H18zm0-6h16v4H18zm0-6h16v4H18zm0 18h16v4H18z" />
      <path fill="#FFE8B6" d="M22 7h2v24h-2zm6 0h2v24h-2z" />
      <path fill="#3B88C3" d="M22 32h8v4h-8zM10 14v4H6v-4H4v10h2v-4h4v4h2V14z" />
      <path fill="#FFCC4D" d="M7 25h2v6H7zm7 0h2v6h-2z" />
    </Twemoji>
  );
}

/** Hamburger (Twemoji 1f354). */
function Meals(props: AwayIconProps) {
  return (
    <Twemoji {...props}>
      <path fill="#D99E82" d="M18 20.411c-9.371 0-16.967-.225-16.967 6.427C1.033 33.487 8.629 35 18 35c9.371 0 16.967-1.513 16.967-8.162 0-6.651-7.596-6.427-16.967-6.427z" />
      <path fill="#662113" d="M34.47 20.916S26.251 19.932 18 19.89c-8.251.042-16.47 1.026-16.47 1.026C.717 27.39 7.467 30.057 18 30.057s17.283-2.667 16.47-9.141z" />
      <path fill="#FFCC4D" d="M33.886 18.328l-31.855.646c-1.1 0-2.021 2.229-.854 2.812 8.708 2.708 15.708 5.448 15.708 5.448.962.532 1.287.534 2.25.003 0 0 9.666-3.868 15.875-5.493.881-.23-.025-3.416-1.124-3.416z" />
      <path fill="#77B255" d="M34.725 18.412c-1.9-1.751-1.79-.819-3.246-1.23-.553-.156-4.51-5.271-13.529-5.271h-.02c-9.019 0-12.976 5.115-13.529 5.271-1.456.411-1.346-.521-3.246 1.23-.872.804-1.108 1.222-.188 1.43 1.386.313 1.26 1.152 2.253 1.444 1.202.353 1.696-.292 3.634-.028 1.653.225 1.761 2.369 3.429 2.369s1.668-.8 3.335-.8 2.653 2.146 4.321 2.146 2.653-2.146 4.321-2.146c1.668 0 1.668.8 3.335.8 1.668 0 1.776-2.144 3.429-2.369 1.938-.263 2.433.381 3.634.028.993-.292.867-1.13 2.253-1.444.922-.207.687-.626-.186-1.43z" />
      <path fill="#DD2E44" d="M34.077 16.52c0 2.984-7.198 4.393-16.077 4.393S1.923 19.504 1.923 16.52c0-5.403.966-5.403 16.077-5.403s16.077.001 16.077 5.403z" />
      <path fill="#D99E82" d="M18 .524C8.629.524 1.033 4.915 1.033 11.566c0 6.125 7.596 6.375 16.967 6.375s16.967-.25 16.967-6.375C34.967 4.914 27.371.524 18 .524z" />
      <path d="M10.784 3.695c-.498-.319-1.159-.173-1.477.325-.318.498-.173 1.16.325 1.477.498.319 1.76.557 2.079.059.318-.498-.429-1.543-.927-1.861zm9.734-1.035c-.562.182-1.549 1.006-1.366 1.568.183.562 1.464.648 2.026.466s.869-.786.686-1.348c-.182-.561-.786-.869-1.346-.686zm10.909 7.035c-.452-.38-1.585.225-1.966.677-.38.453-.321 1.127.131 1.507.452.38 1.127.321 1.507-.131.381-.453.781-1.673.328-2.053zm-3.643-5c-.498-.318-1.159-.172-1.478.326-.318.498-.172 1.159.326 1.477.498.319 1.76.557 2.078.059.319-.499-.428-1.544-.926-1.862zm-15 7c-.498-.318-1.159-.172-1.478.326-.318.497-.172 1.159.326 1.476.498.319 1.76.558 2.078.059.319-.498-.428-1.543-.926-1.861zm3.046-4.808c-.336.486-.62 1.739-.133 2.075.486.336 1.557-.374 1.893-.86.336-.486.213-1.152-.273-1.488-.485-.336-1.152-.213-1.487.273zm7.954 4.808c-.498-.318-1.159-.172-1.478.326-.318.497-.172 1.16.326 1.476.498.319 1.76.558 2.078.059.319-.498-.428-1.543-.926-1.861zM4.948 7.808c-.394.441-.833 1.648-.392 2.042.439.394 1.591-.174 1.985-.615.395-.44.357-1.116-.083-1.511-.439-.394-1.116-.356-1.51.084z" fill="#FFE8B6" />
    </Twemoji>
  );
}

// Order here is the order of the buttons on the card — keep AWAY_LABELS and
// AWAY_SHORT_LABELS in lib/types.ts in step with it, and remember the away_reason
// CHECK constraint in the database has to allow any key added here (see
// supabase/migrations/*_meals_away_reason.sql, the newest of the constraint
// migrations — each new reason gets another one).
export const AWAY_ICONS: Record<AwayReason, AwayIcon> = {
  gas: Gas,
  carwash: Carwash,
  practice: Practice,
  parking: Parking,
  uptown_shuttle: UptownShuttle,
  // Appended rather than slotted in beside Practice: dispatchers tap these by
  // position on a touchscreen, so an existing button must not move.
  meals: Meals,
};
