import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, getDoc, doc, query, orderBy } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, process.env.FIREBASE_DATABASE_ID || "(default)");

const MANIFEST_PATH = './jsons/data_manifest.json';
const JSONS_DIR = './jsons';

async function sync() {
    console.log('🚀 Starting Data Sync...');

    if (!fs.existsSync(JSONS_DIR)) {
        fs.mkdirSync(JSONS_DIR);
    }

    let manifest = [];
    if (fs.existsSync(MANIFEST_PATH)) {
        manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    }

    try {
        console.log('📡 Fetching version metadata...');
        const verDoc = await getDoc(doc(db, "system_metadata", "versions"));
        if (!verDoc.exists()) {
            throw new Error('Could not find system_metadata/versions in Firestore.');
        }

        const serverVersions = verDoc.data();
        console.log('Current Server Versions:', serverVersions);

        // Sync each type independently
        await syncCollection({
            type: 'rules',
            collectionName: 'rules_sections',
            serverVersion: serverVersions.rulesVersion,
            manifest,
            queryConstraints: [orderBy("order")]
        });

        await syncCollection({
            type: 'units',
            collectionName: 'army_units',
            serverVersion: serverVersions.unitsVersion,
            manifest
        });

        await syncCollection({
            type: 'cards',
            collectionName: 'tactical_cards',
            serverVersion: serverVersions.cardsVersion,
            manifest
        });

        // Update Manifest
        fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
        console.log('✅ Manifest updated.');

    } catch (error) {
        console.error('❌ Sync failed:', error.message);
        process.exit(1);
    }
}

async function syncCollection({ type, collectionName, serverVersion, manifest, queryConstraints = [] }) {
    const latest = manifest.filter(e => e.type === type).sort((a, b) => b.version - a.version)[0];

    if (latest && latest.version >= serverVersion) {
        console.log(`ℹ️  ${type.charAt(0).toUpperCase() + type.slice(1)} is up to date (v${serverVersion}).`);
        return;
    }

    console.log(`📥 Downloading ${type} v${serverVersion}...`);
    const q = query(collection(db, collectionName), ...queryConstraints);
    const snapshot = await getDocs(q);
    
    const data = [];
    snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

    const fileName = `${type}_cache_data_v${serverVersion}.json`;
    fs.writeFileSync(path.join(JSONS_DIR, fileName), JSON.stringify(data, null, 2));

    manifest.push({
        type,
        version: serverVersion,
        file: fileName,
        date: getCurrentTimestamp()
    });
    console.log(`💾 Saved ${fileName}`);
}

function getCurrentTimestamp() {
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${YYYY}-${MM}-${DD} ${hh}:${mm}`;
}

sync();
