const TelegramBot = require('node-telegram-bot-api');
const logger = require('./logger');

// --- CONFIGURATION (modifiable à chaud depuis le dashboard) ---
let TOKEN = process.env.TELEGRAM_BOT_TOKEN;
let CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Définit/écrase les identifiants Telegram (appelé avant initTelegram ou via reconfigure)
function setCredentials(token, chatId) {
    if (token) TOKEN = String(token).trim();
    if (chatId) CHAT_ID = String(chatId).trim();
}

// Reconfigure le bot à chaud : coupe l'ancien polling et relance avec les nouveaux identifiants
async function reconfigure(token, chatId) {
    setCredentials(token, chatId);
    try {
        if (bot) {
            await bot.stopPolling({ cancel: true }).catch(() => {});
            bot = null;
        }
    } catch (e) { logger.warn(`[TELEGRAM] Arrêt ancien bot: ${e.message}`); }
    isConnected = false;
    await initTelegram();
    return isConnected;
}

// --- ETAT INTERNE ---
let bot = null;
let isConnected = false;
let botInfo = { username: 'Inconnu', firstName: 'Inconnu' };
let lastTelegramActivity = Date.now(); // TRACKER V2 POUR LE BAVARDAGE

// Initialisation COMPLETE de tous les champs — évite les undefined dans /status
let systemState = {
    panicMode: false,
    pauseOrders: false,
    aiStopped: false,
    slowMode: false,
    isSleeping: false,
    sleepStart: 23,
    sleepEnd: 8,
    connectionStatus: 'INITIALIZING'
};

// --- INITIALISATION ---
async function initTelegram() {
    try {
        if (bot) return; // Déjà init

        logger.info('📡 [TELEGRAM] Initialisation du bot...');
        bot = new TelegramBot(TOKEN, { polling: true });

        // Récupérer les infos du bot
        const me = await bot.getMe();
        botInfo = { username: me.username, firstName: me.first_name };
        logger.info(`📡 [TELEGRAM] Connecté en tant que @${me.username}`);

        // --- GESTION ERREURS POLLING ---
        bot.on('polling_error', (error) => {
            if (error.code !== 'EFATAL') {
                logger.warn(`⚠️ [TELEGRAM] Polling Error: ${error.code || error.message}`);
            } else {
                logger.error(`🔥 [TELEGRAM] Fatal Polling Error: ${error.message}`);
            }
        });

        // --- ECOUTE DES COMMANDES ---
        setupCommands();

        isConnected = true;
        sendStartupAlert();

    } catch (e) {
        logger.error(`🔥 [TELEGRAM] Echec Initialisation: ${e.message}`);
        isConnected = false;
    }
}

function sendTestMessage() {
    safeSend(`🔔 <b>TEST LIVE CHECK</b>\n\nCeci est un test manuel depuis le dashboard VuePro.\nSi tu lis ça, tout fonctionne ! ✅`);
}

function updateSystemState(newState) {
    systemState = { ...systemState, ...newState };
}

// --- HELPER : vérification accès ---
function isAuthorized(msg) {
    return String(msg.chat.id) === CHAT_ID;
}

// --- COMMANDES ---
function setupCommands() {
    if (!bot) return;

    // /help — Liste toutes les commandes
    bot.onText(/^\/help$/i, (msg) => {
        if (!isAuthorized(msg)) return;
        safeSend(
            `🤖 <b>COMMANDES WAZZEAT</b>\n\n` +
            `<b>CONTRÔLE BOT</b>\n` +
            `/ping — Vérifier que l'assistant est en ligne\n` +
            `/status — Voir l'état complet du système\n` +
            `/stop — Couper l'assistant (silence total)\n` +
            `/start — Relancer l'assistant\n\n` +
            `<b>MODES SERVICE</b>\n` +
            `/panic — Service interrompu (cuisine à l'arrêt)\n` +
            `/panicoff — Reprendre le service\n` +
            `/slow — Forte affluence (délai livraison rallongé)\n` +
            `/slowoff — Revenir au délai normal\n` +
            `/testnone — Mettre les commandes en PAUSE (cuisine saturée)\n` +
            `/gotest — Rouvrir les commandes\n` +
            `/rev — Rouvrir le restaurant (désactiver le sommeil)\n` +
            `/dormir — Fermer le restaurant IMMÉDIATEMENT\n\n` +
            `<b>STATISTIQUES</b>\n` +
            `/rapport — Générer le rapport journalier immédiatement\n` +
            `/ventes — Voir les 5 dernières commandes (plats, client, total)\n\n` +
            `<b>DASHBOARD</b>\n` +
            `http://localhost:3000/vuepro.html`
        );
    });

    // /ping
    bot.onText(/^\/ping$/i, (msg) => {
        if (!isAuthorized(msg)) return;
        bot.sendMessage(CHAT_ID, `🏓 Pong ! L'assistant est en ligne et tous les systèmes sont opérationnels.`);
    });

    // /status
    bot.onText(/^\/status$/i, (msg) => {
        if (!isAuthorized(msg)) return;
        const s = systemState;
        const statusMsg =
            `📊 <b>ÉTAT DU SYSTÈME</b>\n` +
            `——————————————\n` +
            `🌐 WhatsApp : <b>${s.connectionStatus === 'CONNECTED' ? '✅ CONNECTÉ' : '❌ ' + (s.connectionStatus || 'INCONNU')}</b>\n` +
            `🚨 Service : <b>${s.panicMode ? '🔴 INTERROMPU' : '🟢 OUVERT'}</b>\n` +
            `⏸️ Commandes : <b>${s.pauseOrders ? '🔴 EN PAUSE' : '🟢 OUVERTES'}</b>\n` +
            `💀 Kill Switch : <b>${s.aiStopped ? '🔴 COUPÉ' : '🟢 RUNNING'}</b>\n` +
            `🐢 Affluence : <b>${s.slowMode ? '🟡 FORTE (livraison rallongée)' : '🟢 NORMALE'}</b>\n` +
            `💤 Restaurant : <b>${s.isSleeping ? `🟡 FERMÉ (${s.sleepStart}h → ${s.sleepEnd}h)` : '🟢 OUVERT'}</b>\n` +
            `——————————————\n` +
            `🕐 <i>${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</i>`;
        bot.sendMessage(CHAT_ID, statusMsg, { parse_mode: 'HTML' });
    });

    // /panic — Activer mode panique
    bot.onText(/^\/panic$/i, (msg) => {
        if (!isAuthorized(msg)) return;
        if (panicCallback) panicCallback(true);
        bot.sendMessage(CHAT_ID,
            `🚨 <b>SERVICE INTERROMPU</b> 🚨\nL'assistant n'accepte plus de commandes/réservations et prévient les clients.\nFais /panicoff pour reprendre le service.`,
            { parse_mode: 'HTML' }
        );
    });

    // /panicoff — Désactiver mode panique
    bot.onText(/^\/panicoff$/i, (msg) => {
        if (!isAuthorized(msg)) return;
        if (panicCallback) panicCallback(false);
        bot.sendMessage(CHAT_ID,
            `✅ <b>SERVICE REPRIS</b>\nRetour à la normale. L'assistant prend de nouveau réservations et commandes.`,
            { parse_mode: 'HTML' }
        );
    });

    // /stop — Kill Switch ON
    bot.onText(/^\/stop$/i, (msg) => {
        if (!isAuthorized(msg)) return;
        if (stopCallback) stopCallback(true);
        bot.sendMessage(CHAT_ID,
            `🛑 <b>L'ASSISTANT EST MUET</b>\nLe bot ne répondra plus à personne.\nFais /start pour le relancer.`,
            { parse_mode: 'HTML' }
        );
    });

    // /start — Kill Switch OFF
    bot.onText(/^\/start$/i, (msg) => {
        if (!isAuthorized(msg)) return;
        if (stopCallback) stopCallback(false);
        bot.sendMessage(CHAT_ID,
            `✅ <b>L'ASSISTANT EST REPARTI</b>\nLe système reprend les réponses automatiques.`,
            { parse_mode: 'HTML' }
        );
    });

    // /slow — Activer Slow Mode
    bot.onText(/^\/slow$/i, (msg) => {
        if (!isAuthorized(msg)) return;
        if (slowCallback) slowCallback(true);
        bot.sendMessage(CHAT_ID,
            `🐢 <b>FORTE AFFLUENCE ACTIVÉE</b>\nL'assistant annonce un délai de livraison rallongé (≈ 1h-1h30) aux clients.\nFais /slowoff pour revenir à la normale.`,
            { parse_mode: 'HTML' }
        );
    });

    // /slowoff — Désactiver Slow Mode
    bot.onText(/^\/slowoff$/i, (msg) => {
        if (!isAuthorized(msg)) return;
        if (slowCallback) slowCallback(false);
        bot.sendMessage(CHAT_ID,
            `✅ <b>AFFLUENCE NORMALE</b>\nRetour au délai de livraison habituel.`,
            { parse_mode: 'HTML' }
        );
    });

    // /testnone — Mettre les commandes en pause
    bot.onText(/^\/testnone$/i, (msg) => {
        if (!isAuthorized(msg)) return;
        if (testModeCallback) testModeCallback(false);
        bot.sendMessage(CHAT_ID,
            `⏸️ <b>COMMANDES EN PAUSE</b>\nL'assistant n'enregistre plus de nouvelles commandes livraison (cuisine saturée). Il propose la réservation ou de repasser plus tard.\nFais /gotest pour rouvrir.`,
            { parse_mode: 'HTML' }
        );
    });

    // /gotest — Rouvrir les commandes
    bot.onText(/^\/gotest$/i, (msg) => {
        if (!isAuthorized(msg)) return;
        if (testModeCallback) testModeCallback(true);
        bot.sendMessage(CHAT_ID,
            `✅ <b>COMMANDES ROUVERTES</b>\nL'assistant accepte de nouveau les commandes en livraison.`,
            { parse_mode: 'HTML' }
        );
    });

    // /rev — Réveil forcé
    bot.onText(/^\/rev$/i, (msg) => {
        if (!isAuthorized(msg)) return;
        if (wakeCallback) wakeCallback();
        bot.sendMessage(CHAT_ID,
            `☀️ <b>L'ASSISTANT RÉVEILLÉ !</b>\nLe mode sommeil est désactivé. L'assistant répond à nouveau, même la nuit.`,
            { parse_mode: 'HTML' }
        );
    });

    // /dormir — Mise en veille forcée
    bot.onText(/^\/dormir$/i, (msg) => {
        if (!isAuthorized(msg)) return;
        if (sleepCallback) sleepCallback(true);
        bot.sendMessage(CHAT_ID,
            `💤 <b>SOMMEIL FORCÉ ACTIVÉ !</b>\nLe mode sommeil est activé instantanément. L'assistant ne répondra plus de la nuit.`,
            { parse_mode: 'HTML' }
        );
    });

    // /rapport — Déclencher le rapport journalier manuellement
    bot.onText(/^\/rapport$/i, (msg) => {
        if (!isAuthorized(msg)) return;
        if (rapportCallback) rapportCallback();
        bot.sendMessage(CHAT_ID,
            `📊 <b>RAPPORT DEMANDÉ</b>\nCompilation des statistiques en cours...`,
            { parse_mode: 'HTML' }
        );
    });

    // /ventes — Afficher les 5 dernières ventes
    bot.onText(/^\/ventes$/i, (msg) => {
        if (!isAuthorized(msg)) return;
        if (ventesCallback) {
            ventesCallback();
        } else {
            bot.sendMessage(CHAT_ID, `⏳ <b>Chargement des ventes...</b>`, { parse_mode: 'HTML' });
        }
    });

    // Commande inconnue — feedback utile
    bot.on('message', (msg) => {
        if (!isAuthorized(msg)) return;
        if (!msg.text || !msg.text.startsWith('/')) return;
        const knownCmds = ['/help', '/ping', '/status', '/panic', '/panicoff', '/stop', '/start', '/slow', '/slowoff', '/testnone', '/gotest', '/rev', '/dormir', '/rapport', '/ventes'];
        if (!knownCmds.some(c => msg.text.toLowerCase().startsWith(c))) {
            bot.sendMessage(CHAT_ID, `❓ Commande inconnue : <code>${msg.text}</code>\nFais /help pour voir toutes les commandes.`, { parse_mode: 'HTML' });
        }
    });

    logger.info('📡 [TELEGRAM] Toutes les commandes enregistrées ✅');
}

// --- CALLBACKS EXTERNES (Liaison server.js) ---
let panicCallback = null;
let stopCallback = null;
let slowCallback = null;
let wakeCallback = null;
let sleepCallback = null;
let testModeCallback = null; // Manquait la declaration - rendait la variable globale implicite
let rapportCallback = null; // Nouveau callback statistique
let ventesCallback = null; // Callback pour les 5 dernières ventes

function setPanicCallback(cb) { panicCallback = cb; }
function setStopCallback(cb) { stopCallback = cb; }
function setSlowCallback(cb) { slowCallback = cb; }
function setTestModeCallback(cb) { testModeCallback = cb; }
function setWakeCallback(cb) { wakeCallback = cb; }
function setSleepCallback(cb) { sleepCallback = cb; }
function setRapportCallback(cb) { rapportCallback = cb; }
function setVentesCallback(cb) { ventesCallback = cb; }

// --- HELPER D'ENVOI SECURISE (HTML) ---
async function safeSend(message) {
    if (!bot || !isConnected) {
        logger.warn('📡 [TELEGRAM] safeSend ignoré — bot non connecté');
        return;
    }

    // Reset tracker d'activité Telegram (Pour le système Anti-Spam du Personality Engine)
    lastTelegramActivity = Date.now();

    try {
        await bot.sendMessage(CHAT_ID, message, { parse_mode: 'HTML' });
    } catch (e) {
        logger.error(`⚠️ [TELEGRAM] Echec envoi: ${e.message}`);
        // Retry sans formatage si le HTML a causé l'erreur
        try {
            const plain = message.replace(/<[^>]+>/g, '');
            await bot.sendMessage(CHAT_ID, plain);
        } catch (e2) {
            logger.error(`⚠️ [TELEGRAM] Retry plain text aussi échoué: ${e2.message}`);
        }
    }
}
// --- HELPER : Escape HTML & truncate for Telegram ---
function esc(text, maxLen) {
    let s = String(text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (maxLen && s.length > maxLen) s = s.substring(0, maxLen) + '...';
    return s;
}

// --- TYPES D'ALERTES ---

// 1. Démarrage
function sendStartupAlert() {
    safeSend(
        `🚀 <b>L'ASSISTANT DÉMARRÉ</b>\n\n` +
        `Le système est en ligne et prêt à prendre réservations et commandes.\n` +
        `🕐 ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}\n\n` +
        `Fais /status pour voir l'état complet.`
    );
}

// 2. Code Reçu (PRIORITAIRE)
function sendCodeAlert(code, sender, context) {
    const ctx = context || {};
    const cleanSender = String(sender).replace('@s.whatsapp.net', '');
    const amountDisplay = ctx.amount ? `${ctx.amount} €` : `58 € (estimé)`;
    let msg = `💰 <b>CODE REÇU !</b>\n\n` +
        `👤 Client : <code>${cleanSender}</code>\n` +
        `🎫 Code : <code>${code}</code>\n` +
        `💶 Montant : <b>${amountDisplay}</b>\n`;
    if (ctx.fullText) msg += `💬 Message : "<i>${esc(ctx.fullText, 200)}</i>"\n`;
    if (ctx.status) msg += `📊 Statut : <b>${ctx.status}</b>\n`;
    safeSend(msg);
}

// 2b. Nouvelle RÉSERVATION sur place
function sendReservationAlert(jid, resa) {
    const cleanId = String(jid).replace('@s.whatsapp.net', '');
    const r = resa || {};
    safeSend(
        `📅 <b>NOUVELLE RÉSERVATION</b>\n\n` +
        `👤 Client : <code>${cleanId}</code>\n` +
        `🙍 Nom : <b>${esc(r.name || '—', 60)}</b>\n` +
        `📆 Date : <b>${esc(r.date || '—', 40)}</b>\n` +
        `🕐 Heure : <b>${esc(r.time || '—', 20)}</b>\n` +
        `👥 Couverts : <b>${r.guests || '—'}</b>\n\n` +
        `👉 À confirmer dans le dashboard.`
    );
}

// 2c. Nouvelle COMMANDE en livraison
function sendOrderAlert(jid, order) {
    const cleanId = String(jid).replace('@s.whatsapp.net', '');
    const o = order || {};
    const itemsTxt = (o.items || []).map(it => `• ${it.qty || 1}× ${esc(it.name || '', 40)}`).join('\n') || '—';
    safeSend(
        `🛵 <b>NOUVELLE COMMANDE (LIVRAISON)</b>\n\n` +
        `👤 Client : <code>${cleanId}</code>\n` +
        `🍽️ Plats :\n${itemsTxt}\n` +
        `📍 Adresse : <i>${esc(o.address || '—', 120)}</i>\n` +
        `📞 Tél : <code>${esc(o.phone || '—', 30)}</code>\n` +
        `💶 Total : <b>${o.total != null ? o.total : '—'}</b> (💵 paiement à la livraison)\n\n` +
        `👉 À préparer.`
    );
}

// 3. Alerte IA (Tag [ALERT])
function sendAiAlert(ticketId, reason, context) {
    const ctx = context || {};
    const cleanId = String(ticketId).replace('@s.whatsapp.net', '');
    let msg = `⚠️ <b>ALERTE — INTERVENTION REQUISE</b>\n\n` +
        `👤 Client : <code>${cleanId}</code>\n` +
        `📝 Raison : ${reason || "Besoin d'aide humaine"}\n`;
    if (ctx.status) msg += `📊 Statut CRM : <b>${ctx.status}</b>\n`;
    if (ctx.clientMessage) msg += `💬 Son message : "<i>${esc(ctx.clientMessage, 300)}</i>"\n`;
    if (ctx.lastMessages && ctx.lastMessages.length > 0) {
        msg += `\n📜 <b>Derniers échanges :</b>\n`;
        for (const m of ctx.lastMessages) {
            const who = m.from === 'client' ? '👤' : '🤖';
            msg += `${who} ${esc(m.text, 150)}\n`;
        }
    }
    msg += `\n👉 Réponds au client directement sur WhatsApp.`;
    safeSend(msg);
}

// 4. Echec Paiement
function sendPaymentFailAlert(ticketId, text) {
    const cleanId = String(ticketId).replace('@s.whatsapp.net', '');
    safeSend(
        `💳 <b>ÉCHEC PAIEMENT SIGNALÉ</b>\n\n` +
        `👤 Client : <code>${cleanId}</code>\n` +
        `💬 Message : "<i>${esc(text, 300)}</i>"\n\n` +
        `👉 Intervention recommandée pour débloquer.`
    );
}

// 4b. Relance Client (le client attend un suivi de sa réservation / commande)
function sendImpatienceAlert(ticketId, text) {
    const cleanId = String(ticketId).replace('@s.whatsapp.net', '');
    safeSend(
        `⏱️ <b>CLIENT EN ATTENTE DE SUIVI</b>\n\n` +
        `👤 Client : <code>${cleanId}</code>\n` +
        `💬 Message : "<i>${esc(text, 300)}</i>"\n\n` +
        `👉 <b>Le client relance.</b> Pense à confirmer sa réservation / commande.`
    );
}

// 5. Lead Chaud (> 10 msgs sans achat)
function sendHotLeadAlert(ticketId, count, context) {
    const ctx = context || {};
    const cleanId = String(ticketId).replace('@s.whatsapp.net', '');
    let msg = `🔥 <b>LEAD CHAUD !</b>\n\n` +
        `👤 Client : <code>${cleanId}</code>\n` +
        `💬 Messages échangés : <b>${count}</b>\n`;
    if (ctx.status) msg += `📊 Statut : <b>${ctx.status}</b>\n`;
    if (ctx.lastMessage) msg += `💬 Dernier msg : "<i>${esc(ctx.lastMessage, 200)}</i>"\n`;
    msg += `\n👉 Il hésite — conclus la vente maintenant !`;
    safeSend(msg);
}

// 6. Déconnexion WhatsApp / Serveur
async function sendConnectionAlert(status, detail) {
    if (status === 'DISCONNECTED') {
        await safeSend(`🚨 <b>WHATSAPP DÉCONNECTÉ</b>\n\nL'assistant ne répond plus à personne.\nLe système va tenter une reconnexion automatique.`);
    } else if (status === 'CONNECTED') {
        await safeSend(`✅ <b>WHATSAPP RECONNECTÉ</b>\nL'assistant est de nouveau en ligne. Retour à la normale.`);
    } else if (status === 'SERVER_STOP') {
        await safeSend(`🛑 <b>SERVEUR ARRÊTÉ</b>\nArrêt manuel ou redémarrage en cours.\nL'assistant sera offline jusqu'au prochain démarrage.`);
    } else if (status === 'SERVER_CRASH') {
        await safeSend(
            `🔥 <b>SERVEUR CRASHÉ !</b>\n\n` +
            `Erreur critique : <code>${detail || 'Inconnue'}</code>\n\n` +
            `👉 Redémarre le script immédiatement !`
        );
    } else if (status === 'SERVER_ERROR') {
        await safeSend(`⚠️ <b>ERREUR SERVEUR (non-fatale)</b>\n\n<code>${String(detail).substring(0, 200)}</code>`);
    }
}

// 7. Rapport Journalier (Appelé par server.js à 23h)
function sendDailyReport(stats) {
    const { date, sales, revenue, newContacts, manualInterventions, topCountries } = stats;
    const revenueDisplay = revenue !== undefined ? revenue : 0; // rétrocompat

    safeSend(
        `📊 <b>RÉCAP DU ${date}</b>\n` +
        `——————————————\n` +
        `🛵 Commandes/réservations : <b>${sales}</b> (≈ ${revenueDisplay} €)\n` +
        `👥 Nouveaux contacts : <b>${newContacts}</b>\n` +
        `⚠️ Interventions manuelles : <b>${manualInterventions}</b>\n` +
        `🌍 Pays : ${(topCountries || []).join(', ') || 'N/A'}\n` +
        `——————————————\n` +
        `✅ L'assistant est opérationnel`
    );
}

// 8. International
function sendForeignLangAlert(ticketId, lang, clientMessage) {
    let msg = `🌍 <b>LANGUE ÉTRANGÈRE DÉTECTÉE</b>\n\n` +
        `👤 Client : <code>${ticketId}</code>\n` +
        `🗣️ Langue détectée : <b>${lang}</b>\n\n`;
    if (clientMessage) msg += `💬 Message : "<i>${esc(clientMessage, 300)}</i>"\n\n`;
    msg += `👉 L'assistant gère, mais garde un œil.`;
    safeSend(msg);
}

// 9. Sécurité (Insultes/Spam)
function sendSecurityAlert(ticketId, type, fullMessage) {
    const cleanId = String(ticketId).replace('@s.whatsapp.net', '');
    let msg = `🚫 <b>ALERTE SÉCURITÉ (${type})</b>\n\n` +
        `👤 Client : <code>${cleanId}</code>\n`;
    if (fullMessage) msg += `💬 Message : "<i>${esc(fullMessage, 300)}</i>"\n`;
    msg += `Action : Client signalé.`;
    safeSend(msg);
}

// 9b. Escalade — Menace Légale / Remboursement
function sendEscalationAlert(ticketId, clientMessage, crmStatus) {
    const cleanId = String(ticketId).replace('@s.whatsapp.net', '');
    const isPaying = ['payment_received', 'test_sent'].includes(crmStatus);
    let msg = `🚨 <b>ESCALADE — MENACE / REMBOURSEMENT / COLÈRE</b>\n\n` +
        `👤 Client : <code>${cleanId}</code>\n` +
        `📊 Statut CRM : <b>${crmStatus || 'inconnu'}${isPaying ? ' ⚠️ A DÉJÀ PAYÉ' : ''}</b>\n` +
        `💬 Message : "<i>${esc(clientMessage, 300)}</i>"\n\n` +
        `👉 <b>Intervention URGENTE requise.</b> Ne laisse pas L'assistant gérer ça seul.`;
    safeSend(msg);
}

// 10. Intention réservation / commande détectée
function sendFreeTrialAlert(sender, text, context) {
    const ctx = context || {};
    const cleanSender = String(sender).replace('@s.whatsapp.net', '');
    let msg = `🍽️ <b>INTENTION RÉSERVATION / COMMANDE</b>\n\n` +
        `👤 Client : <code>${cleanSender}</code>\n` +
        `💬 Message : "<i>${esc(text, 300)}</i>"\n`;
    if (ctx.status) msg += `📊 Statut : <b>${ctx.status}</b>\n`;
    msg += `\n👉 L'assistant gère la prise de réservation/commande.`;
    safeSend(msg);
}

// 11. Panic Mode via Dashboard
function sendPanicAlert(enabled) {
    if (enabled) {
        safeSend(`🚨 <b>MODE PANIQUE ACTIVÉ VIA DASHBOARD</b> 🚨\nL'assistant passe en mode sécurisé.`);
    } else {
        safeSend(`✅ <b>MODE PANIQUE DÉSACTIVÉ VIA DASHBOARD</b>\nRetour à la normale.`);
    }
}


// 12. Sommeil / Réveil Automatique
function sendSleepAlert(isGoingToSleep, start, end) {
    if (isGoingToSleep) {
        safeSend(
            `💤 <b>MODE SOMMEIL ACTIVÉ</b>\n\n` +
            `Il est ${start}h. L'assistant va dormir jusqu'à ${end}h.\n` +
            `Déconnexion WhatsApp en cours (Furtivité Humaine).`
        );
    } else {
        safeSend(
            `🌅 <b>RÉVEIL AUTOMATIQUE</b>\n\n` +
            `Il est ${end}h. L'assistant se réveille et se reconnecte.\n` +
            `Prêt pour une nouvelle journée de service !`
        );
    }
}

// 13. Changement de Paramètres (Dashboard)
function sendSettingsAlert(settingName, value) {
    let message = "";
    switch (settingName) {
        case 'panicMode':
            message = value ? "🚨 <b>MODE PANIQUE ACTIVÉ</b> (via Dashboard)" : "✅ <b>MODE PANIQUE DÉSACTIVÉ</b> (via Dashboard)";
            break;
        case 'pauseOrders':
            message = value ? "⏸️ <b>COMMANDES EN PAUSE</b> (via Dashboard)" : "✅ <b>COMMANDES ROUVERTES</b> (via Dashboard)";
            break;
        case 'aiStopped':
            message = value ? "💀 <b>KILL SWITCH ACTIVÉ</b> (via Dashboard)\nL'assistant est muet." : "✅ <b>KILL SWITCH DÉSACTIVÉ</b> (via Dashboard)\nL'assistant parle à nouveau.";
            break;
        case 'slowMode':
            message = value ? "🐢 <b>FORTE AFFLUENCE</b> (via Dashboard)" : "✅ <b>AFFLUENCE NORMALE</b> (via Dashboard)";
            break;
        case 'isSleeping':
            message = value ? "💤 <b>RESTAURANT FERMÉ</b> (via Dashboard)" : "☀️ <b>RESTAURANT OUVERT</b> (via Dashboard)";
            break;
        default:
            message = `⚙️ <b>PARAMÈTRE MODIFIÉ</b>\n${settingName}: ${value}`;
    }
    safeSend(message);
}

// 15. Personality Engine Message (Bavardage proactif)
function sendPersonalityMessage(text) {
    safeSend(`👨‍💼 <b>L'assistant :</b>\n\n<i>"${text}"</i>`);
}

// 15b. Alerte Seuil de Coût API OpenAI (5$, 10$, etc.)
function sendCostAlert(threshold, exactCost) {
    let msg = `💸 <b>ALERTE BUDGET L'ASSISTANT</b>\n\n` +
        `Le coût de l'API vient de franchir le cap des <b>${threshold} $</b>.\n` +
        `💶 Coût exact actuel : <b>${exactCost.toFixed(3)} $</b>\n\n` +
        `👉 <i>Alerte automatique générée tous les 5$. Consultez la VuePro pour les détails.</i>`;
    safeSend(msg);
}

// 16. Rapport des 5 dernières ventes (commande /ventes)
function sendVentesReport(message) {
    safeSend(message);
}

function getLastTelegramActivity() {
    return lastTelegramActivity;
}

module.exports = {
    initTelegram,
    setCredentials,
    reconfigure,
    getLastTelegramActivity,
    sendPersonalityMessage,
    sendVentesReport,
    setPanicCallback,
    setStopCallback,
    setSlowCallback,
    setTestModeCallback,
    setWakeCallback,
    setSleepCallback,
    setRapportCallback,
    setVentesCallback,
    sendStartupAlert,
    sendCodeAlert,
    sendReservationAlert,
    sendOrderAlert,
    sendAiAlert,
    sendPaymentFailAlert,
    sendImpatienceAlert,
    sendHotLeadAlert,
    sendConnectionAlert,
    sendDailyReport,
    sendForeignLangAlert,
    sendSecurityAlert,
    sendEscalationAlert,
    sendFreeTrialAlert,
    sendTestMessage,
    sendPanicAlert,
    sendSleepAlert,
    sendSettingsAlert,
    sendCostAlert,
    updateSystemState,
    getStatus: () => ({ isConnected, chatId: CHAT_ID, botInfo })
};
