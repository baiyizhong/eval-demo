export function matchPermission(
  userCode: string,
  effectiveCodes: string[]
): boolean {
  if (effectiveCodes.some((code) => code === '*')) {
    return true
  }

  return effectiveCodes.some((code) => {
    if (userCode === code) {
      return true
    }

    const codeParts = code.split(':')
    const userParts = userCode.split(':')

    if (codeParts.length !== userParts.length) {
      return false
    }

    return codeParts.every(
      (part, index) => part === '*' || part === userParts[index]
    )
  })
}
