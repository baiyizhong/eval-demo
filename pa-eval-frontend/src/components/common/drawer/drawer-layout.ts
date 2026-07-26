const DRAWER_CONTENT_CLASS_NAME =
  'h-full min-h-0 overflow-hidden gap-0 bg-white data-[state=closed]:duration-150 data-[state=open]:duration-200 [&>button:last-child]:hidden'
const DRAWER_HEADER_CLASS_NAME = 'shrink-0 border-b shadow-sm'
const DRAWER_BODY_CLASS_NAME =
  'min-h-0 flex-1 overflow-y-auto overscroll-contain'

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
