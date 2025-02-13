require('dotenv').config();
const Imap = require('node-imap');
const tls = require('tls');

console.log('Testing IMAP connection with settings:', {
    user: process.env.EMAIL,
    host: process.env.IMAP_HOST,
    port: process.env.IMAP_PORT,
    tls: true
});

const imap = new Imap({
    user: process.env.EMAIL,
    password: process.env.EMAIL_PASSWORD,
    host: process.env.IMAP_HOST,
    port: 993,
    tls: true,
    tlsOptions: { 
        rejectUnauthorized: false,
        enableTrace: true,
        minVersion: 'TLSv1',
        maxVersion: 'TLSv1.3',
        ciphers: 'ALL:!ADH:!LOW:!EXP:!MD5:@STRENGTH'
    },
    debug: (info) => {
        console.log('IMAP Debug:', info);
    },
    connTimeout: 30000,  
    authTimeout: 30000
});

imap.once('ready', () => {
    console.log('Successfully connected to IMAP server!');
    imap.openBox('INBOX', false, (err, box) => {
        if (err) {
            console.error('Error opening inbox:', err);
            imap.end();
            return;
        }
        console.log('Inbox opened successfully!');
        imap.end();
    });
});

imap.once('error', (err) => {
    console.error('IMAP connection error:', err);
    if (err.code === 'ETIMEDOUT') {
        console.log('Connection timed out. This might be due to:');
        console.log('1. Server blocking connections');
        console.log('2. Firewall issues');
        console.log('3. VPN or proxy requirements');
    }
    process.exit(1);
});

imap.once('end', () => {
    console.log('Connection ended');
});

console.log('Attempting to connect...');
imap.connect();
