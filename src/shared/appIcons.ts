export const APP_ICON_STYLES = ['classic', 'monogram', 'branch', 'orbit', 'github'] as const
export const APP_ICON_COLORS = ['violet', 'ocean', 'mint', 'sunset', 'rose', 'graphite'] as const
export type AppIconStyle = typeof APP_ICON_STYLES[number]
export type AppIconColor = typeof APP_ICON_COLORS[number]
export interface AppIconPreference { style: AppIconStyle; color: AppIconColor; githubAvatarUrl?: string }
const palettes: Record<AppIconColor, [string, string]> = {
  violet: ['#9675FF', '#4934B4'], ocean: ['#4DBFFF', '#1252AA'],
  mint: ['#49D9B3', '#087D71'], sunset: ['#FFBD65', '#DF5B36'],
  rose: ['#F997CF', '#B63379'], graphite: ['#777E94', '#242B40']
}
export function normalizeAppIcon(value?: Partial<AppIconPreference> | null): AppIconPreference {
  return {
    style: APP_ICON_STYLES.includes(value?.style as AppIconStyle) ? value!.style! : 'classic',
    color: APP_ICON_COLORS.includes(value?.color as AppIconColor) ? value!.color! : 'violet',
    ...(githubAvatarUrl(value?.githubAvatarUrl) ? { githubAvatarUrl: githubAvatarUrl(value?.githubAvatarUrl)! } : {})
  }
}
export function appIconColor(color: AppIconColor): string { return palettes[color][0] }

/** Only public GitHub-hosted avatars can become local Dock icons. */
export function githubAvatarUrl(value?: string): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'avatars.githubusercontent.com' || url.port || url.username || url.password) return null
    url.searchParams.set('s', '512')
    return url.href
  } catch { return null }
}

/** Original dimensional vector artwork, rendered identically in the picker
 * and native icon assets. Retain style IDs so existing choices keep working. */
export function appIconSvg(style: Exclude<AppIconStyle, 'classic' | 'github'>, color: AppIconColor): string {
  const [light, dark] = palettes[color]
  const definitions = `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${dark}"/><stop offset="1" stop-color="#090D20"/></linearGradient>
    <radialGradient id="aura"><stop stop-color="${light}" stop-opacity=".7"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient>
    <linearGradient id="metal" x1="0" y1="0" x2=".75" y2="1"><stop stop-color="#fff"/><stop offset=".25" stop-color="#f3f6ff"/><stop offset=".5" stop-color="${light}"/><stop offset=".72" stop-color="#fff"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="white" stop-opacity=".5"/><stop offset=".45" stop-color="${light}" stop-opacity=".2"/><stop offset="1" stop-color="white" stop-opacity=".06"/></linearGradient>
    <radialGradient id="sphere" cx=".32" cy=".23" r=".75"><stop stop-color="white"/><stop offset=".23" stop-color="${light}"/><stop offset=".68" stop-color="${dark}"/><stop offset="1" stop-color="#0b1028"/></radialGradient>
    <linearGradient id="edge" x2=".5" y2="1"><stop stop-color="white" stop-opacity=".6"/><stop offset=".5" stop-color="${light}" stop-opacity=".15"/><stop offset="1" stop-color="${light}" stop-opacity=".7"/></linearGradient>
    <filter id="shadow" x="-40%" y="-40%" width="180%" height="200%"><feDropShadow dx="0" dy="15" stdDeviation="10" flood-color="#00081d" flood-opacity=".7"/></filter>
    <filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="9"/></filter>
    <clipPath id="tile"><rect x="50" y="50" width="412" height="412" rx="96"/></clipPath>
  </defs>`
  const base = `<rect x="50" y="56" width="412" height="412" rx="96" fill="#030612"/>
    <g clip-path="url(#tile)"><rect x="50" y="50" width="412" height="412" fill="url(#bg)"/>
    <ellipse cx="157" cy="113" rx="300" ry="240" fill="url(#aura)"/>
    <ellipse cx="424" cy="428" rx="260" ry="200" fill="url(#aura)" opacity=".65"/>
    <path d="M52 344 460 115M52 382 460 153M110 462 460 224" stroke="white" stroke-opacity=".045" stroke-width="1"/>
    <path d="M50 150Q215 80 462 210V50H50Z" fill="white" fill-opacity=".045"/></g>
    <rect x="51.5" y="51.5" width="409" height="409" rx="94.5" fill="none" stroke="url(#edge)" stroke-width="3"/>
    <rect x="61" y="61" width="390" height="390" rx="85" fill="none" stroke="white" stroke-opacity=".065"/>`
  const mark = style === 'monogram'
    ? `<g filter="url(#shadow)"><path d="m133 132 53-12v238l-53 28z" fill="url(#glass)" stroke="white" stroke-opacity=".35"/>
       <path d="M179 139h47v96l91-96h63L271 249l116 131h-66l-95-111v111h-47z" transform="translate(0 10)" fill="${dark}" stroke="#080f2d" stroke-width="7"/>
       <path d="M179 139h47v96l91-96h63L271 249l116 131h-66l-95-111v111h-47z" fill="url(#metal)" stroke="white" stroke-opacity=".6" stroke-width="1.5"/>
       <path d="M180 139h46v96l91-96h62L265 251 225 238V139M270 250l116 130-64-12-88-110" fill="white" fill-opacity=".15"/>
       <path d="m134 386 45-6V139l-45-7" fill="${light}" fill-opacity=".17"/></g>
       <path d="M171 102h40m-20-20v40" stroke="white" stroke-opacity=".8" stroke-width="2"/>`
    : style === 'branch'
      ? `<rect x="113" y="112" width="286" height="292" rx="58" transform="rotate(-10 256 256)" fill="url(#glass)" stroke="url(#edge)" stroke-width="2" filter="url(#shadow)"/>
         <path d="M185 171v166m0-61c0-73 145-14 145-105" fill="none" stroke="${light}" stroke-width="28" filter="url(#glow)"/>
         <path d="M185 171v166m0-61c0-73 145-14 145-105" fill="none" stroke="#111a40" stroke-width="30" stroke-linecap="round"/>
         <path d="M185 171v166m0-61c0-73 145-14 145-105" fill="none" stroke="url(#metal)" stroke-width="19" stroke-linecap="round"/>
         <g fill="url(#sphere)" stroke="white" stroke-opacity=".55" stroke-width="2" filter="url(#shadow)"><circle cx="185" cy="160" r="36"/><circle cx="330" cy="160" r="36"/><circle cx="185" cy="352" r="36"/></g>
         <g fill="white" opacity=".8"><ellipse cx="176" cy="146" rx="12" ry="7" transform="rotate(-30 176 146)"/><ellipse cx="321" cy="146" rx="12" ry="7" transform="rotate(-30 321 146)"/><ellipse cx="176" cy="338" rx="12" ry="7" transform="rotate(-30 176 338)"/></g>`
      : `<g fill="white"><circle cx="135" cy="151" r="2" opacity=".8"/><circle cx="370" cy="325" r="2" opacity=".7"/><circle cx="286" cy="107" r="2.5"/><circle cx="149" cy="372" r="2"/><circle cx="391" cy="208" r="1.5"/></g>
         <ellipse cx="256" cy="262" rx="174" ry="72" transform="rotate(-35 256 262)" fill="none" stroke="${light}" stroke-width="16" filter="url(#glow)" opacity=".65"/>
         <ellipse cx="256" cy="262" rx="174" ry="72" transform="rotate(-35 256 262)" fill="none" stroke="url(#metal)" stroke-width="11"/>
         <circle cx="257" cy="258" r="88" fill="url(#sphere)" stroke="white" stroke-opacity=".4" stroke-width="1.5" filter="url(#shadow)"/>
         <path d="M172 240c55 3 104 23 154 58" stroke="white" stroke-opacity=".16" stroke-width="18" fill="none"/>
         <path d="M114 351c32 38 119 9 208-55 81-59 129-118 90-139" fill="none" stroke="#050b23" stroke-width="17"/>
         <path d="M114 347c32 38 119 9 208-55 81-59 129-118 90-139" fill="none" stroke="url(#metal)" stroke-width="11"/>
         <circle cx="364" cy="150" r="26" fill="url(#sphere)" stroke="white" stroke-opacity=".8" stroke-width="1.5"/>
         <path d="M126 196h18m-9-9v18" stroke="white" stroke-width="1.5" opacity=".75"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${definitions}${base}${mark}</svg>`
}
