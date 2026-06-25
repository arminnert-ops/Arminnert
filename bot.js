const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const http = require('http'); // Pancingan untuk Render

// KODE AMAN: Mengambil API Key dari menu Environment Variable di Render nanti
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// PANCINGAN PORT: Supaya Render tidak menganggap bot ini mati (Port Scan Timeout)
http.createServer((req, res) => {
    res.end('Bot Gemini WhatsApp Aktif!');
}).listen(process.env.PORT || 3000, () => {
    console.log("Pancingan web server aktif.");
});

async function hubungkanKeWhatsApp() {
    // Menyimpan sesi login agar tidak perlu scan QR terus-menerus
    const { state, saveCreds } = await useMultiFileAuthState('sesi_bot_gemini');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true // QR Code akan muncul di log Render
    });

    sock.ev.on('creds.update', saveCreds);

    // Memantau status koneksi
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const harusKonekUlang = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus, mencoba menghubungkan kembali...', harusKonekUlang);
            if (harusKonekUlang) hubungkanKeWhatsApp();
        } else if (connection === 'open') {
            console.log('Mantap! Bot WhatsApp Gemini AI sudah online!');
        }
    });

    // Memproses pesan masuk
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const nomorPengirim = msg.key.remoteJid;
        const teksMasuk = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!teksMasuk) return;

        console.log(`[Pesan Masuk] Dari: ${nomorPengirim} -> ${teksMasuk}`);

        // Beri tanda bahwa bot sedang mengetik...
        await sock.sendPresenceUpdate('composing', nomorPengirim);

        try {
            const urlAPI = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            
            const response = await fetch(urlAPI, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: teksMasuk }] }]
                })
            });

            const data = await response.json();
            const jawabanGemini = data.candidates[0].content.parts[0].text;

            // Mengirimkan jawaban kembali ke pengguna di WhatsApp
            await sock.sendMessage(nomorPengirim, { text: jawabanGemini });

        } catch (error) {
            console.error("Waduh, ada error saat menghubungi Gemini AI:", error);
            await sock.sendMessage(nomorPengirim, { text: "Maaf, otak AI saya sedang nge-blank sebentar. Coba lagi ya!" });
        }
    });
}

// Jalankan bot
hubungkanKeWhatsApp();
