const net = require('net');
const tls = require('tls');
require('dotenv').config();

async function testPOP3Connection() {
    console.log('Testing POP3 connection with settings:', {
        host: process.env.IMAP_HOST,
        port: process.env.IMAP_PORT,
        user: process.env.EMAIL
    });

    return new Promise((resolve, reject) => {
        const socket = new tls.connect({
            host: process.env.IMAP_HOST,
            port: process.env.IMAP_PORT,
            rejectUnauthorized: false,
            enableTrace: true,
        });

        let responseData = '';

        socket.on('secureConnect', () => {
            console.log('Connected to server!');
            console.log('Authorization: Sending username...');
            socket.write(`USER ${process.env.EMAIL}\r\n`);
        });

        socket.on('data', (data) => {
            responseData += data.toString();
            console.log('Server response:', data.toString().trim());

            if (responseData.includes('+OK')) {
                if (!responseData.includes('PASS')) {
                    console.log('Sending password...');
                    socket.write(`PASS ${process.env.EMAIL_PASSWORD}\r\n`);
                } else {
                    console.log('Successfully authenticated!');
                    socket.write('QUIT\r\n');
                    socket.end();
                    resolve(true);
                }
            } else if (responseData.includes('-ERR')) {
                console.error('Server returned error');
                socket.end();
                resolve(false);
            }
        });

        socket.on('error', (err) => {
            console.error('Connection error:', err);
            resolve(false);
        });

        socket.on('timeout', () => {
            console.log('Connection timed out');
            socket.end();
            resolve(false);
        });

        socket.setTimeout(10000); // 10 second timeout
    });
}

testPOP3Connection().catch(console.error);
