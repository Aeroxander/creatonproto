import { AppContext } from '../../../context'
import { Server } from '../../../lexicon'
import community from './community'

export default function (server: Server, ctx: AppContext) {
    community(server, ctx)
}
