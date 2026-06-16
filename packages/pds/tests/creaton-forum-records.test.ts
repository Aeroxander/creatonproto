import { prepareCreate, InvalidRecordError } from '../src/repo'

const did = 'did:plc:12345678123456781234578'
const createdAt = '2026-05-29T00:00:00.000Z'
const cid = 'bafyreiclp443lavogvhj3d2ob2cxbfuscni2k5jk7bebjzg7khl3esabwq'
const board = {
  uri: `at://${did}/app.creaton.forum.board/main`,
  cid,
}
const topic = {
  uri: `at://${did}/app.creaton.forum.topic/3m7forumtopic`,
  cid,
}
const comment = {
  uri: `at://${did}/app.creaton.forum.comment/3m7forumcomment`,
  cid,
}

describe('creaton forum records', () => {
  it('validates forum graph records as known PDS schemas', async () => {
    const writes = await Promise.all([
      prepareCreate({
        did,
        collection: 'app.creaton.forum.board',
        rkey: 'main',
        validate: true,
        record: {
          $type: 'app.creaton.forum.board',
          title: 'Creaton General',
          scope: 'standalone',
          description: 'General Creaton forum board.',
          createdAt,
        },
      }),
      prepareCreate({
        did,
        collection: 'app.creaton.forum.member',
        rkey: 'board-main',
        validate: true,
        record: {
          $type: 'app.creaton.forum.member',
          board,
          createdAt,
        },
      }),
      prepareCreate({
        did,
        collection: 'app.creaton.forum.roleGrant',
        validate: true,
        record: {
          $type: 'app.creaton.forum.roleGrant',
          board,
          subject: did,
          role: 'moderator',
          createdAt,
        },
      }),
      prepareCreate({
        did,
        collection: 'app.creaton.forum.topic',
        validate: true,
        record: {
          $type: 'app.creaton.forum.topic',
          board,
          title: 'How should the pilot launch work?',
          body: 'Collect discussion before moving to production.',
          studioUri:
            'at://did:plc:12345678123456781234578/app.creaton.market.project/main',
          productionStage: 'premise',
          createdAt,
        },
      }),
      prepareCreate({
        did,
        collection: 'app.creaton.forum.comment',
        validate: true,
        record: {
          $type: 'app.creaton.forum.comment',
          topic,
          parent: comment,
          body: 'Start with proof from the pilot.',
          createdAt,
        },
      }),
      prepareCreate({
        did,
        collection: 'app.creaton.forum.vote',
        rkey: 'topic-3m7forumtopic',
        validate: true,
        record: {
          $type: 'app.creaton.forum.vote',
          subject: topic,
          direction: 'up',
          createdAt,
        },
      }),
    ])

    expect(writes.map((write) => write.validationStatus)).toEqual(
      Array(6).fill('valid'),
    )
  })

  it('rejects invalid forum records when validation is enabled', async () => {
    await expect(
      prepareCreate({
        did,
        collection: 'app.creaton.forum.topic',
        validate: true,
        record: {
          $type: 'app.creaton.forum.topic',
          board,
          body: 'Missing required title.',
          createdAt,
        },
      }),
    ).rejects.toThrow(InvalidRecordError)
  })
})
