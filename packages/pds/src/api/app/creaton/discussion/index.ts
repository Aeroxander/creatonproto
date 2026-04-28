import { AppContext } from '../../../../context'
import { Server } from '../../../../lexicon'
import createTopic from './createTopic'
import joinTopic from './joinTopic'
import leaveTopic from './leaveTopic'
import getTopicMembership from './getTopicMembership'

export default function (server: Server, ctx: AppContext) {
    createTopic(server, ctx)
    joinTopic(server, ctx)
    leaveTopic(server, ctx)
    getTopicMembership(server, ctx)
}
