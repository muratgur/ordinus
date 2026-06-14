// ADR-046: X (Twitter) read tool surface (born enabled). Raw fetch to X API v2
// via the auth helper. Every response is passed through a shared lean mapper
// (toLeanTweet/toLeanUser) so the agent's context gets only the fields it needs
// — not raw X JSON (entities/includes/full metrics) — per the ADR-037 spirit.
//
// Write/interaction tools (post_tweet, reply_to_tweet, post_thread,
// delete_tweet, like_tweet, retweet, follow_user) are implemented below but born
// DISABLED — absent from the manifest's defaultEnabledTools, so the loopback
// proxy rejects them until the user opts in per tool in Settings.

import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const TWEET_FIELDS = 'created_at,public_metrics,author_id,conversation_id'
const USER_FIELDS = 'username,name,description,public_metrics,verified'

// X enforces its own per-call bounds; clamp to them to avoid 400s. This honors
// the API's limits — it is NOT an Ordinus-added page cap (ADR-046).
function clamp(value, min, max, fallback) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function usersById(payload) {
  const map = new Map()
  for (const user of payload.includes?.users ?? []) {
    map.set(user.id, user)
  }
  return map
}

function toLeanUser(user) {
  if (!user) return null
  const metrics = user.public_metrics ?? {}
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    ...(user.description ? { description: user.description } : {}),
    followers: metrics.followers_count,
    following: metrics.following_count,
    tweets: metrics.tweet_count,
    verified: user.verified ?? false
  }
}

function toLeanTweet(tweet, users) {
  const author = users?.get(tweet.author_id)
  const m = tweet.public_metrics ?? {}
  return {
    id: tweet.id,
    text: tweet.text,
    author: author ? `@${author.username}` : tweet.author_id,
    created_at: tweet.created_at,
    metrics: { likes: m.like_count, retweets: m.retweet_count, replies: m.reply_count }
  }
}

function toLeanList(payload) {
  const users = usersById(payload)
  return (payload.data ?? []).map((tweet) => toLeanTweet(tweet, users))
}

export const TOOLS = [
  {
    name: 'get_my_profile',
    description: 'Get the connected X account’s own profile (handle, name, bio, follower counts).',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_tweet',
    description:
      'Fetch one post (tweet) by id, with author, text, timestamp, and engagement metrics.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Tweet id.' } },
      required: ['id']
    }
  },
  {
    name: 'search_recent_tweets',
    description:
      'Search posts from the last ~7 days with X search syntax (e.g. "from:nasa -is:retweet"). Returns matching posts with author and metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'X recent-search query.' },
        maxResults: { type: 'number', description: 'Posts to return, 10–100 (default 10).' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_user_timeline',
    description: 'List a user’s recent posts by @handle.',
    inputSchema: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Handle without the @ (e.g. "nasa").' },
        maxResults: { type: 'number', description: 'Posts to return, 5–100 (default 10).' }
      },
      required: ['username']
    }
  },
  {
    name: 'get_mentions',
    description: 'List recent posts that mention the connected X account.',
    inputSchema: {
      type: 'object',
      properties: {
        maxResults: { type: 'number', description: 'Posts to return, 5–100 (default 10).' }
      }
    }
  },
  // ADR-046 Phase 3: write/interaction tools. All born DISABLED (absent from the
  // manifest's defaultEnabledTools), so the proxy rejects them until the user
  // opts in per tool in Settings — a public post is high-stakes and irreversible.
  {
    name: 'post_tweet',
    description: 'Post a new tweet (max 280 chars) as the connected account.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Tweet text (≤280 chars).' } },
      required: ['text']
    }
  },
  {
    name: 'reply_to_tweet',
    description: 'Reply to an existing tweet.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Reply text (≤280 chars).' },
        inReplyToId: { type: 'string', description: 'Id of the tweet being replied to.' }
      },
      required: ['text', 'inReplyToId']
    }
  },
  {
    name: 'post_thread',
    description: 'Post a thread — each text becomes a tweet replying to the previous one.',
    inputSchema: {
      type: 'object',
      properties: {
        texts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ordered tweet texts, one per post in the thread (each ≤280 chars).'
        }
      },
      required: ['texts']
    }
  },
  {
    name: 'delete_tweet',
    description: 'Delete one of the connected account’s own tweets by id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Tweet id to delete.' } },
      required: ['id']
    }
  },
  {
    name: 'like_tweet',
    description: 'Like a tweet by id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Tweet id to like.' } },
      required: ['id']
    }
  },
  {
    name: 'retweet',
    description: 'Retweet a tweet by id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Tweet id to retweet.' } },
      required: ['id']
    }
  },
  {
    name: 'follow_user',
    description: 'Follow a user by @handle.',
    inputSchema: {
      type: 'object',
      properties: { username: { type: 'string', description: 'Handle without the @ to follow.' } },
      required: ['username']
    }
  }
]

function ok(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] }
}

// X returns 200 with {errors:[…]} and NO `data` for unknown/deleted/protected/
// suspended resources. Guard so a tool reports a clean "not found" rather than
// crashing on a deref of undefined (e.g. tweet.id, user.data.id).
function requireData(payload, what) {
  if (!payload?.data) {
    const detail = payload?.errors?.[0]?.detail ?? payload?.errors?.[0]?.title
    throw new Error(`X: ${what} not found or not accessible${detail ? ` — ${detail}` : ''}.`)
  }
  return payload.data
}

export function registerTools(mcp, auth) {
  mcp.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }))

  // The like/retweet/follow endpoints are scoped to the acting user's id; resolve
  // it once and memoize for this (short-lived) server instance.
  let cachedMyId = null
  async function authedUserId() {
    if (!cachedMyId) {
      const me = await auth.json('/users/me')
      cachedMyId = requireData(me, 'your account').id
    }
    return cachedMyId
  }

  // Returns the created tweet's data ({id, text, …}); throws a clean error if X
  // responded without it (so post_thread can report partial progress).
  async function postTweet(text, inReplyToId) {
    const payload = await auth.json('/tweets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        ...(inReplyToId ? { reply: { in_reply_to_tweet_id: inReplyToId } } : {})
      })
    })
    return requireData(payload, 'posted tweet')
  }

  mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params

    if (name === 'get_my_profile') {
      const payload = await auth.json(`/users/me?user.fields=${USER_FIELDS}`)
      return ok(toLeanUser(requireData(payload, 'your account')))
    }

    if (name === 'get_tweet') {
      const payload = await auth.json(
        `/tweets/${encodeURIComponent(args.id)}?tweet.fields=${TWEET_FIELDS}&expansions=author_id&user.fields=${USER_FIELDS}`
      )
      return ok(toLeanTweet(requireData(payload, `tweet ${args.id}`), usersById(payload)))
    }

    if (name === 'search_recent_tweets') {
      const max = clamp(args.maxResults, 10, 100, 10)
      const payload = await auth.json(
        `/tweets/search/recent?query=${encodeURIComponent(args.query)}&max_results=${max}` +
          `&tweet.fields=${TWEET_FIELDS}&expansions=author_id&user.fields=${USER_FIELDS}`
      )
      return ok(toLeanList(payload))
    }

    if (name === 'get_user_timeline') {
      const user = await auth.json(`/users/by/username/${encodeURIComponent(args.username)}`)
      const userId = requireData(user, `user @${args.username}`).id
      const max = clamp(args.maxResults, 5, 100, 10)
      const payload = await auth.json(
        `/users/${userId}/tweets?max_results=${max}` +
          `&tweet.fields=${TWEET_FIELDS}&expansions=author_id&user.fields=${USER_FIELDS}`
      )
      return ok(toLeanList(payload))
    }

    if (name === 'get_mentions') {
      const max = clamp(args.maxResults, 5, 100, 10)
      const payload = await auth.json(
        `/users/${await authedUserId()}/mentions?max_results=${max}` +
          `&tweet.fields=${TWEET_FIELDS}&expansions=author_id&user.fields=${USER_FIELDS}`
      )
      return ok(toLeanList(payload))
    }

    // --- Phase 3 write/interaction tools (born disabled) ---

    if (name === 'post_tweet') {
      const data = await postTweet(args.text)
      return ok({ id: data.id, text: data.text })
    }

    if (name === 'reply_to_tweet') {
      const data = await postTweet(args.text, args.inReplyToId)
      return ok({ id: data.id, text: data.text })
    }

    if (name === 'post_thread') {
      const texts = Array.isArray(args.texts) ? args.texts : []
      if (texts.length === 0) {
        throw new Error('post_thread needs a non-empty "texts" array.')
      }
      // One stable result shape: { posted, failedAtIndex }. failedAtIndex is null
      // on full success; on a mid-thread failure the earlier tweets are already
      // live and irreversible, so we return their ids (never silently orphan a
      // public tweet) plus the error and a cleanup hint.
      const posted = []
      let previousId
      for (let i = 0; i < texts.length; i++) {
        try {
          const data = await postTweet(texts[i], previousId)
          previousId = data.id
          posted.push({ id: data.id, text: data.text })
        } catch (cause) {
          return ok({
            posted,
            failedAtIndex: i,
            error: cause instanceof Error ? cause.message : String(cause),
            note: 'Thread partially posted; the tweets above are live. Use delete_tweet with their ids to remove them.'
          })
        }
      }
      return ok({ posted, failedAtIndex: null })
    }

    if (name === 'delete_tweet') {
      const payload = await auth.json(`/tweets/${encodeURIComponent(args.id)}`, {
        method: 'DELETE'
      })
      return ok({ deleted: payload.data?.deleted ?? false })
    }

    if (name === 'like_tweet') {
      const payload = await auth.json(`/users/${await authedUserId()}/likes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tweet_id: args.id })
      })
      return ok({ liked: payload.data?.liked ?? false })
    }

    if (name === 'retweet') {
      const payload = await auth.json(`/users/${await authedUserId()}/retweets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tweet_id: args.id })
      })
      return ok({ retweeted: payload.data?.retweeted ?? false })
    }

    if (name === 'follow_user') {
      const target = await auth.json(`/users/by/username/${encodeURIComponent(args.username)}`)
      const targetId = requireData(target, `user @${args.username}`).id
      const payload = await auth.json(`/users/${await authedUserId()}/following`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target_user_id: targetId })
      })
      return ok({
        following: payload.data?.following ?? false,
        pending: payload.data?.pending_follow ?? false
      })
    }

    throw new Error(`Unknown tool: ${name}`)
  })
}
