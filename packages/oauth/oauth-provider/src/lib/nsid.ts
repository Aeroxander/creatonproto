import { NSID } from '@creatonproto/syntax'
export { NSID }

export function parseNSID(value: string): NSID | null {
  try {
    return NSID.parse(value)
  } catch {
    return null
  }
}
