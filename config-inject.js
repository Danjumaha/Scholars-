// config-inject.js - Build script to inject Firebase config
import fs from 'fs';
import path from 'path';

const config = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

const htmlPath = path.join(process.cwd(), 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const configScript = `<script>window.FIREBASE_CONFIG = ${JSON.stringify(config)};</script>`;

// Inject config script right after <head>
html = html.replace('<head>', `<head>\n${configScript}`);

fs.writeFileSync(htmlPath, html);
console.log('✅ Firebase config injected into index.html');