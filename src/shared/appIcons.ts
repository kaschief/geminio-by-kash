/** Every icon the user can pick. Each id is also the file name of its artwork in
 * `resources/app-icons/`. Monoline is the default and the icon baked into the app bundle. */
export const APP_ICONS = [
  'monoline', 'portal', 'deboss', 'night-slab', 'terminal',
  'crystal', 'topo', 'water', 'mercury', 'blueprint'
] as const
export type AppIconId = typeof APP_ICONS[number]
export const DEFAULT_APP_ICON: AppIconId = 'monoline'
export interface AppIconPreference { icon: AppIconId }

/** Anything unrecognised, including the style-and-colour shape saved by earlier
 * versions, falls back to the default rather than failing. */
export function normalizeAppIcon(value?: Partial<AppIconPreference> | null): AppIconPreference {
  return { icon: APP_ICONS.includes(value?.icon as AppIconId) ? value!.icon! : DEFAULT_APP_ICON }
}
