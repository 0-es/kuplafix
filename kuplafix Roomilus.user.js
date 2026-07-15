// ==UserScript==
// @name         kuplafix Roomilus
// @namespace    kuplafix-roomilus
// @version      0.1.7
// @description  Room blueprint export/import tool for kuplahotelli - Requires kuplafix
// @author       res
// @match        *://kuplahotelli.com/game/nitro*
// @noframes
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window.self) return;

    const SCRIPT_NAME = 'Roomilus';
    const SCRIPT_VERSION = '0.1.7';
    const CONFIG_KEY = 'roomilus_config';

    const INCOMING = {
        RoomFloorItems: 1778,
        RoomWallItems: 2455,
        AddFloorItem: 1534,
        AddHabboItem: 2103,
        InventoryItems: 994,
        RoomModel: 1301,
        RoomHeightmap: 2753,
        CatalogPageOffer: 3388, // New
    };

    const OUTGOING = {
        PlaceItem: 1258,
        SetStackHeight: 3839,
        CatalogBuyItem: 3492,
        MoveFloorItem: 248,
        PickupItem: 3456,
        RequestRoom: 2312,
        RequestInventory: 3150,
        UpdateFloorProperties: 875,
        GetProductOffer: 2594, // New
        ToggleItem: 99,
        Chat: 1314,
    };

    const log = {
        info: (...args) => console.log(`[${SCRIPT_NAME}]`, ...args),
        warn: (...args) => console.warn(`[${SCRIPT_NAME}]`, ...args),
        error: (...args) => console.error(`[${SCRIPT_NAME}]`, ...args),
        debug: (...args) => console.debug(`[${SCRIPT_NAME}]`, ...args),
    };

    log.info(`v${SCRIPT_VERSION} loading...`);

    const KuplafixBridge = {
        _ready: false,
        _listeners: [],
        get _api() { return (typeof unsafeWindow !== 'undefined' ? unsafeWindow.kuplafix : window.kuplafix); },
        get _pm() { return this._api?.packets; },
        get types() { return this._pm?.types || { Short: v => ({ type: 'Short', value: v }), Int: v => ({ type: 'Int', value: v }), Byte: v => ({ type: 'Byte', value: v }), String: v => ({ type: 'String', value: v }) }; },
        async waitForReady(timeout = 30000) {
            if (this._ready) return true;
            return new Promise((resolve) => {
                const startTime = Date.now();
                const check = () => {
                    const pm = this._pm;
                    if (pm && pm.socket) {
                        this._ready = true;
                        log.info('✓ Connected to kuplafix');
                        resolve(true);
                        return;
                    }
                    if (Date.now() - startTime > timeout) {
                        log.error('Timeout waiting for kuplafix.');
                        resolve(false);
                        return;
                    }
                    setTimeout(check, 100);
                };
                check();
            });
        },
        onIncoming(header, callback) {
            if (!this._ready) return () => { };
            const unsubscribe = this._pm.onIncoming(header, callback);
            this._listeners.push(unsubscribe);
            return unsubscribe;
        },
        onOutgoing(header, callback) {
            if (!this._ready) return () => { };
            const unsubscribe = this._pm.onOutgoing(header, callback);
            this._listeners.push(unsubscribe);
            return unsubscribe;
        },
        send(header, ...args) {
            if (!this._ready) return false;
            this._pm.send(header, ...args);
            return true;
        },
        showToast(message, type = 'info') {
            const ui = this._api?.ui || this._api?.UI;
            if (ui && ui.showToast) ui.showToast(message, type);
            else log.info(`[Toast] ${message}`);
        },
    };

    const defaultConfig = { blueprints: {}, ignoreFloorplan: false, applyBlueprintFloorplan: false, useStacktileForAll: false, placementSpeed: 150, highZMode: false };
    const config = {
        data: { ...defaultConfig, forceSpriteId: false },
        load() {
            try {
                const saved = GM_getValue(CONFIG_KEY);
                if (saved && typeof saved === 'object') this.data = { ...defaultConfig, ...saved };
            } catch (e) { log.warn('Failed to load config:', e); }
        },
        save() {
            try { GM_setValue(CONFIG_KEY, this.data); } catch (e) { log.warn('Failed to save config:', e); }
        },
        get(key) { return this.data[key]; },
        set(key, value) { this.data[key] = value; this.save(); },
    };

    const BlueprintStorage = {
        save(name, blueprint) {
            const blueprints = config.get('blueprints') || {};
            blueprints[name] = { ...blueprint, savedAt: new Date().toISOString() };
            config.set('blueprints', blueprints);
            return true;
        },
        load(name) {
            const blueprints = config.get('blueprints') || {};
            return blueprints[name] || null;
        },
        list() {
            const blueprints = config.get('blueprints') || {};
            return Object.keys(blueprints).map((name) => ({
                name,
                savedAt: blueprints[name].savedAt,
                serverOrigin: blueprints[name].serverOrigin,
                itemCount: (blueprints[name].floorItems?.length || 0) + (blueprints[name].wallItems?.length || 0),
            }));
        },
        delete(name) {
            const blueprints = config.get('blueprints') || {};
            if (blueprints[name]) {
                delete blueprints[name];
                config.set('blueprints', blueprints);
                return true;
            }
            return false;
        },
        exportToFile(name) {
            const blueprint = this.load(name);
            if (!blueprint) return false;
            const json = JSON.stringify(blueprint, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${name.replace(/[^a-z0-9]/gi, '_')}_blueprint.json`;
            a.click();
            URL.revokeObjectURL(url);
            return true;
        },
        importFromFile(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const blueprint = JSON.parse(e.target.result);
                        if (!blueprint.version || !blueprint.floorItems) throw new Error('Invalid blueprint');
                        resolve(blueprint);
                    } catch (err) { reject(err); }
                };
                reader.readAsText(file);
            });
        },
        convertForKupla(blueprint) {
            if (!blueprint) return null;
            if (!FurnitureDataManager._loaded) {
                log.warn('FurnitureData not loaded, cannot convert IDs');
                return blueprint;
            }

            let converted = 0;
            let failed = 0;
            const failedNames = [];

            const convertItem = (item) => {
                if (!item.name) {
                    // No name to map, keep original ID
                    return;
                }
                const kuplaData = FurnitureDataManager.getByName(item.name);
                if (kuplaData) {
                    const oldId = item.spriteId;
                    item.spriteId = kuplaData.spriteId;
                    item._originalSpriteId = oldId;
                    item._converted = true;
                    converted++;
                } else {
                    failed++;
                    if (!failedNames.includes(item.name)) failedNames.push(item.name);
                }
            };

            if (blueprint.floorItems) blueprint.floorItems.forEach(convertItem);
            if (blueprint.wallItems) blueprint.wallItems.forEach(convertItem);

            blueprint._conversionStats = { converted, failed, failedNames };
            log.info(`Blueprint conversion: ${converted} items mapped, ${failed} failed`);
            if (failedNames.length > 0) {
                log.warn(`Unmapped items: ${failedNames.slice(0, 10).join(', ')}${failedNames.length > 10 ? '...' : ''}`);
            }

            return blueprint;
        },
    };

    const FurnitureDataManager = {
        _data: new Map(),
        _nameIndex: new Map(), // classname -> spriteId
        _learnedOffers: new Map(), // spriteId -> offerId
        _loaded: false,
        async load() {
            if (this._loaded) return;
            const urls = ['/nitro-assets/gamedata/FurnitureData.json', '/gamedata/FurnitureData.json', 'https://kuplahotelli.com/nitro-assets/gamedata/FurnitureData.json'];
            for (const url of urls) {
                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const json = await response.json();
                    this._parse(json);
                    this._loaded = true;
                    log.info(`FurnitureData loaded: ${this._data.size} items`);
                    return;
                } catch (e) { }
            }
            log.warn('Could not load FurnitureData.');
        },
        _parse(json) {
            this._data.clear();
            this._nameIndex.clear();
            const process = (list, type) => {
                if (!list || !list.furnitype) return;
                list.furnitype.forEach((item) => {
                    const id = parseInt(item.id);
                    const sId = parseInt(item.spriteid || item.spriteId || id);
                    const offerId = (item.offerid && parseInt(item.offerid) > 0) ? parseInt(item.offerid) : sId;
                    const name = item.classname || item.name || 'Unknown';
                    const publicName = item.name || item.classname || name;
                    const data = { id, spriteId: sId, offerId, name, publicName, type };
                    // Store by both ID and SpriteID for lookup flexibility
                    this._data.set(id, data);
                    this._data.set(sId, data);
                    // Store by name for cross-server mapping
                    if (name && name !== 'Unknown') {
                        this._nameIndex.set(name.toLowerCase(), data);
                    }
                });
            };
            process(json.roomitemtypes, 'floor');
            process(json.wallitemtypes, 'wall');
        },
        get(spriteId) {
            const data = this._data.get(parseInt(spriteId));
            if (data && this._learnedOffers.has(data.spriteId)) {
                return { ...data, offerId: this._learnedOffers.get(data.spriteId) };
            }
            return data;
        },
        learnOffer(spriteId, offerId) {
            this._learnedOffers.set(parseInt(spriteId), parseInt(offerId));
            log.info(`Learned offer: Sprite ${spriteId} -> Offer ${offerId}`);
        },
        getByName(name) {
            if (!name) return null;
            return this._nameIndex.get(name.toLowerCase()) || null;
        },
    };

    const CatalogCatcher = {
        init() {
            KuplafixBridge.onIncoming(INCOMING.CatalogPageOffer, (header, buffer, args) => {
                // Packet 3388 (CatalogSearchResultComposer):
                // The first Int in the body is the catalog item ID (offerId)
                // Parse raw buffer to avoid kuplafix's auto-parsing issues with large numbers
                if (!buffer) return;

                try {
                    const view = new DataView(buffer);
                    let offset = 0;

                    // Skip packet length (4 bytes) + header (2 bytes) if present
                    if (buffer.byteLength >= 6 && view.getInt16(4) === header) {
                        offset = 6;
                    }

                    // Read first Int32 (big-endian) - this is the catalog item ID
                    if (offset + 4 <= buffer.byteLength) {
                        const offerId = view.getInt32(offset);
                        log.info(`CatalogCatcher: Received offer ID ${offerId} (raw bytes: ${Array.from(new Uint8Array(buffer, offset, 4)).map(b => b.toString(16).padStart(2, '0')).join(' ')})`);
                        AutoPurchaser.onOfferReceived(offerId);
                    }
                } catch (e) {
                    log.debug('CatalogCatcher parse error:', e);
                    // Fallback to args if available
                    if (args && args.length >= 1) {
                        AutoPurchaser.onOfferReceived(args[0].value);
                    }
                }
            });
        }
    };

    const InventoryTracker = {
        _items: new Map(),
        _isRefreshing: false,
        handlePacket(header, buffer) {
            if (!buffer) return;
            try { this._parseBuffer(buffer, header); }
            catch (e) { log.debug('Inventory error:', e); }
        },
        _parseBuffer(buffer, header) {
            const view = new DataView(buffer);
            let offset = 0;
            if (buffer.byteLength >= 6 && view.getInt16(4) === header) offset += 6;

            const readInt = () => { if (offset + 4 > buffer.byteLength) throw new Error('O'); const v = view.getInt32(offset); offset += 4; return v; };
            const readString = () => { if (offset + 2 > buffer.byteLength) throw new Error('O'); const len = view.getInt16(offset); offset += 2; if (offset + len > buffer.byteLength) throw new Error('O'); const str = new TextDecoder().decode(new Uint8Array(buffer, offset, len)); offset += len; return str; };

            try {
                if (header === 994) {
                    readInt(); // segments
                    const currentFragment = readInt();
                    const itemCount = readInt();
                    if (currentFragment === 0) { this._items.clear(); log.debug('Inventory clear'); }

                    for (let i = 0; i < itemCount; i++) {
                        try {
                            readInt(); const type = readString(); const itemId = readInt(); const spriteId = readInt();
                            if (type === 'S' || type === 'I') {
                                this._addItem(spriteId, itemId);
                                let syncFound = false;
                                const limit = offset + 512;
                                while (offset <= buffer.byteLength - 13 && offset < limit) {
                                    if (view.getUint8(offset) <= 1 && view.getUint8(offset + 1) <= 1 && view.getUint8(offset + 2) <= 1 && view.getUint8(offset + 3) <= 1 && view.getInt32(offset + 4) === -1 && view.getUint8(offset + 8) <= 1 && view.getInt32(offset + 9) === -1) {
                                        offset += 13; if (type === 'S') { readString(); readInt(); }
                                        syncFound = true; break;
                                    }
                                    offset++;
                                }
                                if (!syncFound) break;
                            } else break;
                        } catch (e) { break; }
                    }
                }
            } catch (e) { }
        },
        _addItem(spriteId, itemId) {
            const sId = parseInt(spriteId);
            if (!isNaN(sId)) { if (!this._items.has(sId)) this._items.set(sId, new Set()); this._items.get(sId).add(itemId); }
        },
        getCount(spriteId) { const set = this._items.get(parseInt(spriteId)); return set ? set.size : 0; },
        popItem(spriteId) {
            const set = this._items.get(parseInt(spriteId));
            if (!set || set.size === 0) return null;
            const val = set.values().next().value;
            set.delete(val); return val;
        },
        popStackHelper(itemId) {
            for (const [spriteId, set] of this._items) { if (set.has(itemId)) { set.delete(itemId); return itemId; } }
            return null;
        },
        getAllItems() {
            const list = [];
            for (const [spriteId, set] of this._items) {
                list.push({ spriteId, count: set.size });
            }
            return list;
        }
    };

    const StackHelper = {
        _id: null,
        _isDetecting: false,
        _unsubscribe: null,
        get id() { return this._id; },
        init() {
            this._id = config.get('stackHelperId') || null;
            if (this._id) log.info(`StackHelper loaded: ${this._id}`);
        },
        toggleDetection() {
            if (this._isDetecting) this.stopDetection();
            else this.startDetection();
            return this._isDetecting;
        },
        startDetection() {
            this._isDetecting = true;
            this._unsubscribe = KuplafixBridge.onOutgoing(OUTGOING.SetStackHeight, (header, buffer, args) => this._handleStackHeight(args));
            KuplafixBridge.showToast('Use Stack Tile now (Set its height)...', 'info');
        },
        stopDetection() {
            this._isDetecting = false;
            if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
            if (RoomilusUI._renderContent) RoomilusUI._renderContent();
        },
        _handleStackHeight(args) {
            if (!this._isDetecting || !args || !args[0]) return;
            const id = args[0].value;
            if (id) {
                this._id = id;
                config.set('stackHelperId', id);
                KuplafixBridge.showToast(`Stack Helper Identified: ${id}`, 'success');
                this.stopDetection();
            }
        },
        get id() { return this._id; }
    };


    const RoomModelCapturer = {
        _lastModel: null,
        handlePacket(header, buffer) {
            try {
                // Packet 1301 (Incoming): bool, int wallHeight, string heightmap
                const view = new DataView(buffer);
                let offset = 0;
                if (buffer.byteLength >= 6 && view.getInt16(4) === header) offset += 6;
                const readInt = () => { const v = view.getInt32(offset); offset += 4; return v; };
                const readBool = () => { const v = view.getUint8(offset); offset++; return v === 1; };
                const readString = () => { const len = view.getInt16(offset); offset += 2; const str = new TextDecoder().decode(new Uint8Array(buffer, offset, len)); offset += len; return str; };

                readBool(); // custom
                const wallHeight = readInt();
                const map = readString();
                this._lastModel = { wallHeight, map };
                log.info(`Captured Room Model: Wall Height ${wallHeight}`);
            } catch (e) { log.debug('RoomModel capture fail:', e); }
        },
        get model() { return this._lastModel; }
    };

    const RoomCapture = {
        _currentRoom: null,
        _floorItems: [],
        _wallItems: [],
        _lastRawFloorPayload: null,
        _isCapturing: false,
        onChange: null,
        reset() {
            this._floorItems = [];
            this._wallItems = [];
            this._lastRawFloorPayload = null;
            log.debug('RoomCapture: Pools reset for new room');
        },
        startCapture() { this.reset(); this._lastRawFloorPayload = null; this._isCapturing = true; if (this.onChange) this.onChange(); },
        stopCapture() { this._isCapturing = false; if (this.onChange) this.onChange(); this.onChange = null; },
        handleFloorItems(header, buffer, args) {
            if (!this._isCapturing) return;
            try { this._lastRawFloorPayload = this._bufferToHex(buffer); this._parseFloorItemsBuffer(buffer); log.info(`Captured ${this._floorItems.length} floor items`); if (this.onChange) this.onChange(); } catch (e) { log.error('Failed to parse floor items:', e); }
        },
        _bufferToHex(buffer) { return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '); },
        _parseFloorItemsBuffer(buffer) {
            const view = new DataView(buffer);
            let offset = 0;
            if (buffer.byteLength >= 6 && view.getInt16(4) === INCOMING.RoomFloorItems) offset += 6;

            const readInt = () => { if (offset + 4 > buffer.byteLength) throw new Error('Overflow'); const v = view.getInt32(offset); offset += 4; return v; };
            const readString = () => { const len = view.getInt16(offset); offset += 2; const str = new TextDecoder().decode(new Uint8Array(buffer, offset, len)); offset += len; return str; };

            try {
                // Capture Raw Payload for debugging
                this._lastRawFloorPayload = Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');

                const ownerCount = readInt();
                for (let i = 0; i < ownerCount; i++) { readInt(); readString(); }
                const itemCount = readInt();
                for (let i = 0; i < itemCount; i++) {
                    const item = {};
                    try {
                        item.id = readInt();
                        item.spriteId = readInt();
                        item.x = readInt();
                        item.y = readInt();
                        item.rotation = readInt();
                        item.z = parseFloat(readString());

                        // Capture StuffData (Extra Data)
                        // Nitro/Arcturus: [StuffData] usually ends before the -1 (expires) and type
                        // We will capture everything until we hit the -1 sentinel
                        const startExtra = offset;
                        let syncFound = false;
                        const limit = Math.min(buffer.byteLength - 8, offset + 256);

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
                                // Jump to Owner ID (next Int)
                                item.ownerId = readInt();

                                // UNIQUE ID CHECK
                                if (!this._floorItems.find(fi => fi.id === item.id)) {
                                    const info = FurnitureDataManager.get(item.spriteId);
                                    if (info) {
                                        item.name = info.publicName;
                                        item.classname = info.name;
                                    }
                                    this._floorItems.push(item);
                                }
                                syncFound = true;
                                break;
                            }
                            offset++;
                        }
                    } catch (err) { break; }
                }
            } catch (e) { }
        },
        handleWallItems(header, buffer, args) {
            if (!this._isCapturing) return;
            try { this._parseWallItemsBuffer(buffer); if (this.onChange) this.onChange(); } catch (e) { log.error('Wall items capture error:', e); }
        },
        _parseWallItemsBuffer(buffer) {
            const view = new DataView(buffer);
            let offset = 0;
            if (buffer.byteLength >= 6 && view.getInt16(4) === INCOMING.RoomWallItems) offset += 6;

            const readInt = () => { if (offset + 4 > buffer.byteLength) throw new Error('Overflow'); const v = view.getInt32(offset); offset += 4; return v; };
            const readString = () => { const len = view.getInt16(offset); offset += 2; const str = new TextDecoder().decode(new Uint8Array(buffer, offset, len)); offset += len; return str; };

            try {
                const ownerCount = readInt();
                for (let i = 0; i < ownerCount; i++) { readInt(); readString(); }
                const itemCount = readInt();
                for (let i = 0; i < itemCount; i++) {
                    try {
                        const item = {
                            id: readString(),
                            spriteId: readInt(),
                            pos: readString(),
                            extra: readString(),
                            type: readInt(),
                            ownerId: readInt()
                        };
                        if (!this._wallItems.find(wi => wi.id === item.id)) {
                            const info = FurnitureDataManager.get(item.spriteId);
                            if (info) {
                                item.name = info.publicName;
                                item.classname = info.name;
                            }
                            this._wallItems.push(item);
                        }
                    } catch (err) { break; }
                }
            } catch (e) { }
        },
        getBlueprint(roomName = 'Unnamed Room') { return { version: '1.2', exportedAt: new Date().toISOString(), roomName, roomModel: RoomModelCapturer.model, debugPayload: this._lastRawFloorPayload || 'No payload', floorItems: [...this._floorItems], wallItems: [...this._wallItems] }; },
        get floorItemCount() { return this._floorItems.length; },
        get wallItemCount() { return this._wallItems.length; },
    };



    const PlacementController = {
        _queue: [],
        _isPlacing: false,
        _timer: null,
        _placed: 0,
        _currentBlueprint: null,
        _pendingState: new Map(), // x_y -> { state: int, attempts: int }
        manualPriority: new Set(), // Set of spriteIds manually prioritized by user
        _unsubscribe: null,

        _findSmartDoorPosition(mapString) {
            // Find a valid '0' height tile for the door
            if (!mapString) return { x: 4, y: 7 }; // Default fallback

            const rows = mapString.split('\r');
            for (let y = 0; y < rows.length; y++) {
                const row = rows[y];
                for (let x = 0; x < row.length; x++) {
                    // Check if char is '0' (numeric 0, standard floor height)
                    if (row[x] === '0') {
                        return { x, y };
                    }
                }
            }
            return { x: 4, y: 7 }; // Fallback if no 0 height found
        },

        async start(blueprint) {
            if (this._isPlacing) return;
            if (!blueprint) return;
            this._currentBlueprint = blueprint;
            this._pendingState.clear();

            // Listen for placed items to apply state
            this._unsubscribe = KuplafixBridge.onIncoming(INCOMING.AddFloorItem, (header, buffer) => {
                this._handleItemAdded(buffer);
            });

            // 1. Apply Floorplan
            // Calculate a safe position (first 0 height tile or door pos)
            let safePos = { x: 4, y: 7 };
            if (config.get('applyBlueprintFloorplan') && blueprint.roomModel) {
                log.info(`Applying Blueprint Floorplan...`);
                const m = blueprint.roomModel;
                safePos = this._findSmartDoorPosition(m.map);
                log.info(`Smart Door/Safe Position: ${safePos.x}, ${safePos.y}`);
                KuplafixBridge.send(OUTGOING.UpdateFloorProperties, m.map, safePos.x, safePos.y, 2, m.wallHeight, 0, 0);
                await new Promise(r => setTimeout(r, 1000));
            } else if (!config.get('ignoreFloorplan')) {
                log.info(`Applying Huge Placement Map...`);
                // Use default safe pos
                safePos = { x: 4, y: 7 };
                const hugeMap = Array(100).fill('0'.repeat(100)).join('\r');
                KuplafixBridge.send(OUTGOING.UpdateFloorProperties, hugeMap, 4, 7, 2, 0, 0, 0);
                await new Promise(r => setTimeout(r, 1000));
            }
            KuplafixBridge.send(OUTGOING.RequestInventory, '');
            log.info('Refreshing inventory (3150)... Wait 2s for fragments.');
            await new Promise(r => setTimeout(r, 2000)); // Longer wait for fragments

            this._queue = [];
            this._placed = 0;
            const stackHelperId = StackHelper.id;

            // Ensure Stack Helper is in room/placed SAFELY
            if (stackHelperId) {
                const helperInvId = InventoryTracker.popStackHelper(stackHelperId);
                if (helperInvId) {
                    // Not in room? Place it at safe pos
                    log.info(`StackHelper found in inventory. Placing at safe pos ${safePos.x},${safePos.y}.`);
                    KuplafixBridge.send(OUTGOING.PlaceItem, `${helperInvId} ${safePos.x} ${safePos.y} 0`);
                    this._queue.push({ type: 'delay', ms: 500 });
                } else {
                    // Already in room? Move it to safe pos to be sure it's accessible
                    log.info(`StackHelper already in room. Moving to safe pos ${safePos.x},${safePos.y}.`);
                    KuplafixBridge.send(OUTGOING.MoveFloorItem, stackHelperId, safePos.x, safePos.y, 0);
                    this._queue.push({ type: 'delay', ms: 500 });
                }
            }

            if (blueprint.floorItems) {
                // Priority Sorting:
                // 1. MANUAL PRIORITY (User selected) - HIGHEST
                // 2. Then by Z Height (Ascending)
                const sortedItems = [...blueprint.floorItems].sort((a, b) => {
                    // Manual Priority (user clicked in UI)
                    const aManual = this.manualPriority.has(parseInt(a.spriteId));
                    const bManual = this.manualPriority.has(parseInt(b.spriteId));
                    if (aManual && !bManual) return -1;
                    if (!aManual && bManual) return 1;

                    return (a.z || 0) - (b.z || 0);
                });

                sortedItems.forEach(item => {
                    const invItemId = InventoryTracker.popItem(item.spriteId);
                    if (invItemId) {
                        const z = item.z || 0;
                        const isNonInteger = Math.abs(z % 1) > 0.01;

                        const isManualPriority = this.manualPriority.has(parseInt(item.spriteId));

                        // Check if we should use :bh for manually prioritized items
                        const useBhForPriority = isManualPriority && config.get('useBhForPriority') && z > 0;

                        // Force stack helper OFF for manually prioritized items
                        // Otherwise respect config/height
                        const needsHelper = !isManualPriority && stackHelperId && (config.get('useStacktileForAll') || isNonInteger);

                        // Parse State from stuffData
                        let targetState = 0;
                        if (item.stuffData) {
                            try {
                                const hex = item.stuffData;
                                if (hex.length === 2) {
                                    // Single byte int state
                                    targetState = parseInt(hex, 16);
                                    if (isNaN(targetState)) targetState = 0;
                                } else if (hex.length >= 2) {
                                    // Complex data: State is encoded in the LAST 2 hex chars as ASCII
                                    // Example: "...30" = '0' (state 0), "...31" = '1' (state 1)
                                    const lastTwoHex = hex.slice(-2);
                                    const lastByte = parseInt(lastTwoHex, 16);

                                    // Check if it's ASCII '0'-'9' (0x30-0x39)
                                    if (lastByte >= 0x30 && lastByte <= 0x39) {
                                        targetState = lastByte - 0x30; // Convert ASCII to number
                                    }

                                    // Debug logging
                                    log.info(`[State Parse] sprite=${item.spriteId} hex_end="${lastTwoHex}" byte=${lastByte} state=${targetState}`);
                                }
                            } catch (e) {
                                log.warn('State parse error', e);
                            }
                        }

                        // Store pending state apply (key: x_y_spriteId to prevent collision)
                        // Note: Multiple items of SAME sprite at same x,y could still collide, but that's rare
                        if (targetState > 0) {
                            // We don't have the REAL ID yet, we only have x/y/spriteId
                            this._pendingState.set(`${item.x}_${item.y}_${item.spriteId}`, targetState);
                        }

                        if (useBhForPriority) {
                            // Use :bh command - QUEUE IT, don't send immediately
                            this._queue.push({ type: 'chat', message: `:bh ${z}` });
                            this._queue.push({ type: 'floor', itemId: invItemId, x: item.x, y: item.y, rot: item.rotation, z: 0 }); // Z=0 since :bh handles it
                            this._queue.push({ type: 'chat', message: ':bh' }); // Reset BH
                        } else if (needsHelper) {
                            this._queue.push({ type: 'stack_helper_move', id: stackHelperId, x: item.x, y: item.y, rot: 0 });
                            this._queue.push({ type: 'stack_helper_height', id: stackHelperId, height: Math.round(z * 100) });
                            this._queue.push({ type: 'floor', itemId: invItemId, x: item.x, y: item.y, rot: item.rotation, z: z });
                        } else {
                            this._queue.push({ type: 'floor', itemId: invItemId, x: item.x, y: item.y, rot: item.rotation, z: z });
                        }

                        // FIX: Add delay after items with pending state toggles to wait for AddFloorItem response
                        if (targetState > 0) {
                            this._queue.push({ type: 'delay', ms: 100 }); // Wait for server response
                        }
                    }
                });

                if (stackHelperId && this._queue.some(i => i.type === 'stack_helper_move')) {
                    this._queue.push({ type: 'pickup_helper', id: stackHelperId });
                }
            }
            if (this._queue.length > 0) {
                this._isPlacing = true;
                this._totalSteps = this._queue.length;
                const speed = config.get('placementSpeed') || 150;
                this._timer = setInterval(() => this._process(), speed);
                KuplafixBridge.showToast(`Starting placement: ${this._totalSteps} actions...`, 'info');
                RoomilusUI.updatePlacementProgress(0, this._totalSteps);
            } else {
                KuplafixBridge.showToast('No available items found in inventory.', 'error');
            }
        },
        stop() {
            this._isPlacing = false;
            if (this._timer) clearInterval(this._timer);
            this._timer = null;
            if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
        },
        _process() {
            if (!this._isPlacing || this._queue.length === 0) { this._finish(); return; }
            const step = this._queue.shift();
            this._executeStep(step);
            if (step.type === 'floor') {
                this._placed++;
            }
            if (this._placed % 10 === 0 || this._queue.length === 0) {
                RoomilusUI.updatePlacementProgress(this._totalSteps - this._queue.length, this._totalSteps);
            }
        },
        _executeStep(step) {
            try {
                if (step.type === 'delay') {
                    // Start async delay without blocking interval execution context (stop then restart)
                    const oldSub = this._unsubscribe;
                    this._unsubscribe = null; // Detach so stop() doesn't kill it

                    if (this._timer) clearInterval(this._timer);
                    this._timer = null;

                    setTimeout(() => {
                        this._unsubscribe = oldSub; // Reattach
                        this._isPlacing = true;
                        const speed = config.get('placementSpeed') || 150;
                        this._timer = setInterval(() => this._process(), speed);
                    }, step.ms);
                    return;
                }
                if (step.type === 'floor') {
                    // Check Z-Limit
                    if (config.get('highZMode') === true && step.z > 40) {
                        // High Z Logic
                        // 1. Send Chat :bh <z>
                        KuplafixBridge.send(OUTGOING.Chat, `:bh ${step.z}`, 0);
                        // 2. Place at Z=0 (server handles height)
                        const payload = `${step.itemId} ${step.x} ${step.y} ${step.rot}`;
                        KuplafixBridge.send(OUTGOING.PlaceItem, payload);
                    } else {
                        // Normal Place
                        const payload = `${step.itemId} ${step.x} ${step.y} ${step.rot}`;
                        KuplafixBridge.send(OUTGOING.PlaceItem, payload);
                    }
                } else if (step.type === 'stack_helper_move') {
                    KuplafixBridge.send(OUTGOING.MoveFloorItem, step.id, step.x, step.y, step.rot);
                } else if (step.type === 'stack_helper_height') {
                    KuplafixBridge.send(OUTGOING.SetStackHeight, step.id, step.height);
                } else if (step.type === 'pickup_helper') {
                    KuplafixBridge.send(OUTGOING.PickupItem, 10, step.id);
                } else if (step.type === 'chat') {
                    KuplafixBridge.send(OUTGOING.Chat, step.message, 0);
                }
            } catch (e) { log.error('Placement step error:', e); }
        },
        _finish() {
            this.stop();
            // Restore Original Room Model if available
            // Restore Original Room Model if available
            // Only restore if we didn't apply the blueprint floorplan at the start (avoid redundant update)
            // And if we are not ignoring floorplan entirely
            const shouldRestore = !config.get('ignoreFloorplan') && !config.get('applyBlueprintFloorplan');

            if (shouldRestore && this._currentBlueprint && this._currentBlueprint.roomModel) {
                const m = this._currentBlueprint.roomModel;
                log.info('Restoring final room model...');

                // Use smart door position for restoration too
                const safePos = this._findSmartDoorPosition(m.map);

                // Header 875 (UpdateFloorProperties): map, doorX, doorY, doorDir, wallHeight, wallThick, floorThick
                KuplafixBridge.send(OUTGOING.UpdateFloorProperties, m.map, safePos.x, safePos.y, 2, m.wallHeight, 0, 0);
            }
            RoomilusUI.updatePlacementProgress(1, 1, true); // Reset progress UI
            KuplafixBridge.showToast(`Placement complete! Placed ${this._placed} items.`, 'success');
            this._currentBlueprint = null;
        },
        _handleItemAdded(buffer) {
            // Only process if we are actively placing
            if (!this._isPlacing) return;

            const view = new DataView(buffer);
            let offset = 0;
            if (buffer.byteLength >= 6 && view.getInt16(4) === INCOMING.AddFloorItem) offset += 6;

            // Read Item Data: int id, int spriteId, int x, int y, int rot, string z...
            try {
                const id = view.getInt32(offset); offset += 4;
                const spriteId = view.getInt32(offset); offset += 4;
                const x = view.getInt32(offset); offset += 4;
                const y = view.getInt32(offset); offset += 4;

                // key match (includes spriteId to prevent collision)
                const key = `${x}_${y}_${spriteId}`;
                log.info(`[HandleItemAdded] Item ${id} sprite=${spriteId} at ${x},${y}. Checking key: ${key}. PendingState has: ${this._pendingState.has(key)}`);

                if (this._pendingState.has(key)) {
                    const targetState = this._pendingState.get(key);
                    log.info(`[Toggle] Applying state ${targetState} to Item ${id} (sprite ${spriteId}) at ${x},${y}`);
                    this._applyState(id, targetState);
                    this._pendingState.delete(key);
                }
            } catch (e) { log.error('[HandleItemAdded] Parse error:', e); }
        },
        async _applyState(itemId, count) {
            if (!count || count <= 0) return; // FIX: Never toggle if state is 0
            // Toggle item N times.
            // Packet 99 (ToggleItem) - Int itemId, Int 0
            for (let i = 0; i < count; i++) {
                KuplafixBridge.send(OUTGOING.ToggleItem, itemId, 0);
                await new Promise(r => setTimeout(r, 150)); // small delay between toggles
            }
        }
    };

    const AutoPurchaser = {
        _queue: [],
        _isProcessing: false,
        _interval: null,

        buyMissing(blueprint) {
            if (this._isProcessing) {
                KuplafixBridge.showToast('Already purchasing items, please wait.', 'warn');
                return;
            }

            const missing = new Map();
            const process = (list) => {
                list?.forEach(item => {
                    const id = parseInt(item.spriteId);
                    if (!missing.has(id)) missing.set(id, { count: 0 });
                    missing.get(id).count++;
                });
            };
            process(blueprint.floorItems);
            process(blueprint.wallItems);

            this._queue = [];
            missing.forEach((data, spriteId) => {
                const owned = InventoryTracker.getCount(spriteId);
                const neededTotal = data.count - owned;
                if (neededTotal > 0) {
                    const toBuy = Math.min(neededTotal, 100);
                    this._queue.push({ spriteId, amount: toBuy });
                }
            });

            if (this._queue.length > 0) {
                const total = this._queue.reduce((acc, item) => acc + item.amount, 0);
                KuplafixBridge.showToast(`Starting bulk purchase: ${total} items (${this._queue.length} types)...`, 'success');
                this._startProcessing();
            } else {
                KuplafixBridge.showToast(`No missing items to purchase!`, 'info');
            }
        },

        _processNext() {
            if (!this._isProcessing || this._queue.length === 0) {
                this._stopProcessing();
                return;
            }

            const item = this._queue.shift();
            const info = FurnitureDataManager.get(item.spriteId);

            // Guard: If item is not in our FurnitureData, do not attempt to buy
            if (!info) {
                log.warn(`AutoPurchaser: Skipping sprite ${item.spriteId} - Name/Data not found on server.`);
                KuplafixBridge.showToast(`Skipping unknown item (Sprite ${item.spriteId})`, 'error');
                // Use shorter timeout to proceed
                setTimeout(() => this._processNext(), 100);
                return;
            }

            const forceSprite = config.get('forceSpriteId');

            // If we have an offer ID or forcing sprite ID, buy immediately
            if (forceSprite || (info && info.offerId !== item.spriteId)) {
                this._sendBuyPacket(info ? info.offerId : item.spriteId, item.amount);
                setTimeout(() => this._processNext(), 1000);
                return;
            }

            // Otherwise, we need to request the product offer (Header 2594)
            log.info(`AutoPurchaser: Requesting product offer for sprite ${item.spriteId}...`);
            this._waitingForItem = item;
            KuplafixBridge.send(OUTGOING.GetProductOffer, KuplafixBridge.types.Int(item.spriteId));

            // Set a timeout to continue if we don't receive an offer in 5s
            this._waitingTimer = setTimeout(() => {
                if (this._waitingForItem === item) {
                    log.warn(`AutoPurchaser: Timeout waiting for offer for ${item.spriteId}, buying with spriteId fallback...`);
                    this._sendBuyPacket(item.spriteId, item.amount);
                    this._waitingForItem = null;
                    this._processNext();
                }
            }, 5000);
        },

        onOfferReceived(offerId) {
            if (!this._waitingForItem) return;

            if (this._waitingTimer) clearTimeout(this._waitingTimer);

            const item = this._waitingForItem;
            this._waitingForItem = null;

            log.info(`AutoPurchaser: Received offer ${offerId} for sprite ${item.spriteId}`);
            FurnitureDataManager.learnOffer(item.spriteId, offerId);

            this._sendBuyPacket(offerId, item.amount);

            // Continue queue after 1s delay
            setTimeout(() => this._processNext(), 1000);
        },

        _sendBuyPacket(offerId, amount) {
            log.info(`AutoPurchaser: CatalogBuyItem(offer: ${offerId}, amount: ${amount})`);
            // Arcturus/Java structure: pageId(Int), itemId(Int), extraData(String), count(Int)
            // Follows strict server protocol
            KuplafixBridge.send(OUTGOING.CatalogBuyItem,
                KuplafixBridge.types.Int(-1),           // pageId (-1 -> search by offerId)
                KuplafixBridge.types.Int(offerId),      // itemId (offerId)
                KuplafixBridge.types.String(""),        // extraData (empty)
                KuplafixBridge.types.Int(amount)        // count
            );
        },

        _startProcessing() {
            if (this._isProcessing) return;
            this._isProcessing = true;
            this._processNext();
        },

        _stopProcessing() {
            if (this._waitingTimer) clearTimeout(this._waitingTimer);
            this._isProcessing = false;
            this._waitingForItem = null;
            log.info('AutoPurchaser: Processing stopped');
            KuplafixBridge.showToast('Bulk purchase finished! Refreshing inventory...', 'success');
            setTimeout(() => KuplafixBridge.send(OUTGOING.RequestInventory, ''), 1500);
        }
    };

    const RoomilusUI = {
        _panel: null,
        _isOpen: false,
        init() { this._injectStyles(); this._createButton(); },
        _injectStyles() {
            const style = document.createElement('style');
            style.textContent = `
        .roomilus-btn { position: fixed; top: 13%; right: 14.5%; width: 46px; height: 46px; background: linear-gradient(135deg, #2d5a27 0%, #1a3d15 100%); border: 2px solid #4a8f3f; border-radius: 10px; color: #fff; font-size: 20px; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.5); z-index: 99998; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .roomilus-btn:hover { background: linear-gradient(135deg, #3a7233 0%, #254d1f 100%); border-color: #c8f0c0; transform: scale(1.05); }
        .roomilus-panel { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(26, 35, 26, 0.97); border: 1px solid #4a8f3f; border-radius: 12px; color: #e0e8e0; width: 420px; max-height: 80vh; z-index: 99999; font-family: system-ui; display: none; flex-direction: column; }
        .roomilus-panel.open { display: flex; }
        .roomilus-header { background: linear-gradient(135deg, #2d5a27 0%, #1a3d15 100%); padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #4a8f3f; cursor: grab; user-select: none; }
        .roomilus-title { font-size: 18px; font-weight: bold; color: #c8f0c0; }
        .roomilus-close { background: transparent; border: 1px solid rgba(200,240,192,0.3); color: #c8f0c0; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; }
        .roomilus-tabs { display: flex; background: rgba(20, 28, 20, 0.8); border-bottom: 1px solid #3a6633; }
        .roomilus-tab { flex: 1; padding: 12px; text-align: center; cursor: pointer; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #8fa888; border-bottom: 2px solid transparent; }
        .roomilus-tab.active { color: #c8f0c0; background: rgba(74, 143, 63, 0.2); border-bottom-color: #4a8f3f; }
        .roomilus-content { padding: 20px; overflow-y: auto; max-height: 400px; }
        .roomilus-section { margin-bottom: 20px; }
        .roomilus-section-title { font-size: 11px; color: #6a8a60; text-transform: uppercase; margin-bottom: 10px; }
        .roomilus-btn-primary { background: linear-gradient(135deg, #3a7233 0%, #2d5a27 100%); color: #fff; border: none; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; width: 100%; transition: background 0.3s; }
        .roomilus-btn-danger { background: linear-gradient(135deg, #8f3f3f 0%, #5a2727 100%); color: #fff; border: none; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; width: 100%; transition: background 0.3s; margin-top: 10px; }
        .roomilus-btn-danger:hover { background: linear-gradient(135deg, #a04545 0%, #703030 100%); }
        .roomilus-btn-secondary { background: transparent; color: #8fa888; border: 1px solid #3a6633; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; }
        .roomilus-preview-item { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 4px; cursor: pointer; border-radius: 4px; transition: background 0.1s; }
        .roomilus-preview-item:hover { background: rgba(255,255,255,0.05); }
        .roomilus-preview-item.priority { background: rgba(74, 143, 63, 0.3); border: 1px solid #c8f0c0; }
        .roomilus-input { background: rgba(20, 28, 20, 0.8); border: 1px solid #3a6633; border-radius: 6px; padding: 10px 12px; color: #e0e8e0; width: 100%; box-sizing: border-box; }
        .roomilus-status { background: rgba(74, 143, 63, 0.15); border: 1px solid #3a6633; border-radius: 6px; padding: 12px; font-size: 12px; color: #8fa888; margin-bottom: 15px; }
        .roomilus-status strong { color: #c8f0c0; }
        .roomilus-blueprint-item { background: rgba(20, 28, 20, 0.6); border: 1px solid #3a6633; border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .roomilus-blueprint-actions { display: flex; gap: 6px; }
        
        input[type=range].roomilus-input {
            -webkit-appearance: none;
            background: transparent;
        }
        input[type=range].roomilus-input::-webkit-slider-runnable-track {
            width: 100%;
            height: 6px;
            cursor: pointer;
            background: rgba(74, 143, 63, 0.3);
            border-radius: 3px;
            border: 1px solid #3a6633;
        }
        input[type=range].roomilus-input::-webkit-slider-thumb {
            height: 16px;
            width: 16px;
            border-radius: 8px;
            background: #c8f0c0;
            cursor: pointer;
            -webkit-appearance: none;
            margin-top: -6px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.5);
            border: 1px solid #4a8f3f;
        }
        input[type=range].roomilus-input:hover::-webkit-slider-thumb {
            background: #fff;
            transform: scale(1.1);
        }
      `;
            document.head.appendChild(style);
        },
        _createButton() {
            const btn = document.createElement('button');
            btn.className = 'roomilus-btn';
            btn.textContent = '🏠';
            btn.onclick = () => this.toggle();
            document.body.appendChild(btn);
        },
        toggle() { if (this._isOpen) this.close(); else this.open(); },
        open() {
            if (!this._panel) this._createPanel();
            this._panel.classList.add('open');
            this._isOpen = true;
            this._renderContent();
        },
        close() { if (this._panel) this._panel.classList.remove('open'); this._isOpen = false; },
        _createPanel() {
            const panel = document.createElement('div');
            panel.className = 'roomilus-panel';
            panel.innerHTML = `
        <div class="roomilus-header"><span class="roomilus-title">🏠 Roomilus</span><button class="roomilus-close">✕</button></div>
        <div class="roomilus-tabs"><div class="roomilus-tab active" data-tab="export">Export</div><div class="roomilus-tab" data-tab="blueprints">Blueprints</div><div class="roomilus-tab" data-tab="import">Import</div></div>
        <div id="roomilus-progress-container" style="display:none; padding:10px 20px; background:rgba(0,0,0,0.3); border-bottom:1px solid #3a6633;">
            <div style="display:flex; justify-content:space-between; font-size:10px; color:#c8f0c0; margin-bottom:4px;">
                <span id="roomilus-progress-text">Placing items...</span>
                <span id="roomilus-progress-percent">0%</span>
            </div>
            <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden;">
                <div id="roomilus-progress-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #4a8f3f, #c8f0c0); transition:width 0.2s;"></div>
            </div>
        </div>
        <div class="roomilus-content" id="roomilus-content"></div>`;
            panel.querySelector('.roomilus-close').onclick = () => this.close();
            panel.querySelectorAll('.roomilus-tab').forEach(tab => {
                tab.onclick = () => {
                    panel.querySelectorAll('.roomilus-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this._renderContent();
                };
            });
            this._makeDraggable(panel);
            document.body.appendChild(panel);
            this._panel = panel;
        },
        _makeDraggable(panel) {
            const header = panel.querySelector('.roomilus-header');
            let isDragging = false, currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0;
            header.addEventListener('mousedown', e => { if (e.target.classList.contains('roomilus-close')) return; initialX = e.clientX - xOffset; initialY = e.clientY - yOffset; isDragging = true; });
            document.addEventListener('mouseup', () => { initialX = currentX; initialY = currentY; isDragging = false; });
            document.addEventListener('mousemove', e => { if (isDragging) { e.preventDefault(); currentX = e.clientX - initialX; currentY = e.clientY - initialY; xOffset = currentX; yOffset = currentY; panel.style.transform = `translate(calc(-50% + ${currentX}px), calc(-50% + ${currentY}px))`; } });
        },
        _getActiveTab() { return this._panel?.querySelector('.roomilus-tab.active')?.dataset.tab || 'export'; },
        _renderContent() {
            const content = this._panel?.querySelector('#roomilus-content');
            if (!content) return;
            const tab = this._getActiveTab();
            if (tab === 'export') this._renderExportTab(content);
            else if (tab === 'blueprints') this._renderBlueprintsTab(content);
            else if (tab === 'import') this._renderImportTab(content);
        },
        _renderExportTab(container) {
            const ready = KuplafixBridge._ready;
            const isCapturing = RoomCapture._isCapturing;
            container.innerHTML = `
        <div class="roomilus-status" id="roomilus-export-status">${this._getExportStatusHtml(ready, isCapturing, RoomCapture.floorItemCount, RoomCapture.wallItemCount)}</div>
        <div class="roomilus-section"><div class="roomilus-section-title">Blueprint Name</div><input type="text" class="roomilus-input" id="roomilus-export-name" placeholder="My Awesome Room" value="${RoomCapture._currentRoom || ''}"></div>
        <div class="roomilus-section">
            <label style="display:flex; align-items:center; gap:8px; font-size:12px; color:#cbd6dc; cursor:pointer;">
                <input type="checkbox" id="roomilus-force-sprite" ${config.get('forceSpriteId') ? 'checked' : ''} style="width:16px; height:16px;">
                <span>Force Buy by Sprite ID (Fixes wrong items)</span>
            </label>
        </div>
        <div class="roomilus-section">${isCapturing ? `<button class="roomilus-btn-primary" id="roomilus-export-btn" style="background: linear-gradient(135deg, #8f3f3f 0%, #5a2727 100%);">⏹ Stop & Save Blueprint</button>` : `<button class="roomilus-btn-primary" id="roomilus-export-btn" ${!ready ? 'disabled' : ''}>▶ Start Capture Mode</button>`}</div>
        <div class="roomilus-section" style="font-size: 11px; color: #6a8a60;"><p>Click Start, then reload the room.</p></div>`;
            container.querySelector('#roomilus-export-btn').onclick = () => {
                if (isCapturing) {
                    RoomCapture.stopCapture();
                    const name = container.querySelector('#roomilus-export-name').value.trim() || `Room_${Date.now()}`;
                    BlueprintStorage.save(name, RoomCapture.getBlueprint(name));
                    KuplafixBridge.showToast(`Saved blueprint "${name}"`, 'success');
                    this._renderContent();
                } else {
                    RoomCapture.startCapture();
                    RoomCapture.onChange = () => { const s = container.querySelector('#roomilus-export-status'); if (s) s.innerHTML = this._getExportStatusHtml(true, true, RoomCapture.floorItemCount, RoomCapture.wallItemCount); };
                    this._renderContent();
                    KuplafixBridge.send(OUTGOING.RequestRoom, '');
                }
            };
            const forceCheckbox = container.querySelector('#roomilus-force-sprite');
            if (forceCheckbox) forceCheckbox.onchange = (e) => config.set('forceSpriteId', e.target.checked);
        },
        _getExportStatusHtml(ready, isCapturing, floor, wall) {
            if (!ready) return '⏳ Waiting for kuplafix...';
            if (isCapturing) return `<strong>🔴 REC</strong> | Captured: <strong>${floor}</strong> Floor, <strong>${wall}</strong> Wall`;
            return `<strong>Ready</strong> | Last Capture: ${floor} Floor, ${wall} Wall`;
        },
        _renderBlueprintsTab(container) {
            const blueprints = BlueprintStorage.list();
            if (blueprints.length === 0) { container.innerHTML = '<div class="roomilus-empty">No blueprints saved yet.</div>'; return; }
            container.innerHTML = `<div class="roomilus-blueprint-list">${blueprints.map(bp => `<div class="roomilus-blueprint-item" data-name="${bp.name}"><div class="roomilus-blueprint-info"><div class="roomilus-blueprint-name">${bp.name} ${bp.serverOrigin ? `<span style="font-size:10px; background:#4a9eff; padding:2px 4px; border-radius:4px; color:white;">${bp.serverOrigin}</span>` : ''}</div><div class="roomilus-blueprint-meta">${bp.itemCount} items</div></div><div class="roomilus-blueprint-actions"><button class="roomilus-btn-secondary" data-action="export">💾</button><button class="roomilus-btn-secondary" data-action="delete">🗑️</button></div></div>`).join('')}</div>`;
            container.querySelectorAll('.roomilus-blueprint-item').forEach(item => {
                const name = item.dataset.name;
                item.querySelector('[data-action="export"]').onclick = () => BlueprintStorage.exportToFile(name);
                item.querySelector('[data-action="delete"]').onclick = (e) => {
                    const btn = e.target;
                    if (btn.dataset.confirming) { BlueprintStorage.delete(name); this._renderContent(); }
                    else { btn.dataset.confirming = 'true'; btn.textContent = 'Confirm?'; setTimeout(() => { if (btn.dataset.confirming) { delete btn.dataset.confirming; btn.textContent = '🗑️'; } }, 3000); }
                };
            });
        },
        _renderImportTab(container) {
            const blueprints = BlueprintStorage.list();
            container.innerHTML = `
            <div class="roomilus-section">
                <div class="roomilus-section-title">Stack Helper</div>
                <div style="display:flex; justify-content:space-between; align-items:center; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; border: 1px solid #3a6633;">
                    <span style="font-size:11px; color: ${StackHelper.id ? '#c8f0c0' : '#ffa0a0'}">
                        ${StackHelper.id ? `Configured (ID: ${StackHelper.id})` : '⚠️ Not Configured'}
                    </span>
                    <button class="roomilus-btn-secondary" id="roomilus-stack-btn" style="padding: 4px 8px; font-size:10px; ${StackHelper._isDetecting ? 'background:#8f3f3f; color:#fff;' : ''}">
                        ${StackHelper._isDetecting ? 'Searching (Set Height)...' : 'Detect'}
                    </button>
                </div>
            </div>
            <div class="roomilus-section">
                <label style="display:flex; align-items:center; gap:8px; font-size:12px; color:#cbd6dc; cursor:pointer; margin-bottom: 6px;">
                    <input type="checkbox" id="roomilus-ignore-floorplan" ${config.get('ignoreFloorplan') ? 'checked' : ''} style="width:16px; height:16px;">
                    <span>Ignore floorplan editing</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; font-size:12px; color:#cbd6dc; cursor:pointer; margin-bottom: 6px;">
                    <input type="checkbox" id="roomilus-apply-floorplan" ${config.get('applyBlueprintFloorplan') ? 'checked' : ''} style="width:16px; height:16px;">
                    <span>Apply blueprint floorplan before placing</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; font-size:12px; color:#cbd6dc; cursor:pointer; margin-bottom: 6px;">
                    <input type="checkbox" id="roomilus-use-stacktile" ${config.get('useStacktileForAll') ? 'checked' : ''} style="width:16px; height:16px;">
                    <span>Use stacktile for all items</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; font-size:12px; color:#cbd6dc; cursor:pointer;">
                    <input type="checkbox" id="roomilus-high-z" ${config.get('highZMode') ? 'checked' : ''} style="width:16px; height:16px;">
                    <span>High Z Mode (>40, uses :bh)</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; font-size:12px; color:#cbd6dc; cursor:pointer; margin-top: 6px;">
                    <input type="checkbox" id="roomilus-bh-priority" ${config.get('useBhForPriority') ? 'checked' : ''} style="width:16px; height:16px;">
                    <span>Use :bh for ⭐ priority items</span>
                </label>
            </div>
            <div class="roomilus-section">
                <div class="roomilus-section-title">Placement Speed: <span id="roomilus-speed-val">${config.get('placementSpeed') || 150}</span>ms</div>
                <input type="range" class="roomilus-input" id="roomilus-speed-slider" min="10" max="500" step="5" value="${config.get('placementSpeed') || 150}" style="padding:0; height:20px; cursor:pointer;">
                <div style="display:flex; justify-content:space-between; font-size:10px; color:#6a8a60; margin-top:4px;"><span>Ultra Fast (10ms)</span><span>Balanced (500ms)</span></div>
            </div>
            <div class="roomilus-section"><div class="roomilus-section-title">Load Blueprint</div><select class="roomilus-input" id="roomilus-import-select"><option value="">-- Select Blueprint --</option>${blueprints.map(bp => `<option value="${bp.name}">${bp.name} (${bp.itemCount} items)</option>`).join('')}</select></div><div class="roomilus-section"><button class="roomilus-btn-secondary" id="roomilus-import-file" style="width: 100%;">📁 Import from File</button><input type="file" id="roomilus-file-input" accept=".json" style="display: none;"></div><div class="roomilus-section" id="roomilus-import-preview" style="display: none;"></div>`;
            container.querySelector('#roomilus-high-z').onchange = (e) => config.set('highZMode', e.target.checked);
            container.querySelector('#roomilus-bh-priority').onchange = (e) => config.set('useBhForPriority', e.target.checked);
            container.querySelector('#roomilus-ignore-floorplan').onchange = (e) => {
                config.set('ignoreFloorplan', e.target.checked);
                if (e.target.checked) {
                    config.set('applyBlueprintFloorplan', false);
                    const applyCheck = container.querySelector('#roomilus-apply-floorplan');
                    if (applyCheck) applyCheck.checked = false;
                }
            };
            container.querySelector('#roomilus-apply-floorplan').onchange = (e) => {
                config.set('applyBlueprintFloorplan', e.target.checked);
                if (e.target.checked) {
                    config.set('ignoreFloorplan', false);
                    const ignoreCheck = container.querySelector('#roomilus-ignore-floorplan');
                    if (ignoreCheck) ignoreCheck.checked = false;
                }
            };
            container.querySelector('#roomilus-use-stacktile').onchange = (e) => config.set('useStacktileForAll', e.target.checked);

            const speedSlider = container.querySelector('#roomilus-speed-slider');
            const speedVal = container.querySelector('#roomilus-speed-val');
            speedSlider.oninput = (e) => {
                const val = parseInt(e.target.value);
                speedVal.textContent = val;
                config.set('placementSpeed', val);
            };
            container.querySelector('#roomilus-stack-btn').onclick = () => {
                StackHelper.toggleDetection();
                this._renderContent();
            };
            const fileInput = container.querySelector('#roomilus-file-input');
            container.querySelector('#roomilus-import-file').onclick = () => fileInput.click();
            fileInput.onchange = async e => {
                if (e.target.files.length) {
                    try {
                        let bp = await BlueprintStorage.importFromFile(e.target.files[0]);
                        // Auto-convert if from external server
                        if (bp.serverOrigin && bp.serverOrigin !== 'kuplahotelli.com' && bp.serverOrigin !== 'Kupla') {
                            log.info(`Converting blueprint from ${bp.serverOrigin} to Kupla IDs...`);
                            bp = BlueprintStorage.convertForKupla(bp);
                            if (bp._conversionStats) {
                                const stats = bp._conversionStats;
                                KuplafixBridge.showToast(`Converted: ${stats.converted} items (${stats.failed} unmapped)`);
                            }
                        }
                        BlueprintStorage.save(bp.roomName || `Imp_${Date.now()}`, bp);
                        KuplafixBridge.showToast('Imported');
                        this._renderContent();
                    } catch (err) {
                        log.error('Import error:', err);
                        KuplafixBridge.showToast('Error', 'error');
                    }
                }
            };
            container.querySelector('#roomilus-import-select').onchange = e => { const name = e.target.value; if (name) this._renderImportPreview(container.querySelector('#roomilus-import-preview'), BlueprintStorage.load(name)); else container.querySelector('#roomilus-import-preview').style.display = 'none'; };
        },
        _renderImportPreview(container, blueprint) {
            if (!blueprint) { container.style.display = 'none'; return; }
            container.style.display = 'block';
            const summary = new Map();
            const processItem = (item, isWall) => {
                const id = parseInt(item.spriteId);
                if (!summary.has(id)) {
                    const info = FurnitureDataManager.get(id);
                    summary.set(id, { name: info ? info.publicName : `${isWall ? 'Wall ' : ''}Sprite ${id}`, count: 0, spriteId: id });
                }
                summary.get(id).count++;
            };
            if (blueprint.floorItems) blueprint.floorItems.forEach(i => processItem(i, false));
            if (blueprint.wallItems) blueprint.wallItems.forEach(i => processItem(i, true));
            const summaryHtml = Array.from(summary.values()).sort((a, b) => b.count - a.count).map(item => {
                const owned = InventoryTracker.getCount(item.spriteId);
                const color = owned >= item.count ? '#c8f0c0' : '#ffa0a0';
                const icon = owned >= item.count ? '✅' : '❌';
                // Check if manually prioritized
                const isPrio = PlacementController.manualPriority.has(item.spriteId);
                const prioClass = isPrio ? 'priority' : '';
                const prioIcon = isPrio ? '⭐ ' : '';

                // Match replacement logic
                const canReplace = owned < item.count; // Only suggest if missing? User said "replace item with another", implies any item.
                // User said "replace item with another and then show a dropdown of items in inventory with same quantity as the total needed amount"

                return `
                <div class="roomilus-preview-item ${prioClass}" style="color:${color}; flex-wrap:wrap;">
                    <div style="display:flex; width:100%; align-items:center;">
                         <div style="flex:1; display:flex; align-items:center; cursor:pointer; overflow:hidden;" data-toggle-prio="${item.spriteId}" title="Click to prioritize">
                             <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:8px;">${prioIcon}${item.name}</span>
                         </div>
                         <button class="roomilus-btn-secondary" style="font-size:9px; padding:1px 5px; width:auto; margin-right:6px;" data-replace-sprite="${item.spriteId}" data-replace-count="${item.count}" title="Replace Item">🔄</button>
                         <span style="font-family:monospace; font-size:10px; cursor:default;">${icon} ${owned}/${item.count}</span>
                    </div>
                </div>`;
            }).join('');

            // Define global replacer for inline simplicity
            const replaceItem = (targetSpriteId, neededCount) => {
                const invItems = InventoryTracker.getAllItems().filter(i => i.count >= neededCount && i.spriteId !== targetSpriteId);
                if (invItems.length === 0) {
                    KuplafixBridge.showToast(`No items in inventory with quantity >= ${neededCount}`, 'warn');
                    return;
                }

                // Create a simple modal/prompt
                const options = invItems.map(i => {
                    const info = FurnitureDataManager.get(i.spriteId);
                    const name = info ? info.publicName : `Sprite ${i.spriteId}`;
                    return { id: i.spriteId, text: `${name} (${i.count})` };
                }).sort((a, b) => a.text.localeCompare(b.text));

                // Simple prompt is ugly and can't do dropdown well. Let's make a temporary overlay in the container.
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:absolute; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.9); z-index:100; display:flex; flex-direction:column; padding:10px; justify-content:center;';
                overlay.innerHTML = `
                    <div class="roomilus-section-title">Replace Item</div>
                    <div style="color:#ccc; font-size:11px; margin-bottom:8px;">Choose replacement (needs ${neededCount}):</div>
                    <select id="roomilus-replace-select" class="roomilus-input" style="margin-bottom:8px;">
                        ${options.map(o => `<option value="${o.id}">${o.text}</option>`).join('')}
                    </select>
                    <div style="display:flex; gap:6px;">
                        <button id="roomilus-replace-confirm" class="roomilus-btn-primary">Replace</button>
                        <button id="roomilus-replace-cancel" class="roomilus-btn-danger">Cancel</button>
                    </div>
                 `;
                container.appendChild(overlay); // Append to preview container

                overlay.querySelector('#roomilus-replace-cancel').onclick = () => overlay.remove();
                overlay.querySelector('#roomilus-replace-confirm').onclick = () => {
                    const newSpriteId = parseInt(overlay.querySelector('#roomilus-replace-select').value);
                    if (newSpriteId) {
                        // Perform replacement
                        let count = 0;
                        if (blueprint.floorItems) {
                            blueprint.floorItems.forEach(i => { if (parseInt(i.spriteId) === targetSpriteId) { i.spriteId = newSpriteId; count++; } });
                        }
                        if (blueprint.wallItems) {
                            blueprint.wallItems.forEach(i => { if (parseInt(i.spriteId) === targetSpriteId) { i.spriteId = newSpriteId; count++; } });
                        }
                        KuplafixBridge.showToast(`Replaced ${count} items.`, 'success');
                        this._renderImportPreview(container, blueprint); // Re-render
                    }
                };
            };
            const buttonsHtml = `
            <div style="display:flex; gap:6px; margin-top: 8px;">
                 <button class="roomilus-btn-primary" id="roomilus-place-btn" style="flex:2;">▶ Place</button>
                 <button class="roomilus-btn-danger" id="roomilus-stop-btn" style="flex:1;" title="Stop Placement">⏹ Stop</button>
            </div>
            <div style="display:flex; gap:6px; margin-top: 6px;">
                 <button class="roomilus-btn-secondary" id="roomilus-buy-btn" style="flex:1; font-size:10px;" title="Buy Missing from Catalog Cache">🛒 Buy</button>
                 <button class="roomilus-btn-secondary" id="roomilus-refresh-inv" style="width: auto;" title="Refresh Inventory">🔄</button>
                 <button class="roomilus-btn-secondary" id="roomilus-apply-floorplan" style="flex:1; font-size:10px;" title="Apply Floorplan Only">🗺️ Floorplan</button>
            </div>`;

            container.innerHTML = `<div class="roomilus-section-title">Blueprint Preview (Click item to prioritize ⭐)</div><div class="roomilus-status"><strong>${blueprint.roomName || 'Unnamed'}</strong><br>Items: ${(blueprint.floorItems?.length || 0) + (blueprint.wallItems?.length || 0)}</div><div class="roomilus-section" style="max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.3); padding: 8px; font-size: 11px; border-radius: 4px; border: 1px solid #3a6633;">${summaryHtml || '<em style="color:#888">No items</em>'}</div>${buttonsHtml}`;

            // Add replace listeners
            container.querySelectorAll('[data-replace-sprite]').forEach(el => {
                el.onclick = (e) => {
                    e.stopPropagation(); // Prevent priority toggle
                    replaceItem(parseInt(el.dataset.replaceSprite), parseInt(el.dataset.replaceCount));
                };
            });

            // Add click listeners for manual priority (delegated or specific)
            container.querySelectorAll('[data-toggle-prio]').forEach(el => {
                el.onclick = () => {
                    const spriteId = parseInt(el.dataset.togglePrio);
                    if (PlacementController.manualPriority.has(spriteId)) {
                        PlacementController.manualPriority.delete(spriteId);
                    } else {
                        PlacementController.manualPriority.add(spriteId);
                    }
                    // Re-render to show update
                    this._renderImportPreview(container, blueprint);
                };
            });
            container.querySelector('#roomilus-stop-btn').onclick = () => {
                PlacementController.stop();
                KuplafixBridge.showToast('Placement stopped by user.', 'warn');
            };
            container.querySelector('#roomilus-refresh-inv').onclick = () => {
                KuplafixBridge.send(OUTGOING.RequestInventory, '');
                KuplafixBridge.showToast('Refreshing inventory...');
                setTimeout(() => this._renderImportPreview(container, blueprint), 800);
            };
            container.querySelector('#roomilus-buy-btn').onclick = () => AutoPurchaser.buyMissing(blueprint);
            container.querySelector('#roomilus-apply-floorplan').onclick = () => {
                if (!blueprint.roomModel) {
                    KuplafixBridge.showToast('No floorplan in this blueprint!', 'error');
                    return;
                }
                const m = blueprint.roomModel;
                const safePos = PlacementController._findSmartDoorPosition(m.map);
                // Packet order: map, doorX, doorY, doorDir, thicknessWall, thicknessFloor, wallHeight
                const wallThick = m.wallThickness ?? 0;
                const floorThick = m.floorThickness ?? 0;
                const wallH = m.wallHeight ?? -1; // -1 = default wall height
                KuplafixBridge.send(OUTGOING.UpdateFloorProperties, m.map, safePos.x, safePos.y, 2, wallThick, floorThick, wallH);
                KuplafixBridge.showToast('Floorplan applied!', 'success');
            };
            const btn = container.querySelector('#roomilus-place-btn');
            btn.onclick = () => {
                if (btn.dataset.confirming) { PlacementController.start(blueprint); }
                else { btn.dataset.confirming = 'true'; btn.textContent = '⚠️ Click again to CONFIRM'; btn.style.background = '#8f3f3f'; setTimeout(() => { if (btn.dataset.confirming) { delete btn.dataset.confirming; btn.textContent = '▶ Place Available Items'; btn.style.background = ''; } }, 3000); }
            };
        },
        updatePlacementProgress(current, total, isFinished = false) {
            const container = document.getElementById('roomilus-progress-container');
            if (!container) return;
            if (isFinished) { container.style.display = 'none'; return; }

            container.style.display = 'block';
            const bar = document.getElementById('roomilus-progress-bar');
            const percText = document.getElementById('roomilus-progress-percent');
            const statusText = document.getElementById('roomilus-progress-text');

            const percent = Math.min(100, Math.round((current / total) * 100));
            if (bar) bar.style.width = `${percent}%`;
            if (percText) percText.textContent = `${percent}%`;
            if (statusText) statusText.textContent = `Placing: ${current} / ${total}`;
        }
    };

    async function init() {
        config.load();
        if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
        RoomilusUI.init();
        FurnitureDataManager.load();
        StackHelper.init();
        const ready = await KuplafixBridge.waitForReady();
        if (!ready) { log.error('kuplafix not available.'); return; }
        CatalogCatcher.init();
        KuplafixBridge.onIncoming(INCOMING.RoomFloorItems, (header, buffer, args) => RoomCapture.handleFloorItems(header, buffer, args));
        KuplafixBridge.onIncoming(INCOMING.RoomWallItems, (header, buffer, args) => RoomCapture.handleWallItems(header, buffer, args));
        KuplafixBridge.onIncoming(INCOMING.AddHabboItem, (header, buffer, args) => InventoryTracker.handlePacket(header, buffer, args));
        KuplafixBridge.onIncoming(INCOMING.InventoryItems, (header, buffer, args) => InventoryTracker.handlePacket(header, buffer, args));
        KuplafixBridge.onIncoming(INCOMING.RoomModel, (header, buffer, args) => {
            RoomCapture.reset();
            RoomModelCapturer.handlePacket(header, buffer);
        });
        setTimeout(() => { KuplafixBridge.send(OUTGOING.RequestInventory, ''); }, 2000);
        log.info(`v${SCRIPT_VERSION} initialized`);
        KuplafixBridge.showToast(`Roomilus v${SCRIPT_VERSION} ready`);
    }

    init().catch(e => log.error('Init failed:', e));
})();
