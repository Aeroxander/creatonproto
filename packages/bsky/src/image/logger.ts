import { subsystemLogger } from '@creatonproto/common'

export const logger: ReturnType<typeof subsystemLogger> =
  subsystemLogger('bsky:image')

export default logger
