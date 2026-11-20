# BunnyMo for Lumiverse (Spindle)

A native Lumiverse Spindle extension that runs BunnyMo analysis in a private generation and archives the result in a lorebook dedicated to the current chat.

> **Prototype status:** 0.1.0 implements the first end-to-end `!fullsheet` path. It has not yet been exercised inside a live Lumiverse instance. Treat this as a test build and report any host/API incompatibilities.

## Core behaviour

- Reads the active chat's message history without writing to it.
- Uses Lumiverse `generate.dryRun()` to assemble the current chat's native prompt context, then `generate.quiet()` to run the analysis without a chat message.
- Retrieves the selected BunnyMo core book's enabled keyless Master Entries and `!fullsheet` command entry when they are not already in the assembled prompt. This matters because the command itself is kept out of the roleplay chat.
- Creates one dedicated `BunnyMo Archive — <chat name>` World Book per chat.
- Attaches that archive to the chat using `chat.metadata.chat_world_book_ids`.
- Creates one managed entry for the character in that chat's archive. Regeneration updates the same entry.
- Preserves existing entry activation keywords and settings when updating content.
- Saves the previous entry content to private extension storage before replacing it.
- Keeps separate chats using the same character card completely independent.
- Never appends, edits, hides or deletes messages in the roleplay chat.

## Important scope note

The current BunnyMo README documents `!fullsheet` as its analysis command. CarrotKernel contains additional sheet/template machinery, but its Tagsheet and Quicksheet paths are based on its own scanned-tag repository and templates. This prototype deliberately exposes only the documented BunnyMo Fullsheet command. Tagsheet and Quicksheet should be added as derived representations after the fullsheet pipeline is tested, rather than being presented as official BunnyMo commands prematurely.

## Install

1. Install this repository from Lumiverse's Extensions panel using its GitHub URL.
2. Grant the requested permissions: `chats`, `chat_mutation`, `characters`, `generation`, and `world_books`.
3. Ensure the BunnyMo core lorebook is installed in Lumiverse and active/attached to the chat as appropriate.
4. Open the BunnyMo drawer tab.
5. Select the BunnyMo core/main lorebook in the dropdown.
6. Open a character chat with some roleplay history and click **Generate Fullsheet**.

There is also a quick action in the chat input bar Extras popover.

## Requirements

- Lumiverse with Spindle support and the APIs documented in the official developer guide.
- BunnyMo core lorebook installed in Lumiverse.
- A working active LLM connection profile.
- For meaningful results, BunnyMo recommends building at least 20 messages of roleplay context and a high output-token allowance (13k+). The prototype defaults to 16k output tokens.

## Safety / data handling

- The extension reads chat messages and native assembled prompt context. This content is sent to the user's configured active LLM connection for the private analysis, just as a normal generation would be.
- The generation result is not inserted into the chat.
- The archive is attached to the current chat, not to the character card and not globally.
- Backups are stored in the extension's private storage directory.
- The extension does not delete chats, lorebooks or existing user entries.

## Development

Prebuilt `dist/backend.js` and `dist/frontend.js` are included, so the test build can be installed directly. For local development with Bun:

```bash
bun install
bun run build
```

Type checking:

```bash
npx tsc --noEmit
```

## Known limitations in this first prototype

- Only `!fullsheet` is exposed until the base workflow is proven.
- BunnyMo core book selection is manual if automatic detection is ambiguous.
- The archive is one World Book per chat; this is intentional to prevent a character's sheet from activating in unrelated chats.
- The current version does not yet include an archive browser, manual rollback UI, template editor, or pack manager.
- The Lumiverse host API and prompt assembly should be verified in the user's live installation before considering this release stable.

## Official references

- [Lumiverse Spindle Quick Start](https://docs.lumiverse.chat/getting-started/quick-start/)
- [Lumiverse Generation API](https://docs.lumiverse.chat/backend-api/generation/)
- [Lumiverse Chat API](https://docs.lumiverse.chat/backend-api/chats/)
- [Lumiverse Chat Mutation API](https://docs.lumiverse.chat/backend-api/chat-mutation/)
- [Lumiverse World Books API](https://docs.lumiverse.chat/backend-api/world-books/)
- [BunnyMo repository](https://github.com/Coneja-Chibi/BunnyMo)
- [CarrotKernel repository](https://github.com/Coneja-Chibi/CarrotKernel)
