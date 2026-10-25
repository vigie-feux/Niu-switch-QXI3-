// Configuration exacte extraite de la vidéo de Chris Ervin et de votre capture nRF Connect (NIU LINK C9F7)
const XQI3 = {
    SERVICE_UUID: '8ec94e30-f315-4f60-9fb8-838830daea52',
    UNLOCK_CODE: '6784855922124433616292282354227987263531',
    LOCK_CODE:   '6784855922124433616292282354227987273531'
};

let bleDevice = null;
let writeChars = [];

const btnConnect = document.getElementById('btn-connect');
const btnDisconnect = document.getElementById('btn-disconnect');
const btnUnlock = document.getElementById('btn-unlock');
const btnLock = document.getElementById('btn-lock');
const btnClear = document.getElementById('btn-clear');
const useFilter = document.getElementById('use-filter');
const formatSelect = document.getElementById('format-select');
const statusBadge = document.getElementById('status-badge');
const devNameEl = document.getElementById('dev-name');
const devServiceEl = document.getElementById('dev-service');
const logBox = document.getElementById('log-box');

function log(msg, type = 'info') {
    const line = document.createElement('div');
    line.className = `log-line log-${type}`;
    const t = new Date().toLocaleTimeString('fr-FR', { hour12: false });
    line.textContent = `[${t}] ${msg}`;
    logBox.appendChild(line);
    logBox.scrollTop = logBox.scrollHeight;
}

// Convertit la chaîne de 40 chiffres en tableau de 20 octets (Byte Array nRF Connect)
function hexToBytes(hexStr) {
    const clean = hexStr.trim();
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
        bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
    }
    return bytes;
}

function setConnectedUI(connected, name = 'Prêt à scanner') {
    if (connected) {
        statusBadge.className = 'badge connected';
        statusBadge.textContent = 'Connecté';
        devNameEl.textContent = name;
        btnConnect.disabled = true;
        btnDisconnect.disabled = false;
        btnUnlock.disabled = false;
        btnLock.disabled = false;
    } else {
        statusBadge.className = 'badge disconnected';
        statusBadge.textContent = 'Déconnecté';
        devNameEl.textContent = name;
        devServiceEl.textContent = XQI3.SERVICE_UUID;
        btnConnect.disabled = false;
        btnDisconnect.disabled = true;
        btnUnlock.disabled = true;
        btnLock.disabled = true;
    }
}

async function connectBike() {
    if (!navigator.bluetooth) {
        log('Web Bluetooth non disponible. Ouvrez cette page dans Chrome sur Android.', 'err');
        alert('Utilisez Google Chrome sur Android pour le Bluetooth.');
        return;
    }

    try {
        writeChars = [];
        // Déclaration obligatoire de votre UUID dans optionalServices avec uniquement des formats 128-bits valides
        const options = {
            optionalServices: [
                XQI3.SERVICE_UUID,
                '00001800-0000-1000-8000-00805f9b34fb',
                '00001801-0000-1000-8000-00805f9b34fb'
            ]
        };

        if (useFilter.checked) {
            // Accepte à la fois "NIU LINK C9F7" (majuscules comme sur votre capture) et "NIU Link"
            options.filters = [
                { namePrefix: 'NIU' },
                { services: [XQI3.SERVICE_UUID] }
            ];
            log('Recherche Bluetooth (Filtre NIU / Service XQi3)...', 'info');
        } else {
            options.acceptAllDevices = true;
            log('Recherche Bluetooth globale (Tous les appareils)...', 'info');
        }

        bleDevice = await navigator.bluetooth.requestDevice(options);
        const name = bleDevice.name || 'NIU XQi3';
        log(`Moto détectée : ${name}`, 'ok');

        bleDevice.addEventListener('gattserverdisconnected', () => {
            writeChars = [];
            setConnectedUI(false);
            log('Moto déconnectée.', 'warn');
        });

        log('Connexion au serveur GATT...', 'info');
        const server = await bleDevice.gatt.connect();

        log(`Ouverture du service ${XQI3.SERVICE_UUID}...`, 'info');
        const service = await server.getPrimaryService(XQI3.SERVICE_UUID);

        log('Lecture des caractéristiques (Unknown Characteristic)...', 'info');
        const chars = await service.getCharacteristics();

        for (const c of chars) {
            const p = c.properties;
            log(`Trouvé : ${c.uuid} [write:${p.write}, noResp:${p.writeWithoutResponse}]`, 'info');
            if (p.write || p.writeWithoutResponse) {
                writeChars.push(c);
            }
        }

        // Si aucune caractéristique ne déclare explicitement le flag mais qu'il y en a dans le service, on les garde toutes
        if (writeChars.length === 0 && chars.length > 0) {
            writeChars = chars;
        }

        if (writeChars.length === 0) {
            throw new Error('Aucune caractéristique trouvée dans Unknown Service.');
        }

        devServiceEl.textContent = `Caractéristique prête (${writeChars[0].uuid.slice(0, 8)}...)`;
        setConnectedUI(true, name);
        log(`Connecté ! ${writeChars.length} caractéristique(s) prête(s). Cliquez sur Débrider ou Brider.`, 'ok');

    } catch (err) {
        log(`Erreur : ${err.message}`, 'err');
        setConnectedUI(false);
    }
}

async function sendCode(codeStr, label) {
    if (writeChars.length === 0) {
        log('Non connecté à la moto.', 'err');
        return;
    }

    const mode = formatSelect.value;
    const payload = (mode === 'hex') ? hexToBytes(codeStr) : new TextEncoder().encode(codeStr);

    log(`Envoi [${label}] (${payload.byteLength} octets)...`, 'warn');

    let successCount = 0;

    for (const char of writeChars) {
        let written = false;

        // Méthode 1 : writeValueWithoutResponse (rapide, pas d'attente d'ACK GATT)
        if (!written && char.properties.writeWithoutResponse && char.writeValueWithoutResponse) {
            try {
                await char.writeValueWithoutResponse(payload);
                log(`✅ Envoyé (WithoutResponse) sur ${char.uuid.slice(0, 8)}`, 'ok');
                written = true;
            } catch (e) {
                log(`Repli méthode 2 sur ${char.uuid.slice(0, 8)}...`, 'info');
            }
        }

        // Méthode 2 : writeValueWithResponse
        if (!written && char.writeValueWithResponse) {
            try {
                await char.writeValueWithResponse(payload);
                log(`✅ Envoyé (WithResponse) sur ${char.uuid.slice(0, 8)}`, 'ok');
                written = true;
            } catch (e) {
                log(`Repli méthode 3 sur ${char.uuid.slice(0, 8)}...`, 'info');
            }
        }

        // Méthode 3 : writeValue standard
        if (!written) {
            try {
                await char.writeValue(payload);
                log(`✅ Envoyé (writeValue) sur ${char.uuid.slice(0, 8)}`, 'ok');
                written = true;
            } catch (e) {
                log(`Échec sur ${char.uuid.slice(0, 8)} : ${e.message}`, 'err');
            }
        }

        if (written) successCount++;
    }

    if (successCount > 0) {
        log(`🎉 Code [${label}] envoyé ! Comme indiqué dans la vidéo, il n'y a pas de bip de confirmation : testez la poignée sur béquille (> 30 mph en Sport).`, 'ok');
    } else {
        log(`❌ Échec d'écriture. Essayez de basculer le menu "Mode: Byte Array / Texte UTF-8" ou fermez nRF Connect en arrière-plan.`, 'err');
    }
}

btnConnect.addEventListener('click', connectBike);
btnDisconnect.addEventListener('click', () => {
    if (bleDevice && bleDevice.gatt.connected) {
        bleDevice.gatt.disconnect();
    }
});
btnUnlock.addEventListener('click', () => sendCode(XQI3.UNLOCK_CODE, 'DÉBRIDAGE'));
btnLock.addEventListener('click', () => sendCode(XQI3.LOCK_CODE, 'BRIDAGE'));
btnClear.addEventListener('click', () => { logBox.innerHTML = ''; });

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(r => r.update()).catch(() => {});
    });
}

log('Prêt. Fermez nRF Connect avant de cliquer sur Scanner.', 'info');
