# XQi3 Connect (PWA Bluetooth BLE)

Application Web Progressive (PWA) inspirée de **nRF Connect** permettant de détecter une moto électrique **NIU XQi3** en Bluetooth Low Energy (BLE) et d'envoyer en un clic les trames de **Débridage (Unlock)** et **Bridage (Lock)**.

## Fichiers du dépôt
- `index.html` : Interface utilisateur principale
- `style.css` : Feuille de style (thème sombre mobile)
- `app.js` : Logique Web Bluetooth API & codes hexadécimaux enregistrés en dur
- `manifest.json` : Fichier de configuration PWA (installation sur écran d'accueil)
- `sw.js` : Service Worker pour le fonctionnement hors-ligne
- `icon.svg`, `icon-192.png`, `icon-512.png` : Icônes de l'application

## Paramètres BLE intégrés
- **Filtre de nom** : `NIU Link`
- **Service UUID** : `5ec94e30-f015-49b0-9fb8-83885b8aea32`
- **Characteristic UUID** : `5ec94e31-f015-49b0-9fb8-83885b8aea32`
- **Code Unlock (20 octets)** : `6784855922124433616292282354227987263531`
- **Code Lock (20 octets)** : `6784855922124433616292282354227987273531`

## Déploiement sur GitHub Pages
1. Chargez tous les fichiers à la racine de votre dépôt GitHub.
2. Allez dans **Settings** > **Pages**.
3. Sous **Build and deployment**, choisissez la branche `main` et le dossier `/ (root)`, puis cliquez sur **Save**.
4. Ouvrez l'URL HTTPS générée dans **Chrome (Android)** ou **Bluefy (iOS)**.
