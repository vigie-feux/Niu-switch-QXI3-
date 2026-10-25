// Configuration BLE Universelle NIU XQi3 (Auto-Discovery sans échec d'UUID)
const XQI3 = {
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
        devServiceEl.textContent = 'Auto-découverte active';
        btnConnect.disabled = false;
        btnDisconnect.disabled = true;
        btnUnlock.disabled = true;
        btnLock.disabled = true;
    }
}

async function connectBike() {
    if (!navigator.bluetooth) {
        log('Web Bluetooth non disponible. Utilisez Chrome sur Android.', 'err');
        alert('Utilisez Google Chrome sur Android pour le Bluetooth.');
        return;
    }

    try {
        writeChars = [];
        const options = {
            optionalServices: [
                '8ec94e30-f315-4f60-9fb8-838830daea52',
                '5ec94e30-f015-49b0-9fb8-83885b8aea32',
                '00001800-0000-1000-8000-00805f9b34fb',
                '00001801-0000-1000-8000-00805f9b34fb',
                '0000ffe0-0000-1000-8000-00805f9b34fb',
                '0000fff0-0000-1000-8000-00805f9b34fb'
            ]
        };

        if (useFilter.checked) {
            options.filters = [{ namePrefix: 'NIU' }];
            log('Recherche Bluetooth (Filtre NIU)...', 'info');
        } else {
            options.acceptAllDevices = true;
            log('Recherche Bluetooth globale...', 'info');
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

        log('Récupération de tous les services de la moto...', 'info');
        const services = await server.getPrimaryServices();
        log(`${services.length} service(s) trouvé(s) sur la moto.`, 'info');

        for (const service of services) {
            if (service.uuid.startsWith('00001800') || service.uuid.startsWith('00001801')) continue;
            log(`Examen du service : ${service.uuid}`, 'info');
            try {
                const chars = await service.getCharacteristics();
                for (const c of chars) {
                    log(` - Caractéristique : ${c.uuid} [write:${c.properties.write}, noResp:${p = c.properties.writeWithoutResponse}]`, 'info');
                    if (c.properties.write || c.properties.writeWithoutResponse || c.properties.writeWithoutResponse === false) {
                        writeChars.push(c);
                    }
                }
            } catch (e) {
                log(`Impossible de lire les caractéristiques de ${service.uuid}`, 'warn');
            }
        }

        if (writeChars.length === 0 && services.length > 0) {
            for (const service of services) {
                if (service.uuid.startsWith('00001800')) continue;
                try {
                    const chars = await service.getCharacteristics();
                    if (chars.length > 0) {
                        writeChars = chars;
                        break;
                    }
                } catch(e){}
            }
        }

        if (writeChars.length === 0) {
            throw new Error('Aucune caractéristique d\'écriture trouvée sur la moto.');
        }

        devServiceEl.textContent = `Canal actif : ${writeChars[0].uuid.slice(0, 8)}...`;
        setConnectedUI(true, name);
        log(`🎉 Connecté avec succès ! ${writeChars.length} canal(aux) prêt(s).`, 'ok');

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
        try {
            await char.writeValue(payload);
            log(`✅ Envoyé (writeValue) sur ${char.uuid.slice(0, 8)}`, 'ok');
            written = true;
        } catch (e1) {
            try {
                await char.writeValueWithoutResponse(payload);
                log(`✅ Envoyé (WithoutResponse) sur ${char.uuid.slice(0, 8)}`, 'ok');
                written = true;
            } catch (e2) {
                log(`Échec sur ${char.uuid.slice(0, 8)} : ${e2.message}`, 'err');
            }
        }
        if (written) successCount++;
    }

    if (successCount > 0) {
        log(`🎉 Code [${label}] transmis ! Testez la poignée sur béquille (> 30 mph en Sport).`, 'ok');
    } else {
        log(`❌ Échec de transmission.`, 'err');
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
