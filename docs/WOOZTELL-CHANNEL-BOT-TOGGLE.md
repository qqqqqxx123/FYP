# Wooztell Channel-Level Bot Toggle (Virtual)

## Constraints

- **Wooztell Open API does NOT expose a channel-level chatbot toggle.**
- **channel.on** is NOT chatbot on/off and must **NEVER** be changed.
- Chatbot behavior is controlled **per-member** via `member:toggleLiveChat`.
- `liveChat = true` → human mode (bot OFF)
- `liveChat = false` → bot mode (bot ON)

## Strategy

Implement a "virtual channel chatbot switch" by toggling `liveChat` for **all members** in the channel.

## Implementation

### GraphQL Operations

**Query members (paginated):**
```graphql
query Members($channelId: String!, $first: IntMax100, $after: String) {
  apiViewer {
    members(channelId: $channelId, first: $first, after: $after) {
      edges {
        node {
          externalId
          botMeta { liveChat }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
```

**Toggle live chat per member:**
```graphql
mutation ToggleLiveChat($input: toggleLiveChatInput!) {
  toggleLiveChat(input: $input) {
    clientMutationId
  }
}
```
Input: `{ externalId, channel: channelId, liveChat: true|false }`

### lib/wooztell.ts

- **fetchChannelMembers(channelId)**: Paginates `apiViewer.members(channelId, first, after)`, returns `{ externalId, liveChat }[]`.
- **toggleMemberLiveChat(channelId, externalId, liveChat)**: Calls `toggleLiveChat` mutation.
- **getChannelBotStatus(channelId?)**: Samples first member's `liveChat`; returns `enabled = !liveChat`.
- **setChannelBotStatus(enabled, channelId?)**: Fetches all members, toggles each with `liveChat = !enabled`. Runs **sequentially** with 800ms delay between each toggle to avoid Wooztell "Too Many Request" rate limit. Each toggle retries once after 2s on rate limit. Logs failures but continues.

### API Routes

- **GET /api/woztell/channel/bot**: Returns `{ enabled }` (virtual status from first member).
- **POST /api/woztell/channel/bot**: Body `{ channelId?, enabled }`. Toggles all members. Returns `{ enabled, total, updated, failed }`. Requires session or `X-Admin-Secret` / `Authorization: Bearer <ADMIN_BOT_SECRET>`.

### UI

- Label: "Wooztell Bot"
- ON / OFF buttons
- Spinner and disabled state during batch update
- No database storage (Wooztell is source of truth)

## Safety

- **Never** modify `channel.on` or environment settings
- Process members in batches with limited concurrency
- Continue batch on individual failures; log them
