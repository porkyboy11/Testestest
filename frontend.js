const STYLE = `
.bm-panel{padding:14px;color:var(--lumiverse-text);font-size:14px;display:flex;flex-direction:column;gap:12px}
.bm-muted{color:var(--lumiverse-text-muted);font-size:12px;line-height:1.45}
.bm-card{background:var(--lumiverse-fill-subtle);border:1px solid var(--lumiverse-border);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px}
.bm-row{display:flex;align-items:center;justify-content:space-between;gap:10px}
.bm-panel button,.bm-panel select,.bm-panel input{font:inherit;color:var(--lumiverse-text);background:var(--lumiverse-fill);border:1px solid var(--lumiverse-border);border-radius:9px;padding:9px 11px;max-width:100%}
.bm-panel button{cursor:pointer;font-weight:600}
.bm-panel button.primary{background:var(--lumiverse-accent,var(--lumiverse-fill));border-color:var(--lumiverse-accent,var(--lumiverse-border))}
.bm-panel button:disabled{opacity:.5;cursor:not-allowed}
.bm-status{padding:10px;border-radius:9px;background:var(--lumiverse-fill-subtle);font-size:12px;line-height:1.5;white-space:pre-wrap}
.bm-label{font-size:12px;font-weight:700;color:var(--lumiverse-text-muted)}
.bm-panel select{width:100%}
`;
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className)
        node.className = className;
    if (text !== undefined)
        node.textContent = text;
    return node;
}
export function setup(ctx) {
    const removeStyle = ctx.dom.addStyle(STYLE);
    const tab = ctx.ui.registerDrawerTab({
        id: 'bunnymo',
        title: 'BunnyMo Character Sheets',
        shortName: 'BunnyMo',
        description: 'Generate private BunnyMo character sheets and manage per-chat archives.',
        keywords: ['bunnymo', 'character sheet', 'fullsheet', 'tagsheet', 'archive', 'carrotkernel'],
        headerTitle: 'BunnyMo',
    });
    let isGenerating = false;
    let latestState = null;
    let statusText = 'Checking Lumiverse and BunnyMo…';
    let statusKind = 'info';
    function render() {
        const root = tab.root;
        root.replaceChildren();
        const panel = el('div', 'bm-panel');
        const heading = el('div');
        heading.appendChild(el('div', '', 'BunnyMo for Lumiverse'));
        heading.appendChild(el('div', 'bm-muted', 'Private analysis. Nothing is added to your roleplay chat.'));
        panel.appendChild(heading);
        if (latestState?.missingPermissions?.length) {
            const card = el('div', 'bm-card');
            card.appendChild(el('strong', '', 'Permissions required'));
            card.appendChild(el('div', 'bm-muted', `Grant these permissions in Lumiverse → Extensions → BunnyMo for Lumiverse: ${latestState.missingPermissions.join(', ')}`));
            panel.appendChild(card);
        }
        else {
            const chatCard = el('div', 'bm-card');
            chatCard.appendChild(el('strong', '', 'Current chat'));
            if (latestState?.chat) {
                chatCard.appendChild(el('div', '', latestState.chat.name || 'Untitled chat'));
                chatCard.appendChild(el('div', 'bm-muted', `Character: ${latestState.chat.characterName || 'Unknown'} · Per-chat archive`));
                if (latestState.archiveBook) {
                    chatCard.appendChild(el('div', 'bm-muted', `Archive: ${latestState.archiveBook.name}`));
                }
                else {
                    chatCard.appendChild(el('div', 'bm-muted', 'No archive exists yet. It will be created automatically on the first successful generation.'));
                }
            }
            else {
                chatCard.appendChild(el('div', 'bm-muted', 'Open a character chat to use BunnyMo.'));
            }
            panel.appendChild(chatCard);
            const sourceCard = el('div', 'bm-card');
            sourceCard.appendChild(el('strong', '', 'BunnyMo core lorebook'));
            sourceCard.appendChild(el('div', 'bm-muted', 'Choose the core/main BunnyMo book. Optional packs remain available through your normal Lumiverse prompt context.'));
            const select = el('select');
            const emptyOption = el('option', '', 'Select BunnyMo core lorebook');
            emptyOption.value = '';
            select.appendChild(emptyOption);
            for (const book of latestState?.books ?? []) {
                const option = el('option', '', book.name || 'Unnamed lorebook');
                option.value = book.id;
                select.appendChild(option);
            }
            select.value = latestState?.selectedSourceBookId || '';
            select.addEventListener('change', () => {
                ctx.sendToBackend({ type: 'bunnymo_save_settings', sourceBookId: select.value });
                statusText = 'Saving BunnyMo source book…';
                render();
            });
            sourceCard.appendChild(select);
            panel.appendChild(sourceCard);
            const generateCard = el('div', 'bm-card');
            generateCard.appendChild(el('strong', '', 'Generate character sheet'));
            generateCard.appendChild(el('div', 'bm-muted', 'The first prototype runs BunnyMo’s documented !fullsheet command. Tagsheet and Quicksheet variants will be added after the core pipeline is verified.'));
            const generateButton = el('button', 'primary', isGenerating ? 'Generating…' : 'Generate Fullsheet');
            generateButton.disabled = isGenerating || !latestState?.chat || !latestState?.selectedSourceBookId;
            generateButton.addEventListener('click', () => {
                if (isGenerating)
                    return;
                isGenerating = true;
                statusText = 'Starting private generation…';
                statusKind = 'info';
                render();
                ctx.sendToBackend({ type: 'bunnymo_generate_fullsheet' });
            });
            generateCard.appendChild(generateButton);
            panel.appendChild(generateCard);
        }
        const status = el('div', 'bm-status', statusText);
        status.setAttribute('data-kind', statusKind);
        panel.appendChild(status);
        const footer = el('div', 'bm-muted', 'Archive identity is the Lumiverse chat ID. Separate chats using the same character card receive separate lorebooks and never share sheets.');
        panel.appendChild(footer);
        root.appendChild(panel);
    }
    const unsubBackend = ctx.onBackendMessage((payload) => {
        if (!payload || typeof payload.type !== 'string')
            return;
        if (payload.type === 'bunnymo_state' || payload.type === 'bunnymo_settings_saved') {
            latestState = payload.state;
            if (payload.type === 'bunnymo_settings_saved')
                statusText = 'Settings saved.';
            render();
        }
        else if (payload.type === 'bunnymo_status') {
            statusText = payload.message || 'Working…';
            statusKind = payload.status || 'info';
            render();
        }
        else if (payload.type === 'bunnymo_done') {
            isGenerating = false;
            statusText = `✓ ${payload.message}\nRead ${payload.messageCount} chat messages · Saved ${payload.outputLength.toLocaleString()} characters.`;
            statusKind = 'success';
            ctx.sendToBackend({ type: 'bunnymo_get_state' });
            render();
        }
        else if (payload.type === 'bunnymo_error') {
            isGenerating = false;
            statusText = `Generation failed: ${payload.message}`;
            statusKind = 'error';
            render();
        }
    });
    const inputAction = ctx.ui.registerInputBarAction({
        id: 'generate-fullsheet',
        label: 'BunnyMo: Generate Fullsheet',
        enabled: true,
    });
    const unsubAction = inputAction.onClick(() => {
        if (isGenerating)
            return;
        isGenerating = true;
        statusText = 'Starting private generation…';
        statusKind = 'info';
        render();
        tab.activate();
        ctx.sendToBackend({ type: 'bunnymo_generate_fullsheet' });
    });
    const unsubActivate = tab.onActivate(() => ctx.sendToBackend({ type: 'bunnymo_get_state' }));
    render();
    ctx.sendToBackend({ type: 'bunnymo_get_state' });
    return () => {
        unsubBackend();
        unsubAction();
        unsubActivate();
        inputAction.destroy();
        tab.destroy();
        removeStyle();
    };
}
