/* eslint-disable @next/next/no-img-element */
import { AVATAR_OPTIONS, type AvatarConfig } from "@/lib/playerpage";

const cssOf = (list: readonly { id: string; css?: string }[], id: string) =>
  list.find((o) => o.id === id)?.css ?? "";

/**
 * The cartoon ballplayer avatar. Pure SVG built from the builder config —
 * renders identically on server and client (builder preview, page hero,
 * teammate strip).
 */
export function Avatar({
  config,
  photoDataUrl,
  size = 96,
}: {
  config: AvatarConfig;
  photoDataUrl?: string | null;
  size?: number;
}) {
  if (photoDataUrl) {
    return (
      <img
        src={photoDataUrl}
        alt="Player photo"
        width={size}
        height={size}
        className="rounded-full border-2 border-line-strong object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const skin = cssOf(AVATAR_OPTIONS.skin, config.skin) || "#eab98a";
  const hair = cssOf(AVATAR_OPTIONS.hairColor, config.hairColor) || "#5b3a1e";
  const cap = cssOf(AVATAR_OPTIONS.cap, config.cap);
  const showCap = config.cap !== "none" && cap !== "";

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label="Player avatar"
    >
      {/* jersey */}
      <path d="M22 96 Q24 74 50 72 Q76 74 78 96 Z" fill="#ffffff" stroke="#171a20" strokeWidth="2" />
      <path d="M42 74 L50 84 L58 74" fill="none" stroke="#f47f0c" strokeWidth="3" />
      {/* neck */}
      <rect x="44" y="62" width="12" height="12" rx="5" fill={skin} />
      {/* face */}
      <circle cx="50" cy="44" r="24" fill={skin} stroke="#171a20" strokeWidth="1.5" />
      {/* hair behind cap */}
      {config.hairStyle === "flow" && (
        <path
          d="M26 44 Q24 62 32 66 L36 58 M74 44 Q76 62 68 66 L64 58"
          fill="none"
          stroke={hair}
          strokeWidth="7"
          strokeLinecap="round"
        />
      )}
      {config.hairStyle === "curly" && (
        <>
          <circle cx="30" cy="36" r="6" fill={hair} />
          <circle cx="70" cy="36" r="6" fill={hair} />
          <circle cx="34" cy="28" r="6" fill={hair} />
          <circle cx="66" cy="28" r="6" fill={hair} />
        </>
      )}
      {(config.hairStyle === "short" || config.hairStyle === "buzz") && (
        <path
          d="M28 40 Q28 22 50 21 Q72 22 72 40 Q66 30 50 29 Q34 30 28 40 Z"
          fill={hair}
          opacity={config.hairStyle === "buzz" ? 0.55 : 1}
        />
      )}
      {/* cap */}
      {showCap && (
        <>
          <path d="M27 36 Q28 17 50 16 Q72 17 73 36 Q50 28 27 36 Z" fill={cap} stroke="#171a20" strokeWidth="1.5" />
          <path d="M27 34 Q18 36 16 41 Q30 41 34 38 Z" fill={cap} stroke="#171a20" strokeWidth="1.5" />
          <circle cx="50" cy="16" r="2.4" fill={cap} stroke="#171a20" strokeWidth="1" />
        </>
      )}
      {/* eyes */}
      {config.eyes === "happy" && (
        <>
          <path d="M38 44 q4 -5 8 0" fill="none" stroke="#171a20" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M54 44 q4 -5 8 0" fill="none" stroke="#171a20" strokeWidth="2.4" strokeLinecap="round" />
        </>
      )}
      {config.eyes === "game" && (
        <>
          <circle cx="42" cy="44" r="2.6" fill="#171a20" />
          <circle cx="58" cy="44" r="2.6" fill="#171a20" />
          <path d="M36 38 l10 2 M64 38 l-10 2" stroke="#171a20" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {config.eyes === "wink" && (
        <>
          <circle cx="42" cy="44" r="2.6" fill="#171a20" />
          <path d="M54 44 q4 -4 8 0" fill="none" stroke="#171a20" strokeWidth="2.4" strokeLinecap="round" />
        </>
      )}
      {/* extras */}
      {config.extra === "eyeblack" && (
        <>
          <rect x="36" y="49" width="10" height="3.4" rx="1.6" fill="#171a20" />
          <rect x="54" y="49" width="10" height="3.4" rx="1.6" fill="#171a20" />
        </>
      )}
      {config.extra === "shades" && (
        <>
          <rect x="34" y="39" width="14" height="8" rx="3" fill="#171a20" />
          <rect x="52" y="39" width="14" height="8" rx="3" fill="#171a20" />
          <path d="M48 42 h4" stroke="#171a20" strokeWidth="2.5" />
        </>
      )}
      {/* smile */}
      <path d="M42 57 q8 7 16 0" fill="none" stroke="#171a20" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
