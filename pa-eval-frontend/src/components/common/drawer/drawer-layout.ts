const DRAWER_CONTENT_CLASS_NAME =
  'h-full min-h-0 overflow-hidden gap-0 bg-white [&>button:last-child]:hidden'
const DRAWER_HEADER_CLASS_NAME = 'shrink-0 border-b shadow-sm'
const DRAWER_BODY_CLASS_NAME = 'min-h-0 flex-1 overflow-y-auto'

function getDrawerContentClassName(): string {
  return DRAWER_CONTENT_CLASS_NAME
}

function getDrawerHeaderClassName(): string {
  return DRAWER_HEADER_CLASS_NAME
}

function getDrawerBodyClassName(): string {
  return DRAWER_BODY_CLASS_NAME
}

export {
  getDrawerBodyClassName,
  getDrawerContentClassName,
  getDrawerHeaderClassName,
}
