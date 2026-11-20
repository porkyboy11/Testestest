"use strict";
const EXTENSION_ID = 'bunnymo_lumiverse';
const ARCHIVE_MARKER = '[BunnyMo Spindle]';
const SETTINGS_PATH = 'settings.json';
const INDEX_PATH = 'archive-index.json';
const DEFAULT_MAX_TOKENS = 16000;
const MIN_CHAT_MESSAGES_WARNING = 20;
const activeJobs = new Set();
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function send(userId, payload) {
    spindle.sendToFrontend(payload, userId);
}
function hasPermissions(required) {
    return required.filter((permission) => !spindle.permissions.has(permission));
}
async function getSettings(userId) {
    return spindle.userStorage.getJson(SETTINGS_PATH, {
        fallback: { sourceBookId: null, maxOutputTokens: DEFAULT_MAX_TOKENS },
        userId,
    });
}
async function setSettings(patch, userId) {
    const current = await getSettings(userId);
    const next = { ...current, ...patch };
    await spindle.userStorage.setJson(SETTINGS_PATH, next, { indent: 2, userId });
    return next;
}
async function listAllWorldBooks() {
    const all = [];
    let offset = 0;
    while (true) {
        const page = await spindle.world_books.list({ limit: 200, offset });
        all.push(...(page.data ?? []));
        if (all.length >= (page.total ?? 0) || !page.data?.length)
            break;
        offset += page.data.length;
    }
    return all;
}
async function listAllEntries(bookId) {
    const all = [];
    let offset = 0;
    while (true) {
        const page = await spindle.world_books.entries.list(bookId, { limit: 200, offset });
        all.push(...(page.data ?? []));
        if (all.length >= (page.total ?? 0) || !page.data?.length)
            break;
        offset += page.data.length;
    }
    return all;
}
function isBunnyMoBook(book) {
    const haystack = `${book.name ?? ''} ${book.description ?? ''}`;
    return /bunny\s*mo|bunnymo|bunnmo/i.test(haystack);
}
function detectSourceBook(books, configuredId) {
    if (configuredId)
        return books.find((book) => book.id === configuredId) ?? null;
    const candidates = books.filter(isBunnyMoBook);
    const core = candidates.find((book) => /core|main|framework/i.test(book.name ?? ''));
    if (core)
        return core;
    return candidates.length === 1 ? candidates[0] : null;
}
async function getActiveChatAndCharacter() {
    const chat = await spindle.chats.getActive();
    if (!chat)
        throw new Error('Open a character chat before generating a BunnyMo sheet.');
    if (!chat.character_id)
        throw new Error('The active chat does not have an associated character card.');
    const character = await spindle.characters.get(chat.character_id);
    if (!character)
        throw new Error('Could not retrieve the character card associated with this chat.');
    return { chat, character };
}
async function getArchiveBookForChat(chat, character) {
    const books = await listAllWorldBooks();
    let archive = books.find((book) => book.metadata?.[EXTENSION_ID]?.managed === true
        && book.metadata?.[EXTENSION_ID]?.chatId === chat.id);
    if (!archive) {
        archive = await spindle.world_books.create({
            name: `BunnyMo Archive — ${chat.name || character.name}`,
            description: `Private BunnyMo character archive for this Lumiverse chat. Managed by ${EXTENSION_ID}.`,
            metadata: {
                [EXTENSION_ID]: {
                    managed: true,
                    chatId: chat.id,
                    characterId: character.id,
                    createdAt: new Date().toISOString(),
                },
            },
        });
    }
    if (!archive)
        throw new Error('Could not create or locate this chat’s BunnyMo archive.');
    const currentChat = await spindle.chats.get(chat.id);
    if (!currentChat)
        throw new Error('The active chat could not be reloaded before attaching its archive.');
    const metadata = currentChat.metadata && typeof currentChat.metadata === 'object'
        ? currentChat.metadata
        : {};
    const attachedIds = Array.isArray(metadata.chat_world_book_ids)
        ? metadata.chat_world_book_ids.filter((id) => typeof id === 'string')
        : [];
    if (!attachedIds.includes(archive.id)) {
        // chats.update replaces the metadata object, so merge the existing metadata first.
        await spindle.chats.update(chat.id, {
            metadata: { ...metadata, chat_world_book_ids: [...attachedIds, archive.id] },
        });
    }
    return archive;
}
function stripExistingArchiveFromMessages(messages, oldContent) {
    if (!oldContent)
        return messages;
    return messages
        .map((message) => {
        if (typeof message.content !== 'string')
            return message;
        if (message.content === oldContent)
            return null;
        if (message.content.includes(oldContent)) {
            return { ...message, content: message.content.replace(oldContent, '').trim() };
        }
        return message;
    })
        .filter((message) => message !== null);
}
function validateFullsheet(content, finishReason) {
    const trimmed = content.trim();
    if (!trimmed || trimmed.length < 700) {
        throw new Error('The model returned an unusually short response. Nothing was saved. Try again with more chat context or a model with a larger output limit.');
    }
    if (finishReason && /length|max[_ -]?tokens/i.test(finishReason)) {
        throw new Error('The model appears to have hit its output limit. The previous archive was left unchanged. Increase the output limit and retry.');
    }
    const looksLikeSheet = /bunnymotags|tag synthesis|psychological analysis|character sheet|life narrative|attachment style/i.test(trimmed);
    if (!looksLikeSheet) {
        throw new Error('The response did not look like a BunnyMo character sheet. Nothing was saved. Check that the BunnyMo core lorebook is active in this chat.');
    }
}
async function saveBackup(chatId, entry, userId) {
    const safeChatId = chatId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = `backups/${safeChatId}/${stamp}.json`;
    await spindle.userStorage.setJson(path, {
        backedUpAt: new Date().toISOString(),
        entryId: entry.id,
        comment: entry.comment,
        content: entry.content,
        key: entry.key,
        keysecondary: entry.keysecondary,
        position: entry.position,
        depth: entry.depth,
        role: entry.role,
        selective: entry.selective,
        constant: entry.constant,
        disabled: entry.disabled,
    }, { indent: 2, userId });
}
async function generateFullsheet(userId) {
    const required = ['chats', 'chat_mutation', 'characters', 'generation', 'world_books'];
    const missing = hasPermissions(required);
    if (missing.length) {
        throw new Error(`Grant these permissions in Lumiverse → Extensions → BunnyMo for Lumiverse: ${missing.join(', ')}.`);
    }
    const { chat, character } = await getActiveChatAndCharacter();
    if (activeJobs.has(chat.id))
        throw new Error('A BunnyMo generation is already running for this chat.');
    activeJobs.add(chat.id);
    try {
        send(userId, { type: 'bunnymo_status', status: 'reading', message: 'Reading this chat and preparing BunnyMo context…' });
        // Explicitly read the main conversation. dryRun below supplies the native assembled prompt,
        // including the active preset, character context, attached books and chat history.
        const chatMessages = await spindle.chat.getMessages(chat.id, {
            light: true,
            includeExtra: false,
        });
        if (!Array.isArray(chatMessages) || chatMessages.length === 0) {
            throw new Error('This chat has no readable messages yet. Build some roleplay context before generating a sheet.');
        }
        const settings = await getSettings(userId);
        const books = await listAllWorldBooks();
        const sourceBook = detectSourceBook(books, settings.sourceBookId);
        if (!sourceBook) {
            const candidates = books.filter(isBunnyMoBook).map((book) => book.name).join(', ');
            throw new Error(candidates
                ? `More than one BunnyMo book was found (${candidates}). Open the BunnyMo drawer tab and select the core/main lorebook.`
                : 'No BunnyMo lorebook was detected. Install the BunnyMo core lorebook in Lumiverse first, then refresh the BunnyMo panel.');
        }
        const sourceEntries = await listAllEntries(sourceBook.id);
        const commandEntries = sourceEntries.filter((entry) => {
            const keys = Array.isArray(entry.key) ? entry.key : [];
            const hasCommand = /!fullsheet/i.test(String(entry.content ?? ''))
                || keys.some((key) => /!fullsheet/i.test(key));
            return hasCommand && !entry.disabled;
        });
        if (commandEntries.length === 0) {
            throw new Error(`No enabled !fullsheet instruction entry was found in “${sourceBook.name}”. Check that you selected the BunnyMo core book and that its Fullsheet master entry is enabled.`);
        }
        // BunnyMo's V3 lorebook uses enabled keyless "Master Entries" plus a separate
        // !fullsheet-keyed instruction entry. The command is intentionally not written
        // into the chat, so explicitly inject those enabled core entries into this private run.
        const coreEntriesToInject = sourceEntries.filter((entry) => {
            if (entry.disabled)
                return false;
            const keys = Array.isArray(entry.key) ? entry.key : [];
            const isKeylessMasterEntry = keys.length === 0;
            const isFullsheetCommand = commandEntries.some((command) => command.id === entry.id);
            return isKeylessMasterEntry || isFullsheetCommand;
        });
        send(userId, { type: 'bunnymo_status', status: 'assembling', message: `Found ${coreEntriesToInject.length} enabled BunnyMo core/master instructions. Assembling the native Lumiverse prompt…` });
        const assembled = await spindle.generate.dryRun({ chatId: chat.id }, userId);
        if (!assembled?.messages?.length) {
            throw new Error('Lumiverse returned no assembled prompt for this chat.');
        }
        // Locate this chat's existing archive entry so its old profile is not fed back into its own analysis.
        const index = await spindle.userStorage.getJson(INDEX_PATH, { fallback: {}, userId });
        const record = index[chat.id];
        let oldEntry = null;
        if (record?.entryId)
            oldEntry = await spindle.world_books.entries.get(record.entryId);
        if (!oldEntry) {
            const existingArchiveBook = books.find((book) => book.metadata?.[EXTENSION_ID]?.managed === true
                && book.metadata?.[EXTENSION_ID]?.chatId === chat.id);
            if (existingArchiveBook) {
                const archiveEntries = await listAllEntries(existingArchiveBook.id);
                const matches = archiveEntries.filter((entry) => entry.extensions?.[EXTENSION_ID]?.managed === true
                    || (typeof entry.comment === 'string' && entry.comment.startsWith(`${ARCHIVE_MARKER} `)));
                if (matches.length === 1)
                    oldEntry = matches[0];
            }
        }
        let promptMessages = stripExistingArchiveFromMessages(assembled.messages, oldEntry?.content ?? null);
        // The command is not typed into the main chat. Supply the actual BunnyMo command instruction
        // entry privately if it was not already present in Lumiverse's assembled world-info context.
        const missingCoreInstructions = coreEntriesToInject.filter((entry) => typeof entry.content === 'string' && entry.content.length > 0
            && !promptMessages.some((message) => typeof message.content === 'string'
                && message.content.includes(entry.content)));
        if (missingCoreInstructions.length) {
            const instructions = missingCoreInstructions
                .map((entry) => `## ${entry.comment || 'BunnyMo core instructions'}\n${entry.content}`)
                .join('\n\n');
            const firstNonSystem = promptMessages.findIndex((message) => message.role !== 'system');
            const insertAt = firstNonSystem < 0 ? promptMessages.length : firstNonSystem;
            promptMessages.splice(insertAt, 0, {
                role: 'system',
                content: `BUNNYMO CORE / MASTER INSTRUCTIONS (retrieved from the user's installed lorebook):\n\n${instructions}`,
            });
        }
        if (chatMessages.length < MIN_CHAT_MESSAGES_WARNING) {
            send(userId, {
                type: 'bunnymo_status',
                status: 'warning',
                message: `Only ${chatMessages.length} messages are available. BunnyMo recommends building at least 20 messages of roleplay context. Continuing because you requested generation.`,
            });
        }
        promptMessages = [
            ...promptMessages,
            {
                role: 'user',
                content: `\n\n(OOC: PAUSE THE ROLEPLAY. Execute BunnyMo's !FULLSHEET command exactly as instructed by the installed BunnyMo core lorebook. Analyse the character card and the conversation history for this chat only. Character: ${character.name}. Produce the complete character analysis and BunnyMo tag output. Do not continue the roleplay. Return the sheet itself, not an explanation of the process.)`,
            },
        ];
        send(userId, { type: 'bunnymo_status', status: 'generating', message: `Generating BunnyMo Fullsheet for ${character.name}…` });
        const result = await spindle.generate.quiet({
            messages: promptMessages,
            parameters: { max_tokens: settings.maxOutputTokens || DEFAULT_MAX_TOKENS },
        });
        const content = String(result?.content ?? '').trim();
        validateFullsheet(content, result?.finish_reason);
        send(userId, { type: 'bunnymo_status', status: 'archiving', message: 'Sheet validated. Updating this chat’s private archive…' });
        const archiveBook = await getArchiveBookForChat(chat, character);
        const entries = await listAllEntries(archiveBook.id);
        const managedEntries = entries.filter((entry) => entry.extensions?.[EXTENSION_ID]?.managed === true
            || (typeof entry.comment === 'string' && entry.comment.startsWith(`${ARCHIVE_MARKER} `)));
        if (managedEntries.length > 1) {
            throw new Error('This chat archive contains multiple managed BunnyMo entries. No entry was changed; remove the duplicate managed entries and retry.');
        }
        const existing = managedEntries[0] ?? oldEntry;
        let savedEntry;
        if (existing) {
            await saveBackup(chat.id, existing, userId);
            // Only update content. Existing activation keywords, position, role and other user settings survive.
            savedEntry = await spindle.world_books.entries.update(existing.id, { content });
        }
        else {
            savedEntry = await spindle.world_books.entries.create(archiveBook.id, {
                key: [character.name],
                keysecondary: [],
                content,
                comment: `${ARCHIVE_MARKER} ${character.name}`,
                position: 0,
                depth: 4,
                role: 'system',
                selective: false,
                constant: false,
                disabled: false,
                probability: 100,
                use_probability: false,
                priority: 10,
                extensions: {
                    [EXTENSION_ID]: {
                        managed: true,
                        chatId: chat.id,
                        characterId: character.id,
                        sheetType: 'fullsheet',
                    },
                },
            });
        }
        const nextIndex = {
            ...index,
            [chat.id]: {
                chatId: chat.id,
                characterId: character.id,
                worldBookId: archiveBook.id,
                entryId: savedEntry.id,
                lastSheetType: 'fullsheet',
                updatedAt: new Date().toISOString(),
            },
        };
        await spindle.userStorage.setJson(INDEX_PATH, nextIndex, { indent: 2 });
        send(userId, {
            type: 'bunnymo_done',
            chatId: chat.id,
            characterName: character.name,
            message: `Fullsheet saved to “${archiveBook.name}”. This archive belongs only to this chat.`,
            messageCount: chatMessages.length,
            outputLength: content.length,
            finishReason: result?.finish_reason ?? 'unknown',
        });
    }
    finally {
        activeJobs.delete(chat.id);
    }
}
async function getPanelState(userId) {
    const missing = hasPermissions(['chats', 'characters', 'world_books']);
    if (missing.length)
        return { missingPermissions: missing, books: [], chat: null };
    const settings = await getSettings(userId);
    const books = await listAllWorldBooks();
    let chat = null;
    let character = null;
    let archive = null;
    let globalIds = [];
    let activatedBookIds = [];
    try {
        const active = await spindle.chats.getActive();
        if (active) {
            chat = active;
            character = active.character_id ? await spindle.characters.get(active.character_id) : null;
            archive = books.find((book) => book.metadata?.[EXTENSION_ID]?.managed === true
                && book.metadata?.[EXTENSION_ID]?.chatId === active.id) ?? null;
            globalIds = typeof spindle.world_books.getGlobal === 'function'
                ? await spindle.world_books.getGlobal()
                : [];
            if (typeof spindle.world_books.getActivated === 'function') {
                const activated = await spindle.world_books.getActivated(active.id, userId);
                activatedBookIds = Array.from(new Set((activated ?? []).map((entry) => String(entry.bookId ?? '')).filter((id) => id.length > 0)));
            }
        }
    }
    catch (error) {
        spindle.log.warn(`BunnyMo panel context discovery: ${errorMessage(error)}`);
    }
    const characterBookIds = Array.isArray(character?.world_book_ids) ? character.world_book_ids : [];
    const chatBookIds = Array.isArray(chat?.metadata?.chat_world_book_ids) ? chat.metadata.chat_world_book_ids : [];
    const attachedIds = [...new Set([...characterBookIds, ...chatBookIds, ...globalIds, ...activatedBookIds])];
    const attachedBooks = books.filter((book) => attachedIds.includes(book.id));
    const candidates = books.filter(isBunnyMoBook);
    const attachedBunnyMo = attachedBooks.filter(isBunnyMoBook);
    const preferred = attachedBunnyMo.find((book) => /core|main|framework/i.test(book.name ?? ''))
        ?? (attachedBunnyMo.length === 1 ? attachedBunnyMo[0] : null);
    const configured = settings.sourceBookId ? books.find((book) => book.id === settings.sourceBookId) ?? null : null;
    const detected = configured ?? preferred ?? detectSourceBook(books, null);
    return {
        books: books.map((book) => ({
            id: book.id,
            name: book.name,
            description: book.description,
            attachedToCurrentContext: attachedIds.includes(book.id),
            isBunnyMo: isBunnyMoBook(book),
        })),
        attachedBookIds: attachedIds,
        attachedBunnyMoBookIds: attachedBunnyMo.map((book) => book.id),
        selectedSourceBookId: detected?.id || '',
        sourceBookDetected: Boolean(detected),
        sourceBookHint: preferred ? `Detected attached BunnyMo book: ${preferred.name}`
            : candidates.length === 0 ? 'No book name or description identifies BunnyMo. All available books are still listed.'
                : attachedBunnyMo.length === 0 ? 'BunnyMo books exist, but none appear attached to this character, chat, or globally.'
                    : 'Multiple attached BunnyMo books found. Select the core/main book.',
        chat: chat ? { id: chat.id, name: chat.name, characterName: character?.name ?? chat.name } : null,
        archiveBook: archive ? { id: archive.id, name: archive.name } : null,
        maxOutputTokens: settings.maxOutputTokens,
        missingPermissions: [],
    };
}

spindle.onFrontendMessage(async (payload, userId) => {
    if (!payload || typeof payload.type !== 'string')
        return;
    try {
        if (payload.type === 'bunnymo_get_state') {
            send(userId, { type: 'bunnymo_state', state: await getPanelState(userId) });
            return;
        }
        if (payload.type === 'bunnymo_save_settings') {
            const patch = {};
            if (typeof payload.sourceBookId === 'string')
                patch.sourceBookId = payload.sourceBookId || null;
            if (Number.isInteger(payload.maxOutputTokens)) {
                patch.maxOutputTokens = Math.max(1000, Math.min(32000, payload.maxOutputTokens));
            }
            await setSettings(patch, userId);
            send(userId, { type: 'bunnymo_settings_saved', state: await getPanelState(userId) });
            return;
        }
        if (payload.type === 'bunnymo_generate_fullsheet') {
            await generateFullsheet(userId);
            return;
        }
    }
    catch (error) {
        const message = errorMessage(error);
        spindle.log.error(`[${EXTENSION_ID}] ${message}`);
        send(userId, { type: 'bunnymo_error', message });
    }
});
spindle.log.info('BunnyMo for Lumiverse backend loaded.');
