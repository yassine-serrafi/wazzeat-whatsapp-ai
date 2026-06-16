/**
 * Wazzeat Chat Console
 */

const socket = io();

// ─── MODULE-LEVEL CONSTANTS ───────────────────────────────────────────────────
const STATUS_LABELS = {
    open: 'En cours',
    closed: 'Résolu',
    urgent: '🔔 À traiter',
    order: '🛵 Commande',
    reservation: '📅 Réservation'
};

// ─── STATE ────────────────────────────────────────────────────────────────────
let activeJid = null;
let chatHistory = {};
let crmData = {};
let unreadCounts = {};
let typingTimers = {};
let ctxTargetText = '';
let searchQuery = '';
let currentFilter = 'all';
let _audioCtx = null;

// ─── DOM REFS ─────────────────────────────────────────────────────────────────
const dom = {
    overlay:          document.getElementById('login-overlay'),
    qr:               document.getElementById('qr-image'),
    contacts:         document.getElementById('contact-list'),
    filters:          document.querySelectorAll('.filter-chip'),
    searchInput:      document.getElementById('search-input'),
    sidebarStatus:    document.getElementById('sidebar-status'),
    ctxMenu:          document.getElementById('ctx-menu'),
    ctxCopy:          document.getElementById('ctx-copy'),
    ctxReply:         document.getElementById('ctx-reply'),
    scrollBtn:        document.getElementById('scroll-bottom-btn'),
    scrollBadge:      document.getElementById('scroll-badge'),
    emptyPlaceholder: document.getElementById('empty-chat-placeholder'),
    chat: {
        area:        document.getElementById('messages-area'),
        input:       document.getElementById('chat-input'),
        send:        document.getElementById('send-btn'),
        aiToggle:    document.getElementById('ai-toggle'),
        resolveBtn:  document.getElementById('btn-resolve'),
        deleteBtn:   document.getElementById('btn-delete'),
        stopIaBtn:   document.getElementById('btn-stop-ia'),
        relaunchBtn: document.getElementById('btn-relaunch-ia'),
        infoPanelBtn:document.getElementById('btn-info-panel'),
        header: {
            info:   document.getElementById('active-chat-info'),
            name:   document.getElementById('header-name'),
            avatar: document.getElementById('header-avatar'),
            status: document.getElementById('header-status-text'),
            typing: document.getElementById('typing-indicator'),
        }
    },
    panel: {
        aside:    document.getElementById('contact-panel'),
        close:    document.getElementById('cp-close'),
        avatar:   document.getElementById('cp-avatar'),
        name:     document.getElementById('cp-name'),
        phone:    document.getElementById('cp-phone'),
        status:   document.getElementById('cp-status'),
        priority: document.getElementById('cp-priority'),
        ai:       document.getElementById('cp-ai'),
        test:     document.getElementById('cp-test'),
        notes:    document.getElementById('cp-notes'),
        msgcount: document.getElementById('cp-msgcount'),
        firstmsg: document.getElementById('cp-firstmsg'),
    }
};

// Derive panel open state from DOM — no separate boolean to keep in sync
const isPanelOpen = () => !dom.panel.aside.classList.contains('hidden');

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    console.log('📟 Chat Console V4.0 Initializing...');
    setupEvents();
});

// ─── EVENTS ───────────────────────────────────────────────────────────────────
function setupEvents() {
    dom.chat.send.addEventListener('click', sendMessage);
    dom.chat.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    dom.chat.input.addEventListener('input', () => {
        dom.chat.input.style.height = 'auto';
        dom.chat.input.style.height = Math.min(dom.chat.input.scrollHeight, 120) + 'px';
        dom.chat.send.classList.toggle('has-text', dom.chat.input.value.trim().length > 0);
    });

    dom.searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderContacts();
    });

    dom.filters.forEach(btn => {
        btn.addEventListener('click', () => {
            dom.filters.forEach(f => f.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderContacts();
        });
    });

    dom.chat.area.addEventListener('scroll', handleScrollPosition);
    dom.scrollBtn.addEventListener('click', () => scrollToBottom(true));

    dom.chat.infoPanelBtn.addEventListener('click', toggleContactPanel);
    dom.chat.header.info.addEventListener('click', toggleContactPanel);
    dom.panel.close.addEventListener('click', closeContactPanel);

    dom.chat.aiToggle.addEventListener('change', () => {
        if (!activeJid) return;
        socket.emit('toggle_ai', { jid: activeJid, active: dom.chat.aiToggle.checked });
        if (crmData[activeJid]) crmData[activeJid].aiEnabled = dom.chat.aiToggle.checked;
        updateStopIaButton();
    });

    dom.chat.stopIaBtn.addEventListener('click', () => {
        if (!activeJid) return;
        const newState = crmData[activeJid]?.aiEnabled === false;
        socket.emit('toggle_ai', { jid: activeJid, active: newState });
        if (crmData[activeJid]) crmData[activeJid].aiEnabled = newState;
        dom.chat.aiToggle.checked = newState;
        updateStopIaButton();
    });

    if (dom.chat.relaunchBtn) {
        dom.chat.relaunchBtn.addEventListener('click', () => {
            if (!activeJid) return alert("Sélectionnez d'abord une conversation !");
            if (!confirm("Forcer l'assistant à analyser les derniers messages et répondre ?")) return;
            withBtnFeedback(dom.chat.relaunchBtn, () => {
                socket.emit('relaunch_ai', activeJid);
                appendSystemMessage('♻️ Relance IA en cours...');
                scrollToBottom(true);
            });
        });
    }

    if (dom.chat.resolveBtn) {
        dom.chat.resolveBtn.addEventListener('click', () => {
            if (!activeJid) return;
            if (crmData[activeJid]) crmData[activeJid].status = 'closed';
            fetch('/api/crm/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jid: activeJid, updates: { status: 'closed', priority: 'low' } })
            }).then(r => r.ok ? r.json() : Promise.reject())
              .then(() => {
                appendSystemMessage('✅ Ticket marqué comme résolu');
                scrollToBottom(true);
                renderContacts();
              })
              .catch(() => alert("❌ Impossible de résoudre. Vérifiez la connexion."));
        });
    }

    dom.chat.deleteBtn.addEventListener('click', () => {
        if (!activeJid) return;
        if (!confirm("Supprimer définitivement cette conversation ?")) return;
        socket.emit('delete_conversation', activeJid);
        delete chatHistory[activeJid];
        delete unreadCounts[activeJid];
        activeJid = null;
        renderContacts();
        resetChatArea();
        closeContactPanel();
        updateTabTitle();
    });

    document.getElementById('file-attach').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !activeJid) return;
        alert(`📎 Pièce jointe : "${file.name}" — fonctionnalité d'envoi disponible prochainement.`);
        e.target.value = '';
    });

    document.addEventListener('click', hideCtxMenu);

    dom.ctxCopy.addEventListener('click', () => {
        if (ctxTargetText) {
            navigator.clipboard.writeText(ctxTargetText).then(() => {
                dom.ctxCopy.innerHTML = '<i class="fas fa-check"></i> Copié !';
                setTimeout(() => { dom.ctxCopy.innerHTML = '<i class="fas fa-copy"></i> Copier'; }, 1500);
            });
        }
        hideCtxMenu();
    });

    dom.ctxReply.addEventListener('click', () => {
        if (ctxTargetText && dom.chat.input) {
            dom.chat.input.value = '';
            dom.chat.input.placeholder = `↩ Répondre : "${ctxTargetText.substring(0, 30)}..."`;
            dom.chat.input.focus();
        }
        hideCtxMenu();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { hideCtxMenu(); closeContactPanel(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); dom.searchInput.focus(); }
    });
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function withBtnFeedback(btn, workFn) {
    const orig = btn.innerHTML;
    const reset = () => { btn.innerHTML = orig; btn.style.background = ''; btn.disabled = false; };
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> En cours...`;
    const result = workFn(btn, reset);
    // If workFn is sync (no returned promise), auto-reset after 3s
    if (!result || typeof result.then !== 'function') setTimeout(reset, 3000);
}

function applyAvatarStyle(el, name) {
    el.textContent = name.substring(0, 2).toUpperCase();
    el.style.background = getAvatarColor(name);
}

// ─── SOCKET HANDLERS ──────────────────────────────────────────────────────────

socket.on('qr_code', (url) => {
    if (url) { dom.overlay.classList.remove('hidden'); dom.qr.src = url; }
    else { dom.overlay.classList.add('hidden'); }
});

socket.on('status', (status) => {
    const labels = { CONNECTED: ['● En ligne', '#00a884'], DISCONNECTED: ['● Hors ligne', '#ef4444'], SCAN_REQUIRED: ['● Scan requis', '#f59e0b'] };
    const [text, color] = labels[status] || [];
    if (text && dom.sidebarStatus) { dom.sidebarStatus.textContent = text; dom.sidebarStatus.style.color = color; }
    if (status === 'CONNECTED') dom.overlay.classList.add('hidden');
});

socket.on('config_update', (cfg) => {
    const el = document.getElementById('typing-agent');
    if (el && cfg && cfg.agentName) el.textContent = cfg.agentName;
});

socket.on('init_history', (history) => {
    chatHistory = history;
    renderContacts();
});

socket.on('init_crm', (crm) => {
    crmData = crm;
    if (activeJid) { updateHeader(activeJid); if (isPanelOpen()) updateContactPanel(activeJid); }
    renderContacts();
});

// Mise à jour live d'un ticket (statut réservation/commande, priorité, notes...)
socket.on('crm_update', (update) => {
    if (!update || !update.jid) return;
    crmData[update.jid] = update.data;
    if (update.jid === activeJid) { updateHeader(activeJid); if (isPanelOpen()) updateContactPanel(activeJid); }
    renderContacts();
});

socket.on('new_message', (msg) => {
    if (!chatHistory[msg.jid]) chatHistory[msg.jid] = [];
    chatHistory[msg.jid].push(msg);

    if (msg.jid !== activeJid && msg.from === 'client') {
        unreadCounts[msg.jid] = (unreadCounts[msg.jid] || 0) + 1;
        playNotificationSound();
        updateTabTitle();
    }

    renderContacts();

    if (activeJid === msg.jid) {
        const hist = chatHistory[msg.jid];
        const prev = hist[hist.length - 2];
        if (needsDateDivider(prev, msg)) appendDateDivider(msg.timestamp);
        appendMessage(msg, !prev || prev.from !== msg.from, true);
        scrollToBottomIfNear();

        if (msg.from === 'client' && crmData[msg.jid]?.aiEnabled !== false) {
            showTypingIndicator(msg.jid);
        } else {
            hideTypingIndicator(msg.jid);
        }
    }
});

socket.on('ai_status', (data) => {
    if (crmData[data.jid]) crmData[data.jid].aiEnabled = data.active;
    if (activeJid === data.jid) {
        dom.chat.aiToggle.checked = data.active;
        updateStopIaButton();
    }
    if (isPanelOpen() && activeJid === data.jid) updateContactPanel(data.jid);
});

socket.on('conversation_deleted', (jid) => {
    delete chatHistory[jid];
    delete unreadCounts[jid];
    clearTimeout(typingTimers[jid]);
    delete typingTimers[jid];
    renderContacts();
    if (activeJid === jid) {
        activeJid = null;
        resetChatArea();
        closeContactPanel();
    }
    updateTabTitle();
});

// ─── RENDER CONTACTS ──────────────────────────────────────────────────────────

function renderContacts() {
    try {
        if (!chatHistory || typeof chatHistory !== 'object') {
            dom.contacts.innerHTML = '<div style="padding:20px; text-align:center; color:#888">Aucune conversation</div>';
            return;
        }

        let threads = Object.keys(chatHistory).map(jid => {
            const msgs = Array.isArray(chatHistory[jid]) ? chatHistory[jid] : [];
            const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
            return { jid, lastMsg: last, timestamp: last ? (last.timestamp || 0) : 0 };
        }).sort((a, b) => b.timestamp - a.timestamp);

        if (searchQuery) {
            threads = threads.filter(t =>
                t.jid.toLowerCase().includes(searchQuery) ||
                (t.lastMsg?.text || '').toLowerCase().includes(searchQuery)
            );
        }

        threads = threads.filter(t => {
            if (currentFilter === 'unread') return (unreadCounts[t.jid] || 0) > 0;
            if (currentFilter === 'high') return crmData[t.jid]?.priority === 'high';
            return true;
        });

        const frag = document.createDocumentFragment();

        if (threads.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:20px; text-align:center; color:#888; font-size:0.9rem;';
            empty.textContent = 'Aucun résultat';
            frag.appendChild(empty);
        } else {
            threads.forEach(t => {
                const div = document.createElement('div');
                const isActive = t.jid === activeJid;
                const unread = unreadCounts[t.jid] || 0;
                const isUrgent = crmData[t.jid]?.priority === 'high';

                div.className = `contact-item${isActive ? ' active' : ''}${(!isActive && unread > 0) ? ' unread' : ''}`;
                div.onclick = () => openChat(t.jid);

                const name = t.jid.split('@')[0];
                const initials = name.substring(0, 2).toUpperCase();
                const color = getAvatarColor(name);

                let previewHTML = '';
                if (t.lastMsg) {
                    if (t.lastMsg.from === 'me' || t.lastMsg.from === 'bot')
                        previewHTML += `<span class="msg-tick read"><i class="fas fa-check-double"></i></span>`;
                    if (t.lastMsg.from === 'system')
                        previewHTML += `<span style="font-style:italic;color:#8696a0;">Message système</span>`;
                    else if (t.lastMsg.hasImage)
                        previewHTML += `<span><i class="fas fa-camera" style="margin-right:3px;"></i> Photo</span>`;
                    else if ((t.lastMsg.text || '').includes('[VOCAL'))
                        previewHTML += `<span><i class="fas fa-microphone" style="margin-right:3px;"></i> Vocal</span>`;
                    else {
                        const safe = (t.lastMsg.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        previewHTML += `<span>${safe}</span>`;
                    }
                }

                div.innerHTML = `
                    <div class="contact-avatar" style="background:${color}">${initials}</div>
                    <div class="contact-info">
                        <div class="contact-header">
                            <div class="contact-name">${name}${isUrgent ? '<span style="color:#ef4444;font-size:0.7rem;margin-left:4px;">🔴</span>' : ''}</div>
                            <div class="contact-time">${t.lastMsg ? formatSmartTime(t.lastMsg.timestamp) : ''}</div>
                        </div>
                        <div class="contact-footer">
                            <div class="contact-preview">${previewHTML}</div>
                            ${(!isActive && unread > 0) ? `<div class="unread-badge">${unread > 99 ? '99+' : unread}</div>` : ''}
                        </div>
                    </div>`;
                frag.appendChild(div);
            });
        }

        dom.contacts.innerHTML = '';
        dom.contacts.appendChild(frag);
    } catch (e) {
        console.error('🔥 Erreur renderContacts:', e);
        dom.contacts.innerHTML = `<div style="color:red;padding:10px;">Erreur : ${e.message}</div>`;
    }
}

// ─── OPEN CHAT ────────────────────────────────────────────────────────────────

function openChat(jid) {
    activeJid = jid;
    unreadCounts[jid] = 0;
    updateTabTitle();
    renderContacts();
    updateHeader(jid);
    if (isPanelOpen()) updateContactPanel(jid);

    const frag = document.createDocumentFragment();
    const msgs = chatHistory[jid] || [];
    let lastSender = null;
    let lastDateKey = null;

    msgs.forEach((msg, index) => {
        const dateKey = msg.timestamp ? new Date(msg.timestamp).toDateString() : null;
        if (dateKey && dateKey !== lastDateKey) {
            const divEl = document.createElement('div');
            divEl.className = 'date-divider';
            divEl.textContent = formatDateDivider(msg.timestamp);
            frag.appendChild(divEl);
            lastDateKey = dateKey;
        }

        if (msg.from === 'system') {
            const sysEl = document.createElement('div');
            sysEl.className = 'system-msg';
            sysEl.textContent = msg.text;
            frag.appendChild(sysEl);
            lastSender = msg.from;
            return;
        }

        const nextMsg = msgs[index + 1];
        const isFirst = lastSender !== msg.from;
        const isLast = !nextMsg || nextMsg.from !== msg.from || nextMsg.from === 'system';
        frag.appendChild(buildMessageEl(msg, isFirst, isLast));
        lastSender = msg.from;
    });

    dom.chat.area.innerHTML = '';
    if (dom.emptyPlaceholder) dom.emptyPlaceholder.style.display = 'none';
    dom.chat.area.appendChild(frag);

    hideTypingIndicator(jid);
    scrollToBottom(false);
}

// ─── MESSAGE RENDERING ────────────────────────────────────────────────────────

function buildMessageEl(msg, isFirst, isLast) {
    const div = document.createElement('div');
    const fromType = (msg.from === 'me' || msg.from === 'bot') ? 'out' : 'in';
    div.className = `msg ${fromType}${isFirst ? ' first' : ''}${isLast ? ' last' : ''}`;

    let contentHtml = msg.hasImage
        ? `<div class="msg-image-placeholder"><i class="fas fa-image"></i> Photo</div>`
        : `<span>${(msg.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</span>`;

    const time = msg.time ? msg.time.split(':').slice(0, 2).join(':') : '';
    const ticks = fromType === 'out' ? ` <span class="msg-tick read"><i class="fas fa-check-double"></i></span>` : '';
    div.innerHTML = contentHtml + `<span class="msg-meta">${time}${ticks}</span>`;

    if (msg.timestamp) div.title = new Date(msg.timestamp).toLocaleString('fr-FR');
    div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        ctxTargetText = msg.text || '';
        showCtxMenu(e.clientX, e.clientY);
    });
    return div;
}

function appendMessage(msg, isFirst, isLast) {
    dom.chat.area.appendChild(buildMessageEl(msg, isFirst, isLast));
}

function appendDateDivider(timestamp) {
    const div = document.createElement('div');
    div.className = 'date-divider';
    div.textContent = formatDateDivider(timestamp);
    dom.chat.area.appendChild(div);
}

function appendSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-msg';
    div.textContent = text;
    dom.chat.area.appendChild(div);
}

function needsDateDivider(prev, next) {
    if (!prev?.timestamp || !next?.timestamp) return false;
    return new Date(prev.timestamp).toDateString() !== new Date(next.timestamp).toDateString();
}

// ─── HEADER ───────────────────────────────────────────────────────────────────

function updateHeader(jid) {
    dom.chat.header.info.style.visibility = 'visible';
    const name = jid.split('@')[0];
    dom.chat.header.name.innerText = name;
    applyAvatarStyle(dom.chat.header.avatar, name);

    dom.chat.aiToggle.checked = crmData[jid]?.aiEnabled !== false;
    updateStopIaButton();
    dom.chat.header.status.textContent = STATUS_LABELS[crmData[jid]?.status] || 'En cours';
}

function updateStopIaButton() {
    if (!activeJid) return;
    const aiOn = crmData[activeJid]?.aiEnabled !== false;
    dom.chat.stopIaBtn.classList.toggle('active', !aiOn);
    dom.chat.stopIaBtn.innerHTML = aiOn
        ? '<i class="fas fa-hand-paper"></i> STOP IA'
        : '<i class="fas fa-play"></i> RELANCER';
}

// ─── TYPING INDICATOR ─────────────────────────────────────────────────────────

function showTypingIndicator(jid) {
    if (jid !== activeJid) return;
    dom.chat.header.typing.classList.remove('hidden');
    dom.chat.header.status.classList.add('hidden');
    clearTimeout(typingTimers[jid]);
    typingTimers[jid] = setTimeout(() => hideTypingIndicator(jid), 15000);
}

function hideTypingIndicator(jid) {
    if (jid !== activeJid) return;
    dom.chat.header.typing.classList.add('hidden');
    dom.chat.header.status.classList.remove('hidden');
    clearTimeout(typingTimers[jid]);
}

// ─── SCROLL ───────────────────────────────────────────────────────────────────

function scrollToBottom(smooth = false) {
    dom.chat.area.scrollTo({ top: dom.chat.area.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

function scrollToBottomIfNear() {
    const area = dom.chat.area;
    const distFromBottom = area.scrollHeight - area.scrollTop - area.clientHeight;
    if (distFromBottom < 200) scrollToBottom(true);
    else dom.scrollBtn.classList.remove('hidden');
}

function handleScrollPosition() {
    const area = dom.chat.area;
    const distFromBottom = area.scrollHeight - area.scrollTop - area.clientHeight;
    const isFarFromBottom = distFromBottom > 300;
    dom.scrollBtn.classList.toggle('hidden', !isFarFromBottom);
    if (!isFarFromBottom) { dom.scrollBadge.classList.add('hidden'); dom.scrollBadge.textContent = '0'; }
}

// ─── CONTACT PANEL ────────────────────────────────────────────────────────────

function toggleContactPanel() {
    if (!activeJid) return;
    if (isPanelOpen()) {
        closeContactPanel();
    } else {
        dom.panel.aside.classList.remove('hidden');
        updateContactPanel(activeJid);
    }
}

function closeContactPanel() {
    dom.panel.aside.classList.add('hidden');
}

function updateContactPanel(jid) {
    if (!jid) return;
    const crm = crmData[jid] || {};
    const hist = chatHistory[jid] || [];
    const name = jid.split('@')[0];

    applyAvatarStyle(dom.panel.avatar, name);
    dom.panel.name.textContent = name;
    dom.panel.phone.textContent = '+' + name.replace(/\D/g, '');
    dom.panel.status.textContent = STATUS_LABELS[crm.status] || crm.status || '—';
    dom.panel.priority.textContent = crm.priority === 'high' ? '🔴 Haute' : crm.priority === 'low' ? '🟢 Basse' : '🟡 Normale';
    dom.panel.ai.textContent = crm.aiEnabled !== false ? '✅ Activée' : '❌ Désactivée';
    const statusMap = { reservation: '📅 Réservation', order: '🛵 Commande', urgent: '🔔 À traiter', open: '🟢 Ouvert', closed: '✅ Résolu' };
    dom.panel.test.textContent = statusMap[crm.status] || (crm.status || '—');
    dom.panel.notes.textContent = crm.notes || 'Aucune note';
    dom.panel.msgcount.textContent = hist.length + ' messages';
    const firstMsg = hist.find(m => m.timestamp);
    dom.panel.firstmsg.textContent = firstMsg
        ? new Date(firstMsg.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';
}

// ─── SEND / RESET ─────────────────────────────────────────────────────────────

function sendMessage() {
    const text = dom.chat.input.value.trim();
    if (!text || !activeJid) return;
    socket.emit('manual_reply', { jid: activeJid, text });
    dom.chat.input.value = '';
    dom.chat.input.style.height = 'auto';
    dom.chat.input.placeholder = 'Tapez un message';
    dom.chat.send.classList.remove('has-text');
}

function resetChatArea() {
    dom.chat.area.innerHTML = '';
    dom.chat.header.info.style.visibility = 'hidden';
    if (dom.emptyPlaceholder) {
        dom.emptyPlaceholder.style.display = '';
        dom.chat.area.appendChild(dom.emptyPlaceholder);
    }
    dom.scrollBtn.classList.add('hidden');
}

// ─── CONTEXT MENU ─────────────────────────────────────────────────────────────

function showCtxMenu(x, y) {
    dom.ctxMenu.classList.remove('hidden');
    const mx = x + 150 > window.innerWidth ? window.innerWidth - 160 : x;
    const my = y + 80 > window.innerHeight ? window.innerHeight - 90 : y;
    dom.ctxMenu.style.left = mx + 'px';
    dom.ctxMenu.style.top = my + 'px';
}

function hideCtxMenu() { dom.ctxMenu.classList.add('hidden'); }

// ─── NOTIFICATION SOUND ───────────────────────────────────────────────────────

function playNotificationSound() {
    try {
        const AudioCtx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
        if (!AudioCtx) return;
        if (!_audioCtx || _audioCtx.state === 'closed') _audioCtx = new AudioCtx();
        const gain = _audioCtx.createGain();
        gain.connect(_audioCtx.destination);
        gain.gain.setValueAtTime(0.08, _audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.3);
        const osc = _audioCtx.createOscillator();
        osc.connect(gain);
        osc.frequency.setValueAtTime(880, _audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(660, _audioCtx.currentTime + 0.1);
        osc.type = 'sine';
        osc.start(_audioCtx.currentTime);
        osc.stop(_audioCtx.currentTime + 0.3);
    } catch (e) { /* silently ignore if browser blocks */ }
}

// ─── FORMAT HELPERS ───────────────────────────────────────────────────────────

function updateTabTitle() {
    const total = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
    document.title = total > 0 ? `(${total}) Wazzeat Console` : 'Wazzeat Console';
}

function formatSmartTime(ts) {
    if (!ts) return '';
    const date = new Date(ts);
    const now = new Date();
    const diff = now - date;
    const oneDay = 86400000;
    if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diff < oneDay * 2 && date.getDate() !== now.getDate()) return 'Hier';
    if (diff < oneDay * 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatDateDivider(ts) {
    if (!ts) return '';
    const date = new Date(ts);
    const now = new Date();
    const diff = now - date;
    const oneDay = 86400000;
    if (date.toDateString() === now.toDateString()) return "Aujourd'hui";
    if (diff < oneDay * 2) return 'Hier';
    if (diff < oneDay * 7) return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getAvatarColor(name) {
    const colors = ['#00a884', '#009688', '#3f51b5', '#673ab7', '#e91e63', '#9c27b0', '#ff5722', '#795548'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}
