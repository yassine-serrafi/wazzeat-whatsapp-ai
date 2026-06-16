<div align="center">

<img src="https://img.shields.io/badge/🍽️-WAZZEAT-ff6a3d?style=for-the-badge&labelColor=1a1a1a" alt="Wazzeat" height="46" />

### Assistant WhatsApp IA pour restaurants
#### Réservations sur place • Commandes en livraison • 100 % automatisé

<br/>

![Node.js](https://img.shields.io/badge/Node.js-LTS-3C873A?style=flat-square&logo=node.js&logoColor=white)
![WhatsApp](https://img.shields.io/badge/WhatsApp-Baileys-25D366?style=flat-square&logo=whatsapp&logoColor=white)
![OpenAI](https://img.shields.io/badge/IA-GPT--4o-412991?style=flat-square&logo=openai&logoColor=white)
![Telegram](https://img.shields.io/badge/Telegram-Bot-26A5E4?style=flat-square&logo=telegram&logoColor=white)
![Socket.io](https://img.shields.io/badge/Realtime-Socket.io-010101?style=flat-square&logo=socket.io&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![Status](https://img.shields.io/badge/status-prod--ready-success?style=flat-square)

<br/>

**Un client écrit au restaurant sur WhatsApp comme à un humain.**
L'assistant (dont vous choisissez le prénom) répond avec un ton naturel, renseigne sur la carte, les horaires et la livraison, puis **enregistre la réservation ou la commande** automatiquement.
Chaque action remonte en direct dans le dashboard **VuePro** et déclenche une **notification Telegram** pour l'équipe.

<br/>

`📅 Réservations`&nbsp;&nbsp;`🛵 Livraison`&nbsp;&nbsp;`🧠 GPT-4o`&nbsp;&nbsp;`🗣️ Ton humain`&nbsp;&nbsp;`📷 Menu OCR`&nbsp;&nbsp;`🔔 Telegram`&nbsp;&nbsp;`📊 Dashboard SaaS`

</div>

---

## 📑 Sommaire

- [Fonctionnalités](#-fonctionnalités)
- [Stack technique](#-stack-technique)
- [Architecture](#-architecture)
- [Structure du projet](#-structure-du-projet)
- [Installation & démarrage](#-installation--démarrage)
- [Configuration](#-configuration)
- [Connexion WhatsApp](#-connexion-whatsapp)
- [Hébergement recommandé (RDP)](#-hébergement-recommandé-rdp-windows)
- [Éviter le bannissement WhatsApp](#-éviter-le-bannissement-whatsapp)
- [Le cerveau IA](#-le-cerveau-ia)
- [Parcours d'une commande / réservation](#-parcours-dune-commande--réservation)
- [Gestion du menu (OCR)](#-gestion-du-menu-ocr)
- [Modes de service](#-modes-de-service)
- [Le dashboard VuePro](#-le-dashboard-vuepro)
- [Telegram](#-telegram)
- [Réglages avancés](#-réglages-avancés)
- [Référence API REST](#-référence-api-rest)
- [Événements temps réel (Socket.io)](#-événements-temps-réel-socketio)
- [Fichiers de données](#-fichiers-de-données)
- [Journaux (Winston)](#-journaux-winston)
- [Sécurité & réinitialisation](#-sécurité--réinitialisation)
- [Dépannage / FAQ](#-dépannage--faq)
- [Notes de maintenance](#-notes-de-maintenance)

---

## ✨ Fonctionnalités

- 📅 **Réservations sur place** — collecte date, heure, couverts et nom, puis confirme et notifie l'équipe.
- 🛵 **Commandes en livraison** — plats, adresse, téléphone, total calculé ; **paiement à la livraison uniquement**.
- 🔄 **Annulation & modification** — le client peut annuler ou modifier sa réservation/commande ; l'IA met à jour le statut automatiquement.
- 🗺️ **Zone de livraison stricte** — l'IA refuse poliment toute adresse hors zone (elle distingue pays, villes et quartiers).
- 📍 **Localisation WhatsApp** — le client peut partager un **pin GPS** comme adresse de livraison.
- 🗣️ **Ton 100 % humain** — messages courts, chaleureux, dans la langue du client, sans paraître robotique.
- 🎙️ **Texte, vocal & image** — comprend les messages écrits, les **notes vocales** (Whisper) et les photos.
- 📷 **Menu par photo (OCR)** — photographiez la carte, l'IA la numérise (catégorie, nom, description, prix, **allergènes**).
- 🥜 **Allergènes** — renseignables par plat et pris en compte dans les réponses de l'IA.
- 🎛️ **Tout paramétrable** depuis le dashboard — agent, menu, horaires, livraison, **clés API**, modèle IA, timings…
- 🔔 **Pilotage & alertes Telegram** — notifications temps réel et contrôle du service à distance.
- 📊 **Dashboard VuePro** — réservations, commandes, menu, configuration, simulateur, suivi des coûts.
- 💬 **Console de chat** façon WhatsApp Web pour superviser / reprendre les conversations à la main.
- 🛡️ **Modes de service** (service interrompu, commandes en pause, forte affluence, sommeil, kill switch).

---

## 🧰 Stack technique

| Domaine | Technologie |
|---|---|
| Runtime / serveur | **Node.js**, **Express**, **Socket.io** |
| WhatsApp | **@whiskeysockets/baileys** (connexion via QR) |
| Intelligence artificielle | **OpenAI** — GPT‑4o (réponses + vision/OCR), GPT‑4o‑mini (analyses), Whisper (audio) |
| Notifications / pilotage | **node-telegram-bot-api** |
| Journalisation | **Winston** + **winston-daily-rotate-file** |
| QR code | **qrcode** |

> ℹ️ L'IA n'écrit jamais de tags dans le texte : elle appelle une **fonction structurée** `send_response` qui renvoie `message`, `actions` (`RESERVATION` / `ORDER` / `CANCEL` / `ALERT` / `LANG_DETECTED`) et des objets `reservation` / `order`. Plus fiable que du parsing de texte.

---

## 🧱 Architecture

```
   Client WhatsApp
        │  (message)
        ▼
 ┌──────────────────┐     ┌───────────────────────┐
 │   Baileys (WA)   │────▶│   server.js (moteur)  │
 │  réception/envoi │     │  collecte • CRM • IA  │
 └──────────────────┘     └───────────┬───────────┘
        ▲                              │
        │ (réponse)        ┌───────────┼───────────────┐
        └──────────────────┘           ▼               ▼
                              ┌──────────────┐  ┌──────────────┐
                              │ OpenAI GPT‑4o│  │  telegram.js │
                              │  (le cerveau)│  │ alertes/ctrl │
                              └──────────────┘  └──────────────┘
                                       │
                         Socket.io ◀───┴───▶  Dashboard VuePro + Chat
                          (temps réel)        (public/*.html)
```

---

## 📂 Structure du projet

```
.
├── server.js              # Moteur : WhatsApp, collecte, CRM, IA, routes API, Socket.io
├── telegram.js            # Bot Telegram : notifications + commandes de pilotage
├── logger.js              # Journalisation Winston (rotation quotidienne)
├── package.json
├── .env                   # Secrets (OpenAI, Telegram, PORT) — À CRÉER depuis .env.example
├── .env.example           # Modèle de variables d'environnement (sans valeurs réelles)
├── .gitignore             # Exclut secrets, session WhatsApp, logs & données clients
├── public/
│   ├── index.html         # Console de chat (style WhatsApp Web) + QR
│   ├── chat.js            # Logique de la console de chat
│   ├── style.css          # Styles de la console de chat
│   ├── vuepro.html        # Dashboard SaaS d'administration
│   ├── vuepro.js          # Logique du dashboard
│   ├── vuepro.css         # Thème SaaS (fond blanc)
│   └── documentation.html # Documentation complète autonome
├── data/                  # Données & configs persistées (JSON)
│   ├── business_config.json   # Identité restaurant + agent
│   ├── app_config.json        # Réglages avancés (IA, timings)
│   ├── menu.json              # La carte
│   ├── reservations.json      # Réservations sur place
│   ├── orders.json            # Commandes en livraison
│   ├── settings.json          # Secrets surchargés (créé à la demande)
│   ├── crm.json / history.json / tv_history.json
│   ├── prompt.txt             # Prompt système (personnalité)
│   ├── *_config.json          # États des modes (sleep, panic, slow, kill…)
│   └── auth_info/             # Session WhatsApp (Baileys) — NE PAS PARTAGER
└── logs/                  # Journaux Winston (rotation)
```

---

## 🚀 Installation & démarrage

**Prérequis** : Node.js (LTS), une clé API OpenAI, un bot Telegram (optionnel mais recommandé).

```bash
# 1. Cloner le dépôt
git clone <votre-repo> && cd wazzeat

# 2. Installer les dépendances
npm install

# 3. Créer le fichier .env à partir du modèle, puis renseigner vos clés
cp .env.example .env        # (Windows : copy .env.example .env)

# 4. Lancer le serveur
npm start
# → 🚀 Serveur Wazzeat démarré sur http://localhost:3000
```

> 🔐 Le `.env` (clés OpenAI/Telegram), la session WhatsApp (`data/auth_info/`), les journaux et les données clients sont **exclus de Git** via `.gitignore`. Le dépôt public ne contient **aucun secret** — chaque déploiement renseigne ses propres clés (via `.env` ou directement dans VuePro).

| Interface | URL |
|---|---|
| 💬 Console de chat / connexion WhatsApp (QR) | `http://localhost:3000/` |
| 📊 Dashboard VuePro | `http://localhost:3000/vuepro.html` |
| 📖 Documentation | `http://localhost:3000/documentation.html` |

---

## 🔧 Configuration

### 1. Secrets — fichier `.env`

```env
OPENAI_API_KEY=sk-...          # clé OpenAI
PORT=3000                      # port du serveur
TELEGRAM_BOT_TOKEN=123:ABC...  # token @BotFather
TELEGRAM_CHAT_ID=123456789     # votre Chat ID Telegram
```

> 💡 Les clés OpenAI et Telegram peuvent aussi être saisies **directement dans VuePro** (onglet « Telegram & Coûts »). Ces valeurs **surchargent** le `.env` ; si elles sont vides, le système retombe automatiquement sur le `.env`. Les secrets ne sont jamais renvoyés en clair (seul un masque `sk-p••••xxxx` est exposé).

### 2. Configuration du restaurant (VuePro → Configuration)

| Champ | Description |
|---|---|
| `restaurantName` | Nom du restaurant |
| `agentName` | **Prénom de l'agent** utilisé face aux clients |
| `address` / `phone` | Communiqués sur demande |
| `hours` | Horaires d'ouverture |
| `deliveryZones` | Zone de livraison (en langage naturel) |
| `deliveryFee` / `minOrder` | Frais de livraison & commande minimum |
| `avgPrepTime` | Délai moyen de préparation/livraison |
| `paymentNote` | Note de paiement (par défaut : à la livraison) |

Ces valeurs sont **injectées automatiquement** dans le cerveau de l'IA à chaque message.

---

## 📱 Connexion WhatsApp

1. Lancer le serveur, ouvrir `http://localhost:3000/`.
2. Sur le téléphone : **WhatsApp → Appareils connectés → Associer un appareil** → scanner le QR.
3. La session est sauvegardée dans `data/auth_info/`.
4. L'assistant répond désormais automatiquement.

> Un **watchdog** surveille la connexion et reconnecte automatiquement en cas de coupure.
> Depuis VuePro (Centre de contrôle → **Connexion WhatsApp**), un bouton **« Déconnecter / Réafficher le QR »** permet de relier un nouveau numéro sans redémarrer le serveur (le QR s'affiche dans une modal).

---

## 🖥️ Hébergement recommandé (RDP Windows)

Pour un fonctionnement **24h/24, 7j/7**, l'hébergement conseillé est un **RDP / VPS Windows** :

- 🔌 **Toujours allumé** — ne manque aucun message, même PC perso éteint.
- 📶 **Connexion stable** — la session WhatsApp reste active (watchdog en renfort).
- 🪟 **100 % compatible** — le projet est conçu et testé sous Windows (PowerShell).
- 🔐 **Isolé** — clés et session sur une machine dédiée.

**Mise en place** : louer un RDP Windows (≈ 2 vCPU / 4 Go) → s'y connecter en Bureau à distance → installer Node.js → copier le projet → `npm install` → `npm start` → scanner le QR. Laisser tourner en continu (idéalement via un service Windows ou `pm2`).

---

## 🚫 Éviter le bannissement WhatsApp

WhatsApp est utilisé via une connexion non‑officielle : un usage trop « machine » peut faire bannir le numéro. **Se comporter comme un humain** est la règle d'or.

1. **Activer le mode dormir 💤** la nuit (VuePro → Réglages avancés → Fermeture automatique, ou `/dormir` sur Telegram). Un bot qui répond à 3h du matin est immédiatement suspect.
2. **Simulations humaines déjà intégrées** : délai de lecture, simulation de frappe (« en train d'écrire… »), regroupement des messages rapprochés, anti‑répétition.
3. **Bonnes pratiques numéro** : numéro **dédié** (pas le perso), montée en charge progressive, **répondre** aux clients (pas de démarchage de masse), volume raisonnable, profil WhatsApp Business crédible.

---

## 🧠 Le cerveau IA

À chaque message, un **prompt système dynamique** est construit puis envoyé à OpenAI. Il assemble en temps réel :

- l'**état du service** (normal / forte affluence / commandes en pause / fermé) ;
- l'**identité & la personnalité** de l'agent (éditable dans « Cerveau IA ») ;
- les **infos du restaurant** (adresse, horaires, livraison, paiement) ;
- la **carte complète** avec les prix (depuis `menu.json`) ;
- les **règles de conduite** : ton humain, messages courts, miroir linguistique, anti‑répétition, escalade humaine, **zone de livraison stricte**.

**Actions déclenchables** : `RESERVATION` `{date, time, guests, name}` · `ORDER` `{items[], address, phone, total}` · `CANCEL` `{cancel_target}` (annulation / modification) · `ALERT` (intervention humaine) · `LANG_DETECTED`.

> 🕒 Le prompt applique aussi les **horaires d'ouverture** (refuse un créneau hors service / jour de fermeture), résout les **dates relatives** (« demain », « ce soir »), escalade les **grandes tablées** (> 10 couverts) et **recalcule toujours le total côté serveur** (le montant de l'IA n'est jamais utilisé tel quel).

---

## 🔁 Parcours d'une commande / réservation

1. Le client écrit (les messages rapprochés sont **regroupés**) — par texte, **vocal** ou **photo**.
2. L'assistant **collecte les infos une à une** (plats / date / adresse…). Le client peut partager un **pin GPS** comme adresse de livraison.
3. **Vérifie la zone de livraison** : refuse poliment si hors zone (Casablanca, Lyon… si la zone est Paris).
4. **Récapitule** et fait confirmer → déclenche l'action `RESERVATION` ou `ORDER`.
5. **Enregistrement** : écrit dans `reservations.json` / `orders.json`, met à jour le CRM, retire le tag du message (le client ne voit rien de technique).
6. **Diffusion temps réel** : apparaît dans VuePro **et** notifie l'équipe sur Telegram. 🔔

> 🔄 **Annulation / modification** : si le client annule ou modifie, l'IA déclenche `CANCEL` (et recrée l'entrée en cas de modification) — le statut passe à « Annulée » dans VuePro.
> Le paiement est **toujours à la livraison** — l'agent refuse carte en ligne, virement, etc.

---

## 📷 Gestion du menu (OCR)

Depuis VuePro → **Menu / Carte** :

- **Par photo** : envoyez une photo de la carte → **GPT‑4o Vision** l'analyse et propose une liste structurée (catégorie, nom, description, prix, **allergènes**) à valider.
- **Manuelle** : ajout / édition / suppression de plats (avec champ **allergènes** optionnel), puis « Enregistrer le menu ».

Le menu enregistré est **immédiatement** connu de l'IA, qui répond sur les plats, les prix **et les allergènes**.

---

## 🎛️ Modes de service

Pilotables depuis VuePro (Centre de contrôle) **ou** Telegram :

| Mode | Comportement |
|---|---|
| 🛑 Service interrompu | N'accepte plus rien, s'excuse, propose de rappeler. |
| ⏸️ Commandes en pause | Renseigne encore, mais n'enregistre plus de commande livraison. |
| 🐢 Forte affluence | Annonce un délai de livraison rallongé. |
| 💤 Restaurant fermé | Mode sommeil : ne répond plus (plage horaire configurable). |
| 💀 Kill switch | Coupe totalement l'IA. |

---

## 📊 Le dashboard VuePro

| Section | Contenu |
|---|---|
| 📊 Vue générale | Commandes & réservations du jour, CA estimé, conversations, graphe 7 jours, flux d'activité (effaçable). |
| 📅 Réservations | Tableau live, gestion des statuts, suppression. |
| 🛵 Commandes | Journal des livraisons, statuts, suppression. |
| 📖 Menu / Carte | OCR + éditeur manuel. |
| ⚙️ Configuration | Identité resto, **nom de l'agent**, livraison, paiement. |
| 🧠 Cerveau IA | Édition du prompt système. |
| 🎛️ Centre de contrôle | Connexion WhatsApp, modes de service, simulateur. |
| 🔧 Réglages avancés | Modèle IA, timings, horaires, **zone de danger** (resets). |
| 🔔 Telegram & Coûts | Clés API, statut du bot, suivi des coûts OpenAI. |
| 📖 Documentation | Lien vers la doc complète. |

---

## 🔔 Telegram

**Notifications automatiques** : réservations, commandes, interventions humaines, langues étrangères, leads chauds, alertes de coût, changements d'état.

**Commandes** :

| Commande | Effet |
|---|---|
| `/help` | Liste des commandes |
| `/status` | État complet du système |
| `/ping` | Vérifie que l'assistant est en ligne |
| `/stop` · `/start` | Couper / relancer l'assistant |
| `/panic` · `/panicoff` | Service interrompu / repris |
| `/slow` · `/slowoff` | Forte affluence / retour normal |
| `/testnone` · `/gotest` | Commandes en pause / rouvertes |
| `/dormir` · `/rev` | Restaurant fermé / rouvert |
| `/rapport` | Rapport journalier immédiat |
| `/ventes` | 5 dernières commandes |

---

## 🔬 Réglages avancés

| Réglage | Rôle | Défaut |
|---|---|---|
| `aiModel` | Modèle OpenAI des réponses | `gpt-4o` |
| `aiTemperature` | Créativité (0 = strict) | `0.65` |
| `aiMaxTokens` | Longueur max d'une réponse | `500` |
| `simulateTyping` | Délai « humain » avant envoi | `true` |
| `collectorDelaySec` | Regroupement des messages | `7` |
| `maxWaitSec` | Attente max avant réponse | `20` |
| `idleCooldownMin` | Silence avant message proactif | `120` |
| `notifCooldownMin` | Anti‑spam notifications | `5` |

> Modifiables **à chaud** (sans redémarrage). Les valeurs sont bornées côté serveur.

---

## 🔌 Référence API REST

Toutes les routes sont servies sous `/api`.

<details>
<summary>📂 <b>Déplier la liste complète des routes</b></summary>
<br/>

**Configuration & menu**
- `GET|POST /api/config` — config restaurant
- `GET|POST /api/appconfig` — réglages avancés
- `GET|POST /api/menu` — carte · `POST /api/menu/ocr` — OCR d'une photo
- `GET|POST /api/prompt` — prompt système

**Réservations, commandes & CRM**
- `GET /api/reservations` · `POST /api/reservations/:id/status` · `DELETE /api/reservations/:id`
- `GET /api/orders` · `POST /api/orders/:id/status` · `DELETE /api/orders/:id`
- `GET /api/stats` — statistiques dashboard
- `GET /api/crm` · `POST /api/crm/update` · `POST /api/crm/clear` · `DELETE /api/crm/:jid`
- `POST /api/feed/clear` — vide le journal d'activité

**Modes, simulateur & Telegram**
- `POST /api/simulate` — teste le cerveau (sans persister)
- `GET|POST /api/sleep` · `GET|POST /api/slowmode` · `GET|POST /api/panic`
- `POST /api/logout` — déconnexion WhatsApp + nouveau QR
- `GET /api/telegram/status` · `POST /api/telegram/test`
- `GET /api/ai/recommendations` — rapport stratégique IA

**Secrets & réinitialisation**
- `GET /api/settings` — secrets **masqués**
- `POST /api/settings` — enregistre clé OpenAI / Telegram (reconnexion à chaud)
- `POST /api/settings/reset` — retour au `.env`
- `POST /api/settings/test-openai` — teste la clé
- `POST /api/reset-data` — efface les données (garde les clés)
- `POST /api/reset-api` — supprime les clés (garde les données)

</details>

---

## ⚡ Événements temps réel (Socket.io)

<details>
<summary>⚡ <b>Déplier les événements temps réel</b></summary>
<br/>

**Serveur → client** : `status`, `qr_code`, `system_state`, `config_update`, `appconfig_update`, `menu_update`, `reservations_update`, `new_order`, `agent_feed`, `init_crm`, `init_history`, `init_tv`, `new_message`, `ai_status`, `crm_update`, `conversation_deleted`

**Client → serveur** : `toggle_ai`, `relaunch_ai`, `manual_reply`, `delete_conversation`, `toggle_setting`, `update_reservation_status`, `update_order_status`, `get_reservations`, `check_ai_status`

</details>

---

## 🗂️ Fichiers de données

Tout est persisté en JSON dans `data/` (écritures atomiques anti‑corruption) : `business_config.json`, `app_config.json`, `menu.json`, `reservations.json`, `orders.json`, `settings.json`, `crm.json`, `history.json`, `tv_history.json`, `prompt.txt`, les `*_config.json` (modes), et `auth_info/` (session WhatsApp — **à ne pas partager**).

---

## 📜 Journaux (Winston)

Affichage couleur en console + fichiers tournants dans `logs/` :

| Sortie | Contenu | Niveau | Rétention |
|---|---|---|---|
| Console | Feedback en direct (colorisé) | info | — |
| `logs/connection-*.log` | Cycle de vie / connexion WhatsApp | info | 14 j |
| `logs/error-*.log` | Erreurs critiques | error | 30 j |
| `logs/combined-*.log` | Tous les logs | info | 7 j |

Format fichier JSON, rotation quotidienne automatique, `exitOnError: false` (une erreur de log ne fait jamais planter le serveur).

---

## 🛡️ Sécurité & réinitialisation

- 🔐 Les clés (OpenAI, Telegram) et `data/auth_info/` sont **sensibles** : ne pas les partager / versionner. En cas de fuite, **régénérer** les clés.
- Le dashboard ne renvoie jamais les secrets en clair (masque uniquement).

**Zone de danger (VuePro → Réglages avancés)** :
- 🗑️ **RESET DATA** — efface réservations, commandes, CRM, conversations, flux agent. **Conserve** menu, config et clés.
- 🔑 **RESET API** — supprime clé OpenAI + identifiants Telegram (retour au `.env`). **Aucune donnée** touchée.

Les deux demandent une double confirmation et sont indépendants.

---

## ❓ Dépannage / FAQ

<details>
<summary>❓ <b>Déplier le guide de dépannage</b></summary>
<br/>

**L'assistant ne répond pas**
- Vérifier que WhatsApp est connecté (badge sidebar) et que le Kill switch / mode fermé n'est pas actif.
- Tester la clé OpenAI (« Tester la clé »).

**Le QR ne s'affiche pas / erreur 405**
- Une erreur **405** signifie que WhatsApp rejette la connexion (souvent une version WhatsApp Web périmée ou trop de tentatives d'appairage). Le serveur force une version récente connue en fallback ; en cas de blocage, attendre quelques minutes puis relancer.
- Rafraîchir `http://localhost:3000/` (le QR est ré‑émis à la connexion). Le bouton « Déconnecter / Réafficher le QR » (VuePro) régénère un QR.

**Les notifications Telegram n'arrivent pas**
- Vérifier token + Chat ID, **écrire d'abord au bot** depuis votre Telegram, puis « Envoyer un test ».

**L'OCR du menu rate des plats** → utiliser une photo nette et bien cadrée, compléter manuellement si besoin.

**Changer le prénom de l'agent** → VuePro → Configuration → « Nom de l'agent commercial » → pris en compte immédiatement.

</details>

---

## 🛠️ Notes de maintenance

- **Version WhatsApp Web** : le serveur récupère la dernière version en ligne ; si le fetch échoue, il bascule sur une **version de secours connue** (`server.js`, constante `FALLBACK_WA_VERSION`). À mettre à jour si WhatsApp évolue et qu'un `405` réapparaît.
- **Numéro dédié** recommandé pour WhatsApp + activer le **mode dormir** la nuit (anti‑ban).
- Pensez à **régénérer les clés** du `.env` si elles ont circulé, et à créer un **bot Telegram dédié** au restaurant.

---

<div align="center">

<br/>

### 🍽️ Wazzeat — *Bon service !*

**Fait pour les restaurants qui veulent répondre à chaque client, automatiquement.**

<sub>Réservations • Livraison • IA • Temps réel • Paiement à la livraison</sub>

<br/>

![Wazzeat](https://img.shields.io/badge/🍽️-WAZZEAT-ff6a3d?style=for-the-badge&labelColor=1a1a1a)

</div>
