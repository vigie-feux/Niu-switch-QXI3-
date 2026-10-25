// Configuration BLE & Codes en dur pour NIU XQi3 (Spécifique NIU LINK C9F7)
const XQI3_CONFIG = {
    DEVICE_PREFIX: 'NIU Link',
    SERVICE_UUID: '8ec94e30-f315-4f60-9fb8-838830daea52',
    CHAR_UUID: '8ec94e31-f315-4f60-9fb8-838830daea52',
    UNLOCK_HEX: '6784855922124433616292282354227987263531',
    LOCK_HEX: '6784855922124433616292282354227987273531',
    ALL_POSSIBLE_SERVICES: [
        '8ec94e30-f315-4f60-9fb8-838830daea52',
        '5ec94e30-f015-49b0-9fb8-83885b8aea32',
        '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
        '0000ffe0-0000-1000-8000-00805f9b34fb',
        '0000fff0-0000-1000-8000-00805f9b34fb',
        '0000ae00-0000-1000-8000-00805f9b34fb',
        '0000ae30-0000-1000-8000-00805f9b34fb',
        '0000fe00-0000-1000-8000-00805f9b34fb',
        '0000fee0-0000-1000-8000-00805f9b34fb',
        '0000fee7-0000-1000-8000-00805f9b34fb',
        '0000ff00-0000-1000-8000-00805f9b34fb',
        '00001800-0000-1000-8000-00805f9b34fb',
        '00001801-0000-1000-8000-00805f9b34fb',
        '0000180a-0000-1000-8000-00805f9b34fb'
    ]
};

let bluetoothDevice = null;
let gattCharacteristic = null;

const btnScan = document.getElementById('btn-scan');
const btnDisconnect = document.getElementById('btn-disconnect');
const btnUnlock = document.getElementById('btn-unlock');
const btnLock = document.getElementById('btn-lock');
const btnClearLog = document.getElementById('btn-clear-log');
const filterToggle = document.getElementById('filter-toggle');
const statusPill = document.getElementById('status-pill');
const statusText = document.getElementById('status-text');
const deviceNameEl = document.getElementById('device-name');
const deviceUuidEl = document.getElementById('device-uuid');
const logConsole = document.getElementById('log-console');

function log(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    const time = new Date().toLocaleTimeString('fr-FR', { hour12: false });
    entry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
    logConsole.appendChild(entry);
    logConsole.scrollTop = logConsole.scrollHeight;
}

function hexToBytes(hex) {
    const cleanHex = hex.replace(/\s+/g, '');
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
        bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
    }
    return bytes;
}

function updateUI(connected, name = 'Aucune moto détectée') {
    if (connected) {
        statusPill.className = 'status-pill connected';
        statusText.textContent = 'Connecté';
        deviceNameEl.textContent = name;
        btnScan.disabled = true;
        btnDisconnect.disabled = false;
        btnUnlock.disabled = false;
        btnLock.disabled = false;
    } else {
        statusPill.className = 'status-pill disconnected';
        statusText.textContent = 'Déconnecté';
        deviceNameEl.textContent = name;
        deviceUuidEl.textContent = `Service: ${XQI3_CONFIG.SERVICE_UUID}`;
        btnScan.disabled = false;
        btnDisconnect.disabled = true;
        btnUnlock.disabled = true;
        btnLock.disabled = true;
    }
}

async function scanAndConnect() {
    if (!navigator.bluetooth) {
        log('Erreur : Web Bluetooth non supporté sur ce navigateur. Utilisez Chrome sur Android.', 'error');
        alert('Web Bluetooth non disponible. Utilisez Chrome sur Android.');
        return;
    }

    try {
        const usePrefixFilter = filterToggle.checked;
        const options = {
            optionalServices: XQI3_CONFIG.ALL_POSSIBLE_SERVICES
        };

        if (usePrefixFilter) {
            options.filters = [{ namePrefix: XQI3_CONFIG.DEVICE_PREFIX }];
            log(`Scan BLE lancé (Filtre : "${XQI3_CONFIG.DEVICE_PREFIX}*")...`, 'info');
        } else {
            options.acceptAllDevices = true;
            log('Scan BLE lancé (Tous les appareils)...', 'info');
        }

        bluetoothDevice = await navigator.bluetooth.requestDevice(options);
        const devName = bluetoothDevice.name || 'Moto XQi3';
        log(`Appareil sélectionné : ${devName}`, 'info');

        bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

        log('Connexion au serveur GATT...', 'info');
        const server = await bluetoothDevice.gatt.connect();

        log('Inspection des services...', 'info');
        const services = await server.getPrimaryServices();

        let targetService = null;
        for (const s of services) {
            if (s.uuid.toLowerCase() === XQI3_CONFIG.SERVICE_UUID.toLowerCase()) {
                targetService = s;
                break;
            }
        }

        if (!targetService) {
            targetService = services.find(s => !s.uuid.startsWith('00001800') && !s.uuid.startsWith('00001801')) || services[0];
            log(`Service cible de repli : ${targetService.uuid}`, 'warn');
        } else {
            log(`Service cible trouvé : ${targetService.uuid}`, 'success');
        }

        log('Recherche de la caractéristique d\'écriture...', 'info');
        const chars = await targetService.getCharacteristics();
        
        gattCharacteristic = chars.find(c => c.uuid.toLowerCase() === XQI3_CONFIG.CHAR_UUID.toLowerCase()) ||
                             chars.find(c => c.properties.write || c.properties.writeWithoutResponse);

        if (!gattCharacteristic) {
            throw new Error('Aucune caractéristique inscriptible trouvée.');
        }

        deviceUuidEl.textContent = `Caractéristique : ${gattCharacteristic.uuid}`;
        updateUI(true, devName);
        log('Connecté et prêt !', 'success');

    } catch (error) {
        log(`❌ Échec de connexion : ${error.message}`, 'error');
        updateUI(false);
    }
}

// Envoi ultra-robuste contournant "GATT Operation Failed"
async function sendCommand(hexCode, label) {
    if (!gattCharacteristic) {
        log('Erreur : Aucune caractéristique active.', 'error');
        return;
    }

    try {
        const payload = hexToBytes(hexCode);
        log(`Envoi [${label}] (${payload.byteLength} octets) : 0x${hexCode}`, 'warn');

        const CHUNK_SIZE = 20;
        for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
            const chunk = payload.slice(i, i + CHUNK_SIZE);
            
            try {
                await gattCharacteristic.writeValue(chunk);
            } catch (err1) {
                await gattCharacteristic.writeValueWithoutResponse(chunk);
            }
            if (payload.length > CHUNK_SIZE) {
                await new Promise(r => setTimeout(r, 40));
            }
        }

        log(`🎉 Trame [${label}] transmise avec succès ! Vérifiez la vitesse sur la moto.`, 'success');
    } catch (error) {
        log(`❌ GATT Erreur [${label}] : ${error.message}`, 'error');
        log(`💡 Conseil : Déconnectez et reconnectez la moto si le contrôleur s'est mis en sécurité.`, 'warn');
    }
}

function disconnectDevice() {
    if (bluetoothDevice && bluetoothDevice.gatt.connected) {
        bluetoothDevice.gatt.disconnect();
    }
}

function onDisconnected() {
    gattCharacteristic = null;
    updateUI(false);
    log('Moto déconnectée.', 'warn');
}

btnScan.addEventListener('click', scanAndConnect);
btnDisconnect.addEventListener('click', disconnectDevice);
btnUnlock.addEventListener('click', () => sendCommand(XQI3_CONFIG.UNLOCK_HEX, 'DÉBRIDAGE / UNLOCK'));
btnLock.addEventListener('click', () => sendCommand(XQI3_CONFIG.LOCK_HEX, 'BRIDAGE / LOCK'));
btnClearLog.addEventListener('click', () => { logConsole.innerHTML = ''; });

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log(err));
    });
}

log('Application initialisée. Allumez votre XQi3 puis cliquez sur Scanner.', 'info');
