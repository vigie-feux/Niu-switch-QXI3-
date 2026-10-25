// Configuration BLE & Codes en dur pour NIU XQi3
const XQI3_CONFIG = {
    DEVICE_PREFIX: 'NIU Link',
    SERVICE_UUID: '5ec94e30-f015-49b0-9fb8-83885b8aea32',
    CHAR_UUID: '5ec94e31-f015-49b0-9fb8-83885b8aea32',
    UNLOCK_HEX: '6784855922124433616292282354227987263531',
    LOCK_HEX: '6784855922124433616292282354227987273531'
};

let bluetoothDevice = null;
let gattCharacteristic = null;

// Éléments du DOM
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

// Utilitaire de journalisation
function log(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    const time = new Date().toLocaleTimeString('fr-FR', { hour12: false });
    entry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
    logConsole.appendChild(entry);
    logConsole.scrollTop = logConsole.scrollHeight;
}

// Convertit la chaîne Hex de 40 caractères en Uint8Array de 20 octets (comme l'option Byte Array de nRF Connect)
function hexToBytes(hex) {
    const cleanHex = hex.replace(/\s+/g, '');
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
        bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
    }
    return bytes;
}

// Mise à jour de l'interface selon l'état de connexion
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

// Recherche et connexion Bluetooth
async function scanAndConnect() {
    if (!navigator.bluetooth) {
        log('Erreur : Web Bluetooth non supporté sur ce navigateur. Utilisez Chrome sur Android ou Bluefy sur iOS.', 'error');
        alert('Web Bluetooth non disponible. Ouvrez cette page dans Chrome (Android) ou Bluefy (iOS).');
        return;
    }

    try {
        const usePrefixFilter = filterToggle.checked;
        const options = {
            optionalServices: [XQI3_CONFIG.SERVICE_UUID]
        };

        if (usePrefixFilter) {
            options.filters = [{ namePrefix: XQI3_CONFIG.DEVICE_PREFIX }];
            log(`Scan BLE lancé (Filtre : "${XQI3_CONFIG.DEVICE_PREFIX}*")...`, 'info');
        } else {
            options.acceptAllDevices = true;
            log('Scan BLE lancé (Tous les appareils)...', 'info');
        }

        bluetoothDevice = await navigator.bluetooth.requestDevice(options);
        const devName = bluetoothDevice.name || 'Moto XQi3 (Sans nom)';
        log(`Appareil sélectionné : ${devName}`, 'info');

        bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

        log('Connexion au serveur GATT...', 'info');
        const server = await bluetoothDevice.gatt.connect();

        log(`Recherche du service ${XQI3_CONFIG.SERVICE_UUID}...`, 'info');
        const service = await server.getPrimaryService(XQI3_CONFIG.SERVICE_UUID);

        log(`Recherche de la caractéristique ${XQI3_CONFIG.CHAR_UUID}...`, 'info');
        gattCharacteristic = await service.getCharacteristic(XQI3_CONFIG.CHAR_UUID);

        deviceUuidEl.textContent = `Caractéristique prête : ${XQI3_CONFIG.CHAR_UUID}`;
        updateUI(true, devName);
        log('Connecté et prêt à envoyer les codes !', 'success');

    } catch (error) {
        log(`Échec de connexion : ${error.message}`, 'error');
        updateUI(false);
    }
}

// Écriture de la trame d'octets sur la caractéristique BLE
async function sendCommand(hexCode, label) {
    if (!gattCharacteristic) {
        log('Erreur : Aucune caractéristique active.', 'error');
        return;
    }

    try {
        const payload = hexToBytes(hexCode);
        log(`Envoi [${label}] (${payload.byteLength} octets) : 0x${hexCode}`, 'warn');

        if (gattCharacteristic.writeValueWithResponse) {
            await gattCharacteristic.writeValueWithResponse(payload);
        } else {
            await gattCharacteristic.writeValue(payload);
        }

        log(`Trame [${label}] transmise avec succès ! Vérifiez la vitesse sur la moto.`, 'success');
    } catch (error) {
        log(`Erreur lors de l'envoi [${label}] : ${error.message}`, 'error');
    }
}

// Déconnexion propre
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

// Écouteurs d'événements
btnScan.addEventListener('click', scanAndConnect);
btnDisconnect.addEventListener('click', disconnectDevice);
btnUnlock.addEventListener('click', () => sendCommand(XQI3_CONFIG.UNLOCK_HEX, 'DÉBRIDAGE / UNLOCK'));
btnLock.addEventListener('click', () => sendCommand(XQI3_CONFIG.LOCK_HEX, 'BRIDAGE / LOCK'));
btnClearLog.addEventListener('click', () => { logConsole.innerHTML = ''; });

// Enregistrement du Service Worker pour la PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(() => log('PWA prête (Mode hors-ligne activé).', 'info'))
            .catch(err => log(`Service Worker non chargé : ${err.message}`, 'warn'));
    });
}

log('Application initialisée. Allumez votre XQi3 puis cliquez sur Scanner.', 'info');
