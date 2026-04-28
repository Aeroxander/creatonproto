import { AppContext } from '../../../context'
import { Server } from '../../../lexicon'
import community from './community'
import discussion from './discussion'

export default function (server: Server, ctx: AppContext) {
    community(server, ctx)
    discussion(server, ctx)
}
