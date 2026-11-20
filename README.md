# BunnyMo for Lumiverse (Spindle)

A native Lumiverse Spindle extension that runs BunnyMo analysis in a private generation and archives the result in a lorebook dedicated to the current chat.

> **Prototype status:** 0.1.0 implements the first end-to-end `!fullsheet` path. It has not yet been exercised inside a live Lumiverse instance. Treat this as a test build and report any host/API incompatibilities.

## Core behaviour

- Reads the active chat's message history without writing to it.
- Uses Lumiverse's native prompt assembly, then private quiet generation so the result does not appear as a chat message.
- Retrieves enabled BunnyMo Master Entries and the `!fullsheet` command entry from the selected core lorebook when needed.
- Creates one dedicated `BunnyMo Archive — <chat name>` World Book per chat.
- Creates one managed entry for the character in that chat's archive. Regeneration updates the same entry.
- Preserves existing entry activation keywords and settings when updating content.
- Saves the previous entry content to private extension storage before replacing it.
- Keeps separate chats using the same character card independent.
- Never appends, edits, hides or deletes messages in the roleplay chat.

## Scope of this prototype

The current BunnyMo README documents `!fullsheet` as its analysis command. CarrotKernel contains additional sheet/template machinery, but its Tagsheet and Quicksheet paths use its own scanned-tag repository and templates. This prototype deliberately exposes only the documented BunnyMo Fullsheet command. Alternative representations should be added after the core pipeline is verified.

## Install

1. In Lumiverse, open **Extensions → Install** and enter:
   `https://github.com/porkyboy11/Testestest`
2. Grant the requested permissions: `chats`, `chat_mutation`, `characters`, `generation`, and `world_books`.
3. Ensure the BunnyMo core lorebook is installed in Lumiverse and active/attached to the chat as appropriate.
4. Open the **BunnyMo** drawer tab.
5. Select your BunnyMo core/main lorebook in the dropdown.
6. Open a character chat with roleplay history and click **Generate Fullsheet**.

There is also a quick action in the chat input bar Extras popover.

## Requirements

- Lumiverse with Spindle support and the APIs documented in its developer guide.
- BunnyMo core lorebook installed in Lumiverse.
- A working active LLM connection profile.
- For meaningful results, BunnyMo recommends building at least 20 messages of roleplay context and a high output-token allowance (13k+). The prototype defaults to 16k output tokens.

## Safety and data handling

- Chat messages and assembled prompt context are sent to the user's configured active LLM connection for private analysis, as with a normal generation.
- The generation result is not inserted into the chat.
- The archive is attached to the current chat, not to the character card and not globally.
- Backups are stored in the extension's private storage directory.
- The extension does not delete chats, lorebooks or existing user entries.

## Development

Prebuilt `dist/backend.js` and `dist/frontend.js` are included. For local development with Bun:

```bash
bun install
bun run build
npx tsc --noEmit
```

## Known limitations

- Only `!fullsheet` is exposed until the base workflow is proven.
- BunnyMo core book selection is manual if automatic detection is ambiguous.
- The archive is one World Book per chat to prevent a character's sheet from activating in unrelated chats.
- There is no archive browser, manual rollback UI, template editor, or pack manager yet.
- The Lumiverse host API and prompt assembly must be verified in a live installation before treating this release as stable.

## Official references

- [Lumiverse Spindle Quick Start](https://docs.lumiverse.chat/getting-started/quick-start/)
- [Lumiverse Generation API](https://docs.lumiverse.chat/backend-api/generation/)
- [Lumiverse Chat API](https://docs.lumiverse.chat/backend-api/chats/)
- [Lumiverse Chat Mutation API](https://docs.lumiverse.chat/backend-api/chat-mutation/)
- [Lumiverse World Books API](https://docs.lumiverse.chat/backend-api/world-books/)
- [BunnyMo repository](https://github.com/Coneja-Chibi/BunnyMo)
- [CarrotKernel repository](https://github.com/Coneja-Chibi/CarrotKernel)

## First live-test checklist

1. Open a chat with a character and at least 20 roleplay messages.
2. Select the BunnyMo core book in the extension panel.
3. Generate a Fullsheet.
4. Confirm the main chat has no extra user or assistant messages.
5. Confirm a per-chat archive book and a character entry were created.
6. Generate again and confirm the same entry is updated and the prior version is backed up.
7. Open a different chat using the same character card and confirm it gets a separate archive.
