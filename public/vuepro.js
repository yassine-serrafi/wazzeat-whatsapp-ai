/* ============================================================
   Wazzeat — VuePro dashboard logic
   ============================================================ */
const socket = io();
let CONFIG = {};
let MENU = [];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cur = () => (CONFIG.currency || '€');

function toast(msg, type = 'ok') {
    const t = $('toast');
    t.textContent = msg;
    t.className = `toast show ${type}`;
    setTimeout(() => t.className = 'toast', 2400);
}

/* ---------- Navigation ---------- */
const PAGE_META = {
    overview: ['Vue générale', 'Bienvenue sur votre tableau de bord Wazzeat'],
    reservations: ['Réservations', 'Les réservations de table sur place'],
    orders: ['Commandes', 'Les commandes en livraison (paiement à la livraison)'],
    menu: ['Menu / Carte', 'Gérez votre carte par photo (OCR) ou manuellement'],
    config: ['Configuration', 'Identité du restaurant, agent et livraison'],
    brain: ['Cerveau IA', 'La personnalité de votre assistant'],
    controls: ['Centre de contrôle', 'Modes de service et simulateur'],
    advanced: ['Réglages avancés', 'Comportement de l\'IA, timings et horaires'],
    integrations: ['Telegram & Coûts', 'Notifications et suivi des coûts IA']
};
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const page = item.dataset.page;
        document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n === item));
        document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
        $('page-title').textContent = PAGE_META[page][0];
        $('page-sub').textContent = PAGE_META[page][1];
    });
});

/* ---------- Stats / Overview ---------- */
async function loadStats() {
    try {
        const s = await fetch('/api/stats').then(r => r.json());
        $('s-today-orders').textContent = s.todaySales || 0;
        $('s-today-rev').textContent = `${(s.todayRevenue || 0).toFixed(2)} ${cur()} estimés`;
        $('s-convos').textContent = s.activeConversations || 0;
        $('s-tickets').textContent = `${s.openTickets || 0} à traiter`;
        $('s-msgs').textContent = s.todayMessages || 0;
        $('s-uptime').textContent = 'uptime ' + fmtUptime(s.uptimeSeconds || 0);

        // chart
        const bars = s.last7days || [];
        const max = Math.max(1, ...bars.map(b => b.revenue || 0));
        $('chart').innerHTML = bars.map(b => `
            <div class="bar-col">
                <div class="bar-val">${b.revenue ? Math.round(b.revenue) : ''}</div>
                <div class="bar" style="height:${Math.round((b.revenue || 0) / max * 120)}px"></div>
                <div class="bar-lbl">${esc(b.date)}</div>
            </div>`).join('');
        $('chart-total').textContent = `${bars.reduce((a, b) => a + (b.revenue || 0), 0).toFixed(0)} ${cur()}`;

        // cost
        if (s.apiUsage) renderCost(s.apiUsage);
    } catch (e) { /* ignore */ }
}
function fmtUptime(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
}
function renderCost(u) {
    const cost = (u.tokens_4o_in * 2.5 + u.tokens_4o_out * 10 + u.tokens_4omini_in * 0.15 + u.tokens_4omini_out * 0.6) / 1e6;
    const tot = (u.tokens_4o_in + u.tokens_4o_out + u.tokens_4omini_in + u.tokens_4omini_out);
    $('cost-total').textContent = `${(cost * 0.92).toFixed(2)} €`;
    $('cost-tokens').textContent = `${tot.toLocaleString('fr-FR')} tokens utilisés`;
}

/* ---------- Status strip ---------- */
function renderStatusStrip(st) {
    const items = [
        ['WhatsApp', st.connectionStatus === 'CONNECTED', st.connectionStatus === 'CONNECTED' ? 'connecté' : 'hors ligne'],
        ['Service', !st.panicMode, st.panicMode ? 'interrompu' : 'ouvert'],
        ['Commandes', !st.pauseOrders, st.pauseOrders ? 'en pause' : 'ouvertes'],
        ['Affluence', !st.slowMode, st.slowMode ? 'forte' : 'normale'],
        ['Restaurant', !st.isSleeping, st.isSleeping ? 'fermé' : 'ouvert'],
        ['IA', !st.aiStopped, st.aiStopped ? 'coupée' : 'active'],
    ];
    $('status-strip').innerHTML = items.map(([n, ok, txt]) =>
        `<span class="pill ${ok ? 'ok' : 'bad'}"><span class="pdot"></span>${n} · ${txt}</span>`).join('');

    // sync control toggles
    document.querySelectorAll('[data-setting]').forEach(cb => {
        const map = { panicMode: st.panicMode, pauseOrders: st.pauseOrders, slowMode: st.slowMode, isSleeping: st.isSleeping, aiStopped: st.aiStopped };
        if (cb.dataset.setting in map) cb.checked = !!map[cb.dataset.setting];
    });

    // sidebar foot
    const on = st.connectionStatus === 'CONNECTED';
    $('wa-dot').className = 'dot ' + (on ? 'on' : 'off');
    $('wa-status').textContent = on ? 'WhatsApp connecté' : (st.connectionStatus || 'Hors ligne');
    // carte connexion (Centre de contrôle)
    setConn(st.connectionStatus);
}

/* ---------- Reservations ---------- */
const STAT_LABEL = { pending: 'En attente', confirmed: 'Confirmée', done: 'Terminée', cancelled: 'Annulée' };
function renderReservations(data) {
    const list = data.list || [];
    $('nav-resa').textContent = (data.stats?.pending) || 0;
    $('resa-stats').textContent = `${data.stats?.pending || 0} en attente · ${list.length} au total`;
    $('resa-empty').style.display = list.length ? 'none' : 'block';
    $('resa-body').innerHTML = list.map(r => `
        <tr>
            <td class="mono">${esc(r.sender)}</td>
            <td><b>${esc(r.name)}</b></td>
            <td>${esc(r.date || '—')}</td>
            <td>${esc(r.time || '—')}</td>
            <td>${r.guests || '—'}</td>
            <td><span class="badge ${r.status}">${STAT_LABEL[r.status] || r.status}</span></td>
            <td style="text-align:right; white-space:nowrap;">
                ${r.status !== 'confirmed' ? `<button class="btn sm" onclick="resaStatus('${r.id}','confirmed')">✓ Confirmer</button>` : ''}
                ${r.status !== 'done' ? `<button class="btn sm" onclick="resaStatus('${r.id}','done')">Terminer</button>` : ''}
                <button class="btn sm danger" onclick="resaDelete('${r.id}')">✕</button>
            </td>
        </tr>`).join('');
}
window.resaStatus = (id, status) => socket.emit('update_reservation_status', { id, status });
window.resaDelete = (id) => {
    if (!confirm('Supprimer définitivement cette réservation ?')) return;
    fetch(`/api/reservations/${id}`, { method: 'DELETE' })
        .then(r => r.json())
        .then(r => toast(r.success ? 'Réservation supprimée' : 'Erreur', r.success ? 'ok' : 'err'));
};

/* ---------- Orders ---------- */
async function loadOrders() {
    try {
        const list = await fetch('/api/orders').then(r => r.json());
        renderOrders(list);
    } catch (e) { }
}
function renderOrders(list) {
    list = list || [];
    const pending = list.filter(o => o.status === 'pending').length;
    $('nav-orders').textContent = pending;
    $('orders-empty').style.display = list.length ? 'none' : 'block';
    $('orders-body').innerHTML = list.map(o => `
        <tr>
            <td class="mono">${esc(o.sender)}</td>
            <td>${(o.items || []).map(it => `${it.qty || 1}× ${esc(it.name)}`).join('<br>') || '—'}</td>
            <td style="max-width:200px;">${esc(o.address || '—')}</td>
            <td class="mono">${esc(o.phone || '—')}</td>
            <td><b>${o.total != null ? o.total + ' ' + cur() : '—'}</b></td>
            <td><span class="badge ${o.status}">${STAT_LABEL[o.status] || o.status}</span></td>
            <td style="text-align:right; white-space:nowrap;">
                ${o.status !== 'done' ? `<button class="btn sm" onclick="orderStatus('${o.id}','done')">✓ Livrée</button>` : ''}
                <button class="btn sm" onclick="orderStatus('${o.id}','cancelled')">Annuler</button>
                <button class="btn sm danger" onclick="orderDelete('${o.id}')" title="Supprimer définitivement">🗑️</button>
            </td>
        </tr>`).join('');
}
window.orderStatus = (id, status) => socket.emit('update_order_status', { id, status });
window.orderDelete = (id) => {
    if (!confirm('Supprimer définitivement cette commande ?')) return;
    fetch(`/api/orders/${id}`, { method: 'DELETE' })
        .then(r => r.json())
        .then(r => toast(r.success ? 'Commande supprimée' : 'Erreur', r.success ? 'ok' : 'err'));
};

/* ---------- Menu ---------- */
async function loadMenu() {
    try { MENU = await fetch('/api/menu').then(r => r.json()); } catch (e) { MENU = []; }
    renderMenuEditor();
}
function renderMenuEditor() {
    $('menu-empty').style.display = MENU.length ? 'none' : 'block';
    const cats = {};
    MENU.forEach((it, i) => { (cats[it.category || 'Autres'] = cats[it.category || 'Autres'] || []).push({ ...it, i }); });
    $('menu-editor').innerHTML = Object.entries(cats).map(([cat, items]) => `
        <div class="menu-cat">
            <h3>${esc(cat)}</h3>
            ${items.map(it => menuRow(it.i)).join('')}
        </div>`).join('');
    // bind inputs
    MENU.forEach((it, i) => {
        ['category', 'name', 'description', 'price', 'allergens'].forEach(f => {
            const el = document.querySelector(`[data-mi="${i}"][data-mf="${f}"]`);
            if (el) el.value = it[f] ?? '';
        });
    });
}
function menuRow(i) {
    return `<div class="menu-row">
        <input data-mi="${i}" data-mf="name" placeholder="Nom du plat">
        <input data-mi="${i}" data-mf="description" placeholder="Description">
        <input data-mi="${i}" data-mf="price" type="number" step="0.5" placeholder="Prix">
        <div class="del" onclick="menuDel(${i})">🗑️</div>
        <input data-mi="${i}" data-mf="category" placeholder="Catégorie" style="grid-column:1/-1; margin-top:-4px; font-size:11.5px; color:var(--text-faint);">
        <input data-mi="${i}" data-mf="allergens" placeholder="Allergènes (ex : gluten, lactose, fruits à coque) — optionnel" style="grid-column:1/-1; margin-top:-4px; font-size:11.5px; color:var(--text-faint);">
    </div>`;
}
function syncMenuFromDOM() {
    MENU = MENU.map((it, i) => ({
        category: (document.querySelector(`[data-mi="${i}"][data-mf="category"]`)?.value || 'Autres').trim() || 'Autres',
        name: (document.querySelector(`[data-mi="${i}"][data-mf="name"]`)?.value || '').trim(),
        description: (document.querySelector(`[data-mi="${i}"][data-mf="description"]`)?.value || '').trim(),
        price: parseFloat(document.querySelector(`[data-mi="${i}"][data-mf="price"]`)?.value) || 0,
        allergens: (document.querySelector(`[data-mi="${i}"][data-mf="allergens"]`)?.value || '').trim()
    })).filter(it => it.name);
}
window.menuDel = (i) => { syncMenuFromDOM(); MENU.splice(i, 1); renderMenuEditor(); };
$('menu-add').addEventListener('click', () => { syncMenuFromDOM(); MENU.push({ category: 'Autres', name: '', description: '', price: 0, allergens: '' }); renderMenuEditor(); });
$('menu-save').addEventListener('click', async () => {
    syncMenuFromDOM();
    const r = await fetch('/api/menu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ menu: MENU }) }).then(r => r.json());
    if (r.success) toast(`Menu enregistré (${MENU.length} plats)`); else toast('Erreur', 'err');
});

// OCR upload
$('menu-dropzone').addEventListener('click', () => $('menu-file').click());
$('menu-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    $('ocr-status').textContent = '⏳ Analyse de la photo en cours…';
    const reader = new FileReader();
    reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        try {
            const r = await fetch('/api/menu/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: base64 }) }).then(r => r.json());
            if (r.items && r.items.length) {
                syncMenuFromDOM();
                MENU = MENU.concat(r.items);
                renderMenuEditor();
                $('ocr-status').textContent = `✅ ${r.items.length} plats extraits ! Vérifiez puis enregistrez.`;
            } else {
                $('ocr-status').textContent = '⚠️ Aucun plat détecté sur cette image.';
            }
        } catch (err) { $('ocr-status').textContent = '❌ Erreur lors de l\'analyse.'; }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
});

/* ---------- Config ---------- */
const CFG_FIELDS = ['restaurantName', 'agentName', 'currency', 'phone', 'address', 'hours', 'deliveryZones', 'deliveryFee', 'minOrder', 'avgPrepTime', 'paymentNote'];
function applyConfig(c) {
    CONFIG = c || {};
    CFG_FIELDS.forEach(f => { const el = $('c-' + f); if (el) el.value = CONFIG[f] ?? ''; });
    $('agent-name-pill').textContent = CONFIG.agentName || '—';
}
$('config-save').addEventListener('click', async () => {
    const body = {};
    CFG_FIELDS.forEach(f => {
        const el = $('c-' + f); if (!el) return;
        body[f] = (f === 'deliveryFee' || f === 'minOrder') ? parseFloat(el.value) || 0 : el.value;
    });
    const r = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
    if (r.success) { applyConfig(r.config); toast('Configuration enregistrée'); } else toast('Erreur', 'err');
});

/* ---------- Prompt ---------- */
async function loadPrompt() {
    try { const r = await fetch('/api/prompt').then(r => r.json()); $('prompt-editor').value = r.prompt || ''; } catch (e) { }
}
$('prompt-save').addEventListener('click', async () => {
    $('prompt-status').textContent = 'Enregistrement…';
    const r = await fetch('/api/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: $('prompt-editor').value }) }).then(r => r.json());
    $('prompt-status').textContent = r.success ? '✓ Enregistré' : 'Erreur';
    if (r.success) toast('Prompt enregistré');
    setTimeout(() => $('prompt-status').textContent = '', 2500);
});

/* ---------- Controls ---------- */
document.querySelectorAll('[data-setting]').forEach(cb => {
    cb.addEventListener('change', () => {
        socket.emit('toggle_setting', { setting: cb.dataset.setting, value: cb.checked });
        toast('Réglage mis à jour');
    });
});
$('sim-send').addEventListener('click', async () => {
    const msg = $('sim-input').value.trim(); if (!msg) return;
    $('sim-output').textContent = '⏳ …';
    try {
        const r = await fetch('/api/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg, history: [] }) }).then(r => r.json());
        $('sim-output').textContent = '🤖 ' + (r.response || r.error || '(silence)');
    } catch (e) { $('sim-output').textContent = '❌ ' + e.message; }
});

/* ---------- Connexion WhatsApp & QR ---------- */
let _currentQR = null;
function setConn(status) {
    const map = {
        CONNECTED: ['on', 'WhatsApp connecté'],
        SCAN_REQUIRED: ['wait', 'En attente du scan QR'],
        INITIALIZING: ['wait', 'Initialisation…'],
        DISCONNECTED: ['off', 'Déconnecté'],
    };
    const [cls, lbl] = map[status] || ['off', status || 'Inconnu'];
    if ($('conn-dot')) $('conn-dot').className = 'big-dot ' + cls;
    if ($('conn-label')) $('conn-label').textContent = lbl;
    if (status === 'CONNECTED') hideQR();
}
function showQR() {
    $('qr-modal').classList.add('show');
    $('qr-frame').innerHTML = _currentQR
        ? `<img src="${_currentQR}" alt="QR WhatsApp">`
        : `<div class="qr-wait"><div class="spinner"></div>Génération du QR…</div>`;
}
function hideQR() { $('qr-modal') && $('qr-modal').classList.remove('show'); }

socket.on('qr_code', (url) => {
    _currentQR = url || null;
    if (url && $('qr-frame')) $('qr-frame').innerHTML = `<img src="${url}" alt="QR WhatsApp">`;
});
$('qr-close')?.addEventListener('click', hideQR);
$('qr-modal')?.addEventListener('click', (e) => { if (e.target.id === 'qr-modal') hideQR(); });
$('wa-showqr')?.addEventListener('click', showQR);
$('wa-relink')?.addEventListener('click', async () => {
    if (!confirm('Déconnecter WhatsApp et générer un nouveau QR ?\n\nLa session actuelle sera supprimée — il faudra re‑scanner avec le téléphone du restaurant.')) return;
    const btn = $('wa-relink'); btn.disabled = true; btn.textContent = '⏳ Déconnexion…';
    _currentQR = null;
    try {
        const r = await fetch('/api/logout', { method: 'POST' }).then(r => r.json());
        if (r.success) { toast('Déconnecté — nouveau QR en préparation'); showQR(); }
        else toast('Erreur', 'err');
    } catch (e) { toast('Erreur réseau', 'err'); }
    btn.disabled = false; btn.textContent = '🔄 Déconnecter / Réafficher le QR';
});

/* ---------- Réglages avancés (IA + timings) ---------- */
const AC_NUM = ['aiMaxTokens', 'collectorDelaySec', 'maxWaitSec', 'idleCooldownMin', 'notifCooldownMin'];
function applyAppConfig(c) {
    if (!c) return;
    if ($('a-aiModel')) $('a-aiModel').value = c.aiModel || 'gpt-4o';
    if ($('a-aiTemperature')) { $('a-aiTemperature').value = c.aiTemperature ?? 0.65; $('a-temp-val').textContent = (c.aiTemperature ?? 0.65); }
    if ($('a-simulateTyping')) $('a-simulateTyping').checked = c.simulateTyping !== false;
    AC_NUM.forEach(k => { const el = $('a-' + k); if (el) el.value = c[k] ?? ''; });
}
if ($('a-aiTemperature')) $('a-aiTemperature').addEventListener('input', e => $('a-temp-val').textContent = e.target.value);
$('advanced-save')?.addEventListener('click', async () => {
    const body = {
        aiModel: $('a-aiModel').value,
        aiTemperature: parseFloat($('a-aiTemperature').value),
        simulateTyping: $('a-simulateTyping').checked
    };
    AC_NUM.forEach(k => { body[k] = parseFloat($('a-' + k).value); });
    const r = await fetch('/api/appconfig', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
    if (r.success) { applyAppConfig(r.appConfig); toast('Réglages avancés enregistrés'); } else toast('Erreur', 'err');
});

/* ---------- Horaires de fermeture (sleep) ---------- */
async function loadSleep() {
    try {
        const s = await fetch('/api/sleep').then(r => r.json());
        if ($('sl-enabled')) $('sl-enabled').checked = !!s.enabled;
        if ($('sl-start')) $('sl-start').value = s.start ?? 23;
        if ($('sl-end')) $('sl-end').value = s.end ?? 8;
    } catch (e) { }
}
$('sleep-save')?.addEventListener('click', async () => {
    const body = { enabled: $('sl-enabled').checked, start: parseInt($('sl-start').value), end: parseInt($('sl-end').value) };
    const r = await fetch('/api/sleep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
    if (r.success) toast('Horaires enregistrés'); else toast('Erreur', 'err');
});

/* ---------- Zone de danger : RESET DATA / RESET API ---------- */
async function doReset(btn, url, confirmMsg, okMsg, after) {
    if (!confirm(confirmMsg)) return;
    if (!confirm('Dernière confirmation — action IRRÉVERSIBLE. Continuer ?')) return;
    const label = btn.textContent; btn.disabled = true; btn.textContent = '⏳…';
    try {
        const r = await fetch(url, { method: 'POST' }).then(r => r.json());
        if (r.success) { toast(okMsg); after && after(); } else toast('Erreur: ' + (r.error || ''), 'err');
    } catch (e) { toast('Erreur réseau', 'err'); }
    btn.disabled = false; btn.textContent = label;
}
$('reset-data')?.addEventListener('click', e =>
    doReset(e.target, '/api/reset-data',
        '🗑️ RESET DATA\n\nEfface réservations, commandes, CRM, conversations et flux agent.\nLe menu, la config et les clés API sont CONSERVÉS.',
        'Données réinitialisées ✅',
        () => { loadStats(); loadOrders(); }));
$('reset-api')?.addEventListener('click', e =>
    doReset(e.target, '/api/reset-api',
        '🔑 RESET API\n\nSupprime la clé OpenAI et les identifiants Telegram enregistrés ici (retour au .env).\nAucune donnée n\'est touchée.',
        'Clés API réinitialisées ✅',
        () => { loadSettings(); loadTelegram(); }));

/* ---------- Settings (OpenAI / Telegram) ---------- */
async function loadSettings() {
    try {
        const s = await fetch('/api/settings').then(r => r.json());
        $('openai-mask').textContent = s.openaiKeyMask || '—';
        $('openai-source').textContent = s.openaiSource || '—';
        setPill('openai-state', s.hasOpenaiKey, s.hasOpenaiKey ? 'clé en place' : 'aucune clé');
        $('tg-mask').textContent = s.telegramTokenMask || '—';
        $('tg-source').textContent = s.telegramSource || '—';
        if (!$('set-tg-chat').value) $('set-tg-chat').placeholder = s.telegramChatId ? s.telegramChatId : 'ex : 123456789';
    } catch (e) { }
}
function setPill(id, ok, txt) {
    const el = $(id); if (!el) return;
    el.className = 'pill ' + (ok ? 'ok' : 'bad');
    el.innerHTML = `<span class="pdot"></span> ${txt}`;
}
$('openai-save').addEventListener('click', async () => {
    const key = $('set-openai').value.trim();
    if (!key) return toast('Saisis une clé', 'err');
    const r = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ openaiApiKey: key }) }).then(r => r.json());
    if (r.success) { $('set-openai').value = ''; toast('Clé OpenAI enregistrée'); loadSettings(); } else toast('Erreur', 'err');
});
$('openai-test').addEventListener('click', async () => {
    setPill('openai-state', true, 'test en cours…');
    const r = await fetch('/api/settings/test-openai', { method: 'POST' }).then(r => r.json());
    setPill('openai-state', r.valid, r.valid ? `valide (${r.models} modèles)` : (r.error || 'invalide'));
    toast(r.valid ? 'Clé OpenAI valide ✅' : 'Clé invalide ❌', r.valid ? 'ok' : 'err');
});
$('openai-reset').addEventListener('click', async () => {
    await fetch('/api/settings/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'openai' }) });
    toast('Retour à la clé du .env'); loadSettings();
});

$('tg-save').addEventListener('click', async () => {
    const token = $('set-tg-token').value.trim();
    const chat = $('set-tg-chat').value.trim();
    if (!token && !chat) return toast('Renseigne au moins un champ', 'err');
    toast('Reconnexion Telegram…');
    const r = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegramBotToken: token, telegramChatId: chat }) }).then(r => r.json());
    if (r.success) { $('set-tg-token').value = ''; toast(r.telegramReconnected ? 'Telegram reconnecté ✅' : 'Enregistré (vérifie le token)', r.telegramReconnected ? 'ok' : 'err'); setTimeout(() => { loadSettings(); loadTelegram(); }, 1500); }
    else toast('Erreur', 'err');
});
$('tg-reset').addEventListener('click', async () => {
    await fetch('/api/settings/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'telegram' }) });
    toast('Retour aux identifiants du .env'); setTimeout(() => { loadSettings(); loadTelegram(); }, 1500);
});

/* ---------- Telegram status ---------- */
async function loadTelegram() {
    try {
        const s = await fetch('/api/telegram/status').then(r => r.json());
        $('tg-dot').className = 'dot ' + (s.isConnected ? 'on' : 'off');
        $('tg-name').textContent = s.botInfo ? '@' + (s.botInfo.username || '?') : 'Non connecté';
        $('tg-info').textContent = s.isConnected ? 'Bot opérationnel' : 'Bot hors ligne';
        setPill('tg-state', s.isConnected, s.isConnected ? 'connecté' : 'hors ligne');
    } catch (e) { }
}
$('tg-test').addEventListener('click', async () => {
    await fetch('/api/telegram/test', { method: 'POST' });
    toast('Message test envoyé');
});

/* ---------- Feed ---------- */
function pushFeed(entry) {
    const el = document.createElement('div');
    el.className = 'feed-item';
    el.innerHTML = `<div class="feed-time">${esc(entry.time || '')}</div><div class="feed-txt">${esc(entry.text || '')}</div>`;
    const f = $('feed');
    f.prepend(el);
    while (f.children.length > 40) f.lastChild.remove();
}

/* ---------- Socket events ---------- */
socket.on('connect', () => { loadStats(); loadOrders(); loadMenu(); loadPrompt(); loadTelegram(); loadSettings(); loadSleep(); });
socket.on('config_update', applyConfig);
socket.on('appconfig_update', applyAppConfig);
socket.on('menu_update', (m) => { MENU = m || []; renderMenuEditor(); });
socket.on('system_state', renderStatusStrip);
socket.on('reservations_update', renderReservations);
socket.on('new_order', () => { loadOrders(); loadStats(); });
socket.on('agent_feed', pushFeed);
socket.on('init_tv', (list) => {
    if ($('feed')) $('feed').innerHTML = ''; // on repart propre (évite les doublons + reflète un effacement)
    (list || []).slice(-20).forEach(pushFeed);
});
$('feed-clear')?.addEventListener('click', async () => {
    if (!confirm('Effacer le journal d\'activité de l\'agent ?')) return;
    const r = await fetch('/api/feed/clear', { method: 'POST' }).then(r => r.json());
    if (r.success) { if ($('feed')) $('feed').innerHTML = ''; toast('Journal effacé'); }
    else toast('Erreur', 'err');
});
socket.on('status', (s) => { setConn(s); loadStats(); });

// initial pulls
loadStats(); loadOrders(); loadMenu(); loadPrompt(); loadTelegram(); loadSettings(); loadSleep();
setInterval(loadStats, 30000);
