require('dotenv').config();
const { ImapFlow } = require('imapflow');
const dns = require('dns');
const net = require('net');

// First, let's try to resolve the hostname
async function testDNS() {
    console.log('\nTesting DNS resolution...');
    try {
        const addresses = await dns.promises.resolve4(process.env.IMAP_HOST);
        console.log('DNS resolution successful:', addresses);
        return addresses;
    } catch (err) {
        console.error('DNS resolution failed:', err);
        return [];
    }
}

// Test direct TCP connection
async function testTCP(host, port) {
    console.log(`\nTesting direct TCP connection to ${host}:${port}...`);
    return new Promise((resolve) => {
        const socket = new net.Socket();
        
        socket.setTimeout(5000); // 5 second timeout
        
        socket.on('connect', () => {
            console.log('TCP connection successful!');
            socket.end();
            resolve(true);
        });
        
        socket.on('timeout', () => {
            console.log('TCP connection timed out');
            socket.destroy();
            resolve(false);
        });
        
        socket.on('error', (err) => {
            console.log('TCP connection error:', err.message);
            resolve(false);
        });
        
        socket.connect(port, host);
    });
}

// Test IMAP connection with different TLS versions
async function testIMAP(tlsVersion) {
    console.log(`\nTesting IMAP connection with ${tlsVersion}...`);
    
    const client = new ImapFlow({
        host: process.env.IMAP_HOST,
        port: parseInt(process.env.IMAP_PORT),
        secure: true,
        auth: {
            user: process.env.EMAIL,
            pass: process.env.EMAIL_PASSWORD
        },
        tls: {
            rejectUnauthorized: false,
            minVersion: tlsVersion,
            maxVersion: tlsVersion
        },
        logger: false
    });

    try {
        await client.connect();
        console.log(`IMAP connection successful with ${tlsVersion}!`);
        await client.logout();
        return true;
    } catch (err) {
        console.log(`IMAP connection failed with ${tlsVersion}:`, err.message);
        return false;
    }
}

async function runTests() {
    // Test DNS resolution
    const addresses = await testDNS();
    
    // Test TCP connection to each IP
    for (const ip of addresses) {
        await testTCP(ip, process.env.IMAP_PORT);
    }
    
    // Test TCP connection to hostname
    await testTCP(process.env.IMAP_HOST, process.env.IMAP_PORT);
    
    // Test IMAP with different TLS versions
    const tlsVersions = ['TLSv1', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3'];
    for (const version of tlsVersions) {
        await testIMAP(version);
    }
}

runTests().catch(console.error);
