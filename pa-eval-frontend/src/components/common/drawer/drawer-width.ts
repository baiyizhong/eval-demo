type DrawerMode = 'default' | 'enhanced'

const DRAWER_WIDTHS: Record<DrawerMode, string> = {
  default: 'clamp(30rem, 32vw, 36rem)',
  enhanced: 'clamp(44rem, 50vw, 64rem)',
}

function getDrawerWidth(mode: DrawerMode, width?: string): string {
  return width ?? DRAWER_WIDTHS[mode]
}

export { DRAWER_WIDTHS, getDrawerWidth }
export type { DrawerMode }
