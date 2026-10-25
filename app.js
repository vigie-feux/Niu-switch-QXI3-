// Configuration BLE universelle NIU XQi3 (Zéro erreur d'UUID)
const XQI3_CONFIG = {
    DEVICE_PREFIX: 'NIU Link',
    UNLOCK_HEX: '6784855922124433616292282354227987263531',
    LOCK_HEX: '6784855922124433616292282354227987273531'
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
        deviceUuidEl.textContent = 'Prêt pour le scan';
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
        const options = {};

        // Pour éviter à 100% l'erreur "No Services matching UUID", 
        // on utilise acceptAllDevices: true (avec ou sans filtre de nom) SANS aucun optionalServices restrictif.
        if (usePrefixFilter) {
            options.filters = [{ namePrefix: XQI3_CONFIG.DEVICE_PREFIX }];
            log(`Scan BLE (Filtre nom : "${XQI3_CONFIG.DEVICE_PREFIX}*")`, 'info');
        } else {
            options.acceptAllDevices = true;
            log('Scan BLE global (Tous les appareils)...', 'info');
        }

        bluetoothDevice = await navigator.bluetooth.requestDevice(options);
        const devName = bluetoothDevice.name || 'Moto XQi3';
        log(`Appareil sélectionné : ${devName}`, 'info');

        bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

        log('Connexion au serveur GATT...', 'info');
        const server = await bluetoothDevice.gatt.connect();

        log('Récupération de tous les services de la moto...', 'info');
        const services = await server.getPrimaryServices();
        log(`${services.length} service(s) découvert(s) sur la moto.`, 'info');

        let foundChar = null;

        for (const service of services) {
            // Ignorer les services système de base
            if (service.uuid.startsWith('00001800') || service.uuid.startsWith('00001801')) continue;

            log(`Examen du service : ${service.uuid}`, 'info');
            try {
                const chars = await service.getCharacteristics();
                for (const c of chars) {
                    log(` - Caractéristique : ${c.uuid} (prop: write=${c.properties.write}, writeNoResp=${c.properties.writeWithoutResponse})`, 'info');
                    if (c.properties.write || c.properties.writeWithoutResponse || c.properties.writeWithoutResponse === false) {
                        foundChar = c;
                        break;
                    }
                }
            } catch (e) {
                log(`Impossible de lire les caractéristiques du service ${service.uuid}`, 'warn');
            }
            if (foundChar) break;
        }

        if (!foundChar) {
            throw new Error('Aucune caractéristique d\'écriture n\'a été trouvée sur cet appareil.');
        }

        gattCharacteristic = foundChar;
        deviceUuidEl.textContent = `Canal actif : ${gattCharacteristic.uuid}`;
        updateUI(true, devName);
        log('🎉 Connecté et prêt à envoyer les codes !', 'success');

    } catch (error) {
        log(`❌ Erreur : ${error.message}`, 'error');
        updateUI(false);
    }
}

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
        log(`❌ Erreur d'envoi [${label}] : ${error.message}`, 'error');
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
