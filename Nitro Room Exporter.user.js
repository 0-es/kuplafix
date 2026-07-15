// ==UserScript==
// @name         Nitro Room Exporter
// @namespace    nitro-exporter
// @version      1.0.0
// @description  Export room blueprints from any Nitro client - Universal Tool
// @author       res
// @match        *://*/*
// @exclude      *://kuplahotelli.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────
    // Constants & State
    // ─────────────────────────────────────────────────────────────────
    const SCRIPT_NAME = 'NitroExporter';
    const HEADER_STORAGE_KEY_PREFIX = 'nitro_headers_';

    const log = {
        info: (...args) => console.log(`%c[${SCRIPT_NAME}]`, 'color: #00bcd4; font-weight: bold;', ...args),
        warn: (...args) => console.warn(`%c[${SCRIPT_NAME}]`, 'color: #ff9800; font-weight: bold;', ...args),
        error: (...args) => console.error(`%c[${SCRIPT_NAME}]`, 'color: #f44336; font-weight: bold;', ...args),
        debug: (...args) => console.debug(`%c[${SCRIPT_NAME}]`, 'color: #9e9e9e;', ...args),
    };

    // Current Server State
    const AppState = {
        serverName: 'Unknown',
        socketUrl: null,
        furniDataUrl: null,
        headers: {
            RoomFloorItems: 1778,
            RoomWallItems: 2455,
            RoomModel: 1301,
            RoomHeightmap: 2753
        },
        discoveryMode: false,
        packetHistory: [],
        maxHistory: 50,
        furnitureData: new Map(),
        isFurniLoaded: false
    };

    // ─────────────────────────────────────────────────────────────────
    // Nitro Configuration Detection
    // ─────────────────────────────────────────────────────────────────
    function detectNitro() {
        const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

        // Strategy 1: Direct access
        let cfg = win.NitroConfig || win._exportedNitroConfig;

        // Strategy 2: Injection to bridge scope (if const NitroConfig is used)
        if (!cfg && document.body) {
            try {
                if (!document.getElementById('nitro-config-bridge')) {
                    const s = document.createElement('script');
                    s.id = 'nitro-config-bridge';
                    s.textContent = 'try { if(typeof NitroConfig !== "undefined") window._exportedNitroConfig = NitroConfig; } catch(e){}';
                    document.body.appendChild(s);
                }
                cfg = win._exportedNitroConfig;
            } catch (e) { }
        }

        if (cfg) {
            if (!AppState.isFurniLoaded) log.info('NitroConfig detected!', cfg);
            try {
                AppState.socketUrl = cfg['socket.url'];
                AppState.furniDataUrl = cfg['furnidata.url'];
                AppState.assetUrl = cfg['asset.url']; // Capture asset.url
                const urlPrefix = cfg['url.prefix'];
                if (urlPrefix) {
                    try { AppState.serverName = new URL(urlPrefix).hostname; } catch (e) { AppState.serverName = window.location.hostname; }
                } else { AppState.serverName = window.location.hostname; }
                loadHeaders();
                return true;
            } catch (e) { log.error('Error parsing NitroConfig', e); return false; }
        }
        return false;
    }

    function loadHeaders() {
        const key = HEADER_STORAGE_KEY_PREFIX + AppState.serverName;
        const saved = GM_getValue(key);
        if (saved) {
            AppState.headers = { ...AppState.headers, ...saved };
            log.info(`Loaded headers for ${AppState.serverName}:`, AppState.headers);
            updateUI();
        }
    }

    function saveHeaders() {
        const key = HEADER_STORAGE_KEY_PREFIX + AppState.serverName;
        GM_setValue(key, AppState.headers);
        log.info('Headers saved.');
    }

    // ─────────────────────────────────────────────────────────────────
    // WebSocket Hook
    // ─────────────────────────────────────────────────────────────────
    const NitroPacketHook = {
        _listeners: { incoming: [], outgoing: [] },

        init() {
            const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            const NativeWebSocket = win.WebSocket;

            // Proxy WebSocket
            win.WebSocket = function (url, protocols) {
                const ws = new NativeWebSocket(url, protocols);
                log.info(`WebSocket created to ${url}`);

                // Hook incoming messages
                ws.addEventListener('message', (event) => {
                    NitroPacketHook._handleIncoming(event.data);
                });

                // Hook outgoing messages
                const originalSend = ws.send;
                ws.send = function (data) {
                    NitroPacketHook._handleOutgoing(data);
                    return originalSend.apply(this, arguments);
                };

                return ws;
            };

            // Should copy prototype to ensure instanceof checks pass?
            // Usually not strictly required for simple apps but good practice
            win.WebSocket.prototype = NativeWebSocket.prototype;
            win.WebSocket.CONNECTING = NativeWebSocket.CONNECTING;
            win.WebSocket.OPEN = NativeWebSocket.OPEN;
            win.WebSocket.CLOSING = NativeWebSocket.CLOSING;
            win.WebSocket.CLOSED = NativeWebSocket.CLOSED;
        },

        _handleIncoming(data) {
            // Nitro packets are ArrayBuffer/Blob
            if (data instanceof ArrayBuffer) {
                this._processPacket(data, 'incoming');
            } else if (data instanceof Blob) {
                // Read blob if necessary, but usually Nitro uses ArrayBuffer binary type
                const reader = new FileReader();
                reader.onload = () => this._processPacket(reader.result, 'incoming');
                reader.readAsArrayBuffer(data);
            }
        },

        _handleOutgoing(data) {
            if (data instanceof ArrayBuffer) {
                this._processPacket(data, 'outgoing');
            }
        },

        _processPacket(buffer, direction) {
            try {
                const view = new DataView(buffer);
                if (buffer.byteLength < 6) return; // Too short

                // Header is at offset 4 (after 4-byte length), big-endian short
                const len = view.getInt32(0);
                const header = view.getInt16(4);

                // Dispatch
                this._listeners[direction].forEach(cb => cb(header, buffer));

                // Process Discovery
                if (direction === 'incoming') {
                    PacketDiscovery.analyze(header, buffer);
                }

                // Process Capture
                if (direction === 'incoming') {
                    RoomCapture.handlePacket(header, buffer);
                }

            } catch (e) {
                // silent fail for non-nitro packets
            }
        },

        onIncoming(callback) { this._listeners.incoming.push(callback); },
        onOutgoing(callback) { this._listeners.outgoing.push(callback); }
    };

    // ─────────────────────────────────────────────────────────────────
    // Packet Discovery Logic
    // ─────────────────────────────────────────────────────────────────
    const PacketDiscovery = {
        analyze(header, buffer) {
            const size = buffer.byteLength;

            // Log to history
            if (AppState.discoveryMode) {
                const timestamp = new Date().toLocaleTimeString();
                AppState.packetHistory.unshift({ timestamp, header, size });
                if (AppState.packetHistory.length > AppState.maxHistory) AppState.packetHistory.pop();

                // Heuristics
                this._checkHeuristics(header, buffer);

                updatePacketList();
            }
        },

        _checkHeuristics(header, buffer) {
            const size = buffer.byteLength;
            const view = new DataView(buffer);
            let offset = 6; // header+len

            // RoomModel Heuristic (Size usually small-ish, but contains string with CRLF)
            // 1301 format: bool, int, string
            if (size > 15 && size < 5000) {
                try {
                    offset = 6;
                    // bool (1 byte)
                    offset++;
                    // int (wall height)
                    offset += 4;
                    // string (map)
                    if (offset + 2 < size) {
                        const len = view.getInt16(offset);
                        if (len > 5 && (offset + 2 + len) <= size) {
                            // Check for newlines in the string without full decode
                            // Or just assume if it matches this struct it might be it
                            // Let's decode a bit
                            const strStart = offset + 2;
                            const strBytes = new Uint8Array(buffer, strStart, Math.min(len, 20));
                            const txt = new TextDecoder().decode(strBytes);
                            if (txt.includes('x') || txt.includes('0')) {
                                this._suggest(header, 'RoomModel?', 'Contains potential heightmap data');
                            }
                        }
                    }
                } catch (e) { }
            }

            // WallItems Heuristic
            // Structure: int(owners), loop, int(count), loop(string, int, string, string, int, int)
            // We can check if it parses cleaner as wall items
        },

        _suggest(header, label, reason) {
            const existing = AppState.packetHistory.find(p => p.header === header);
            if (existing) existing.notes = `${label} (${reason})`;
            // Update last log entry if it matches
            if (AppState.packetHistory[0] && AppState.packetHistory[0].header === header) {
                updatePacketList();
            }
        }
    };

    // ─────────────────────────────────────────────────────────────────
    // Room Data Capture
    // ─────────────────────────────────────────────────────────────────
    const RoomCapture = {
        _floorItems: [],
        _wallItems: [],
        _roomModel: null,

        handlePacket(header, buffer) {
            // Only process if we have mapped this header
            if (header === parseInt(AppState.headers.RoomFloorItems)) {
                this._parseFloorItems(buffer);
            } else if (header === parseInt(AppState.headers.RoomWallItems)) {
                this._parseWallItems(buffer);
            } else if (header === parseInt(AppState.headers.RoomModel)) {
                this._parseRoomModel(buffer);
            }
        },

        _bufferToHex(buffer) { return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '); },

        // Adapted from Roomilus - assumes standard Nitro/Arcturus structure
        _parseFloorItems(buffer) {
            // Save raw payload for debug
            this._lastRawFloorPayload = Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');

            const view = new DataView(buffer);
            let offset = 6; // Skip len(4) + header(2)

            const readInt = () => { if (offset + 4 > buffer.byteLength) throw new Error('O'); const v = view.getInt32(offset); offset += 4; return v; };
            const readString = () => { const len = view.getInt16(offset); offset += 2; const str = new TextDecoder().decode(new Uint8Array(buffer, offset, len)); offset += len; return str; };

            try {
                const ownerCount = readInt(); // Owners
                for (let i = 0; i < ownerCount; i++) { readInt(); readString(); }

                const itemCount = readInt();
                const newItems = [];

                for (let i = 0; i < itemCount; i++) {
                    try {
                        const item = {
                            id: readInt(),
                            spriteId: readInt(),
                            x: readInt(),
                            y: readInt(),
                            rotation: readInt(),
                            z: parseFloat(readString())
                        };

                        // Sync logic skip: Look for -1 ending the data block for this item
                        // This is tricky without perfect knowledge, but standard loop works for Roomilus
                        // We do a naive scan for next item or end

                        const startExtra = offset;
                        let syncFound = false;
                        const limit = Math.min(buffer.byteLength - 8, offset + 256);

                        // We need to advance offset past extra data
                        // NOTE: This parsing is FRAGILE if servers change packet structure slightly
                        // For now we assume Arcturus/Nitro standard
                        while (offset <= limit) {
                            if (view.getInt32(offset) === -1) {
                                // Found sentinel
                                if (offset > startExtra) {
                                    // Store raw extra data as hex string for saving state
                                    const extraBytes = new Uint8Array(buffer.slice(startExtra, offset));
                                    item.stuffData = Array.from(extraBytes).map(b => b.toString(16).padStart(2, '0')).join('');
                                }

                                item.type = view.getInt32(offset + 4);
                                offset += 8;
                                item.ownerId = readInt();
                                syncFound = true;
                                break;
                            }
                            offset++;
                        }

                        if (syncFound) {
                            // Enrich with name if possible
                            if (AppState.isFurniLoaded && AppState.furnitureData.has(item.spriteId)) {
                                item.name = AppState.furnitureData.get(item.spriteId).name;
                            }
                            newItems.push(item);
                        }
                    } catch (e) { break; }
                }

                if (newItems.length > 0) {
                    this._floorItems = newItems;
                    log.info(`Captured ${newItems.length} floor items!`);
                    updateUIConfig();
                }

            } catch (e) {
                log.error('Error parsing floor items', e);
            }
        },

        _parseWallItems(buffer) {
            const view = new DataView(buffer);
            let offset = 6;

            const readInt = () => { if (offset + 4 > buffer.byteLength) throw new Error('O'); const v = view.getInt32(offset); offset += 4; return v; };
            const readString = () => { const len = view.getInt16(offset); offset += 2; const str = new TextDecoder().decode(new Uint8Array(buffer, offset, len)); offset += len; return str; };

            try {
                const ownerCount = readInt();
                for (let i = 0; i < ownerCount; i++) { readInt(); readString(); }

                const itemCount = readInt();
                const newItems = [];

                for (let i = 0; i < itemCount; i++) {
                    try {
                        // id(str), sprite(int), pos(str), extra(str), type(int), owner(int)
                        const id = readString();
                        const spriteId = readInt();
                        const pos = readString();
                        const extra = readString();
                        const type = readInt();
                        const ownerId = readInt();

                        const item = { id, spriteId, pos, extra, type, ownerId };

                        if (AppState.isFurniLoaded && AppState.furnitureData.has(spriteId)) {
                            item.name = AppState.furnitureData.get(spriteId).name;
                        }
                        newItems.push(item);
                    } catch (e) { break; }
                }

                if (newItems.length > 0) {
                    this._wallItems = newItems;
                    log.info(`Captured ${newItems.length} wall items!`);
                    updateUIConfig();
                }
            } catch (e) { log.error('Error parsing wall items', e); }
        },

        _parseRoomModel(buffer) {
            const view = new DataView(buffer);
            let offset = 6;
            const readInt = () => { const v = view.getInt32(offset); offset += 4; return v; };
            const readString = () => { const len = view.getInt16(offset); offset += 2; const str = new TextDecoder().decode(new Uint8Array(buffer, offset, len)); offset += len; return str; };

            try {
                // bool, int, string
                offset++; // skip bool
                const wallHeight = readInt();
                const map = readString();

                this._roomModel = { wallHeight, map };
                log.info(`Captured RoomModel: h=${wallHeight}`);
                updateUIConfig();
            } catch (e) { log.error('RoomModel parse error', e); }
        },

        exportBlueprint() {
            if (this._floorItems.length === 0 && this._wallItems.length === 0) {
                alert('No room data captured yet. Please enter a room.');
                return;
            }

            // Re-enrich items before export to handle late-loaded furniture data
            if (AppState.isFurniLoaded) {
                const enrich = (item) => {
                    if (!item.name && AppState.furnitureData.has(item.spriteId)) {
                        item.name = AppState.furnitureData.get(item.spriteId).name;
                    }
                };
                this._floorItems.forEach(enrich);
                this._wallItems.forEach(enrich);
            }

            const date = new Date();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const dateStr = `${month}-${day}`;

            // Remove 'www.' prefix if present
            const cleanUrl = AppState.serverName.replace(/^www\./, '');

            const blueprint = {
                version: '1.2',
                serverOrigin: AppState.serverName,
                // serverAssetUrl is helpful for potential future features where we might want 
                // to load images or icons directly from the source server for previews.
                serverAssetUrl: AppState.assetUrl || (window.NitroConfig ? window.NitroConfig['asset.url'] : ''),
                exportedAt: new Date().toISOString(),
                roomName: this.roomName || document.title || 'Unknown Room',
                debugPayload: RoomCapture._lastRawFloorPayload || 'No payload captured',
                floorItems: this._floorItems,
                wallItems: this._wallItems,
                roomModel: this._roomModel
            };

            const json = JSON.stringify(blueprint, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            // Requested format: "blueprint_url_month-day.json"
            a.download = `blueprint_${cleanUrl}_${dateStr}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    // ─────────────────────────────────────────────────────────────────
    // Furniture Data Loading
    // ─────────────────────────────────────────────────────────────────
    async function loadFurnitureData() {
        if (!AppState.furniDataUrl) {
            log.warn('No furniDataUrl available, cannot load furniture data');
            return;
        }
        try {
            log.info(`Loading FurnitureData from: ${AppState.furniDataUrl}`);
            const res = await fetch(AppState.furniDataUrl);
            const json = await res.json();

            const process = (list, type) => {
                if (!list) return;
                list.forEach(item => {
                    const id = parseInt(item.id);
                    // Use spriteid/spriteId if available, otherwise fall back to id
                    const spriteId = parseInt(item.spriteid || item.spriteId || id);
                    const name = item.classname || item.name || 'unknown';
                    const data = { id, spriteId, name, type };

                    // Index by BOTH id and spriteId for flexible lookups
                    AppState.furnitureData.set(id, data);
                    if (spriteId !== id) {
                        AppState.furnitureData.set(spriteId, data);
                    }
                });
            };

            process(json.roomitemtypes?.furnitype, 'floor');
            process(json.wallitemtypes?.furnitype, 'wall');

            AppState.isFurniLoaded = true;
            log.info(`Loaded furniture data: ${AppState.furnitureData.size} entries`);
        } catch (e) {
            log.error('Failed to load furniture data', e);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // UI
    // ─────────────────────────────────────────────────────────────────
    let uiRoot = null;
    let uiPanel = null;
    let uiPacketList = null;

    function initUI() {
        // Floating Button
        const btn = document.createElement('div');
        Object.assign(btn.style, {
            position: 'fixed', bottom: '20px', right: '20px', width: '50px', height: '50px',
            background: '#00bcd4', borderRadius: '50%', cursor: 'pointer', zIndex: '999999',
            boxShadow: '0 4px 8px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 'bold', fontSize: '24px'
        });
        btn.textContent = '📦';
        btn.title = 'Nitro Room Exporter';
        btn.onclick = togglePanel;
        document.body.appendChild(btn);

        // Panel
        uiPanel = document.createElement('div');
        Object.assign(uiPanel.style, {
            position: 'fixed', bottom: '80px', right: '20px', width: '350px',
            background: '#263238', color: '#eceff1', borderRadius: '8px', zIndex: '999999',
            boxShadow: '0 8px 16px rgba(0,0,0,0.4)', padding: '16px', display: 'none',
            fontFamily: 'Segoe UI, sans-serif', fontSize: '13px'
        });

        document.body.appendChild(uiPanel);

        // Inner HTML
        renderPanelContent();
    }

    function togglePanel() {
        uiPanel.style.display = uiPanel.style.display === 'none' ? 'block' : 'none';
        updateUI();
    }

    function renderPanelContent() {
        if (!uiPanel) return;

        uiPanel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #37474f; padding-bottom:8px;">
                <h3 style="margin:0; font-size:16px; color:#00bcd4;">Nitro Exporter</h3>
                <span style="font-size:11px; opacity:0.7;">${AppState.serverName}</span>
            </div>

            <!-- Configuration Section -->
            <div style="margin-bottom:16px;">
                <h4 style="margin:0 0 8px 0; font-size:12px; text-transform:uppercase; color:#b0bec5;">Packet Headers</h4>
                
                ${renderHeaderInput('Floor Items', 'RoomFloorItems')}
                ${renderHeaderInput('Wall Items', 'RoomWallItems')}
                ${renderHeaderInput('Room Model', 'RoomModel')}
                
                <button id="nt_save_headers" style="width:100%; margin-top:8px; padding:6px; background:#546e7a; color:white; border:none; border-radius:4px; cursor:pointer;">Save Headers</button>
            </div>

            <!-- Discovery Section -->
            <div style="margin-bottom:16px; background:#37474f; padding:8px; border-radius:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <label style="cursor:pointer; display:flex; align-items:center;">
                        <input type="checkbox" id="nt_discovery_toggle" ${AppState.discoveryMode ? 'checked' : ''}>
                        <span style="margin-left:6px; font-weight:bold;">Discovery Mode</span>
                    </label>
                    <button id="nt_clear_log" style="font-size:10px; padding:2px 6px; background:transparent; border:1px solid #78909c; color:#cfd8dc; cursor:pointer; border-radius:3px;">Clear</button>
                </div>
                <div id="nt_packet_log" style="height:120px; overflow-y:auto; font-family:monospace; font-size:11px; color:#cfd8dc; border-top:1px solid #546e7a; padding-top:4px;">
                    <div style="text-align:center; padding:10px; opacity:0.5;">Packets will appear here...</div>
                </div>
                <div style="font-size:10px; color:#90a4ae; margin-top:4px;">Tip: Enter a room to find large packets</div>
            </div>

            <!-- Actions -->
            <div style="display:flex; gap:8px;">
                <button id="nt_export_btn" style="flex:1; padding:10px; background:#00bcd4; color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">Export Blueprint</button>
            </div>
            
            <div id="nt_status" style="margin-top:8px; text-align:center; font-size:11px; color:#80cbc4;"></div>
        `;

        // Bind Events
        document.getElementById('nt_save_headers').onclick = () => {
            AppState.headers.RoomFloorItems = document.getElementById('inp_RoomFloorItems').value;
            AppState.headers.RoomWallItems = document.getElementById('inp_RoomWallItems').value;
            AppState.headers.RoomModel = document.getElementById('inp_RoomModel').value;
            saveHeaders();
            document.getElementById('nt_status').textContent = 'Headers saved!';
            setTimeout(() => document.getElementById('nt_status').textContent = '', 2000);
        };

        document.getElementById('nt_discovery_toggle').onchange = (e) => {
            AppState.discoveryMode = e.target.checked;
        };

        document.getElementById('nt_clear_log').onclick = () => {
            AppState.packetHistory = [];
            updatePacketList();
        };

        document.getElementById('nt_export_btn').onclick = () => {
            RoomCapture.exportBlueprint();
        };
    }

    function renderHeaderInput(label, key) {
        const val = AppState.headers[key] || '';
        return `
            <div style="display:flex; align-items:center; margin-bottom:6px;">
                <span style="flex:1; font-size:12px;">${label}:</span>
                <input type="number" id="inp_${key}" value="${val}" placeholder="ID" style="width:80px; padding:4px; background:#263238; border:1px solid #546e7a; color:white; border-radius:4px;">
            </div>
        `;
    }

    function updateUI() {
        if (!uiPanel) return;
        // Update input values if changed externally
        if (document.getElementById('inp_RoomFloorItems')) {
            document.getElementById('inp_RoomFloorItems').value = AppState.headers.RoomFloorItems || '';
            document.getElementById('inp_RoomWallItems').value = AppState.headers.RoomWallItems || '';
            document.getElementById('inp_RoomModel').value = AppState.headers.RoomModel || '';
        }
    }

    function updateUIConfig() {
        if (document.getElementById('nt_status')) {
            document.getElementById('nt_status').textContent = `Items Captured: ${RoomCapture._floorItems.length}`;
        }
    }

    function updatePacketList() {
        const list = document.getElementById('nt_packet_log');
        if (!list) return;

        list.innerHTML = AppState.packetHistory.map(p => {
            let note = '';
            // Simple suggestion logic
            if (p.size > 1000) note = ' <span style="color:#ffeb3b">★ Large</span>';

            return `<div style="padding:2px 0; border-bottom:1px solid #37474f;">
                <span style="color:#90a4ae">[${p.timestamp}]</span> 
                <span style="color:#80cbc4; font-weight:bold;">ID: ${p.header}</span> 
                <span style="opacity:0.7">(${p.size}b)</span>${note} ${p.notes ? `<br><span style="color:#ce93d8; font-size:10px;">${p.notes}</span>` : ''}
             </div>`;
        }).join('');
    }


    // ─────────────────────────────────────────────────────────────────
    // Bootstrap
    // ─────────────────────────────────────────────────────────────────
    function init() {
        log.info('Initializing...');

        // 1. Hook WebSocket immediately (document-start)
        NitroPacketHook.init();

        // 2. Try to detect NitroConfig, but force UI eventually
        let attempts = 0;
        const checkConfig = setInterval(() => {
            attempts++;
            if (detectNitro()) {
                clearInterval(checkConfig);
                log.info('NitroConfig found after ' + attempts + ' attempts');
                initUI();
                loadFurnitureData();
            } else if (attempts > 20) { // ~10 seconds timeout
                clearInterval(checkConfig);
                log.warn('NitroConfig not detected after 10s. Forcing UI with defaults.');
                // Default to hostname if possible
                try { AppState.serverName = window.location.hostname; } catch (e) { }
                loadHeaders();
                initUI();
            }
        }, 500);
    }

    init();

})();
