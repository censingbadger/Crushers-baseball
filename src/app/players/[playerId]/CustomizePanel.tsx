"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import {
  AVATAR_OPTIONS,
  BG_CHOICES,
  BORDER_CHOICES,
  FONT_STACKS,
  WALLPAPERS,
  type AvatarConfig,
} from "@/lib/playerpage";
import type { PageFont } from "@/db/schema";
import { savePlayerPage } from "@/app/players/actions";

function Swatch({
  css,
  selected,
  onClick,
  label,
}: {
  css: string;
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={`h-8 w-8 rounded-full border-2 transition-transform ${
        selected ? "scale-110 border-team-orange shadow" : "border-line-strong"
      }`}
      style={{ background: css || "#fff" }}
    />
  );
}

export function CustomizePanel({
  playerId,
  initialAvatar,
  initialBg,
  initialBorder,
  initialFont,
  initialWallpaper,
  hasPhoto,
}: {
  playerId: string;
  initialAvatar: AvatarConfig;
  initialBg: string;
  initialBorder: string;
  initialFont: PageFont;
  initialWallpaper: string;
  hasPhoto: boolean;
}) {
  const [avatar, setAvatar] = useState<AvatarConfig>(initialAvatar);
  const [bg, setBg] = useState(initialBg);
  const [border, setBorder] = useState(initialBorder);
  const [font, setFont] = useState<PageFont>(initialFont);
  const [wallpaper, setWallpaper] = useState(initialWallpaper);

  const set = (key: keyof AvatarConfig, value: string) =>
    setAvatar((a) => ({ ...a, [key]: value }));

  return (
    <details className="card p-4">
      <summary className="cursor-pointer text-lg font-bold">
        🎨 Make it yours — avatar, colors & wallpaper
      </summary>
      <form action={savePlayerPage} className="mt-3 space-y-4">
        <input type="hidden" name="playerId" value={playerId} />
        {(Object.keys(avatar) as (keyof AvatarConfig)[]).map((k) => (
          <input key={k} type="hidden" name={k} value={avatar[k]} />
        ))}
        <input type="hidden" name="bgColor" value={bg} />
        <input type="hidden" name="borderColor" value={border} />
        <input type="hidden" name="font" value={font} />
        <input type="hidden" name="wallpaper" value={wallpaper} />

        <div className="flex flex-wrap gap-6">
          <div className="shrink-0">
            <Avatar config={avatar} size={120} />
          </div>
          <div className="min-w-64 flex-1 space-y-3">
            <div>
              <span className="label">Skin</span>
              <div className="flex gap-1.5">
                {AVATAR_OPTIONS.skin.map((o) => (
                  <Swatch key={o.id} css={o.css} label={`Skin ${o.id}`} selected={avatar.skin === o.id} onClick={() => set("skin", o.id)} />
                ))}
              </div>
            </div>
            <div>
              <span className="label">Hair</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {AVATAR_OPTIONS.hairStyle.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => set("hairStyle", o.id)}
                    className={`btn px-2 py-1 text-xs ${avatar.hairStyle === o.id ? "btn-blue" : ""}`}
                  >
                    {o.label}
                  </button>
                ))}
                {AVATAR_OPTIONS.hairColor.map((o) => (
                  <Swatch key={o.id} css={o.css} label={`Hair color ${o.id}`} selected={avatar.hairColor === o.id} onClick={() => set("hairColor", o.id)} />
                ))}
              </div>
            </div>
            <div>
              <span className="label">Cap</span>
              <div className="flex items-center gap-1.5">
                {AVATAR_OPTIONS.cap.map((o) =>
                  o.id === "none" ? (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => set("cap", o.id)}
                      className={`btn px-2 py-1 text-xs ${avatar.cap === "none" ? "btn-blue" : ""}`}
                    >
                      No cap
                    </button>
                  ) : (
                    <Swatch key={o.id} css={o.css} label={`Cap ${o.id}`} selected={avatar.cap === o.id} onClick={() => set("cap", o.id)} />
                  ),
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <div>
                <span className="label">Eyes</span>
                <div className="flex gap-1.5">
                  {AVATAR_OPTIONS.eyes.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => set("eyes", o.id)}
                      className={`btn px-2 py-1 text-xs ${avatar.eyes === o.id ? "btn-blue" : ""}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="label">Extras</span>
                <div className="flex gap-1.5">
                  {AVATAR_OPTIONS.extra.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => set("extra", o.id)}
                      className={`btn px-2 py-1 text-xs ${avatar.extra === o.id ? "btn-blue" : ""}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="label">Background</span>
            <div className="flex flex-wrap gap-1.5">
              {BG_CHOICES.map((o) => (
                <Swatch key={o.id} css={o.css} label={o.label} selected={bg === o.id} onClick={() => setBg(o.id)} />
              ))}
            </div>
          </div>
          <div>
            <span className="label">Border</span>
            <div className="flex flex-wrap gap-1.5">
              {BORDER_CHOICES.map((o) => (
                <Swatch key={o.id} css={o.css} label={o.label} selected={border === o.id} onClick={() => setBorder(o.id)} />
              ))}
            </div>
          </div>
          <div>
            <span className="label">Font</span>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(FONT_STACKS) as PageFont[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFont(f)}
                  className={`btn px-3 py-1 text-sm ${font === f ? "btn-blue" : ""}`}
                  style={{ fontFamily: FONT_STACKS[f].css }}
                >
                  {FONT_STACKS[f].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label">Wallpaper</span>
            <div className="flex flex-wrap gap-1.5">
              {WALLPAPERS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWallpaper(w.id)}
                  className={`btn px-3 py-1 text-sm ${wallpaper === w.id ? "btn-blue" : ""}`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="photo">
              Or use a photo (max 700 KB)
            </label>
            <input className="field" id="photo" name="photo" type="file" accept="image/png,image/jpeg,image/webp" />
          </div>
          {hasPhoto && (
            <label className="flex items-center gap-1.5 text-sm font-semibold">
              <input type="checkbox" name="removePhoto" value="1" /> Remove photo,
              use avatar
            </label>
          )}
          <button className="btn btn-primary ml-auto" type="submit">
            Save my page
          </button>
        </div>
      </form>
    </details>
  );
}
