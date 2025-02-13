require('dotenv').config();
const { ImapFlow } = require('imapflow');

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
        enableTrace: true,
        minVersion: 'TLSv1'
    },
    logger: {
        info: console.log,
        debug: console.log,
        error: console.error
    }
});

async function test() {
    console.log('Connecting with settings:', {
        host: process.env.IMAP_HOST,
        port: process.env.IMAP_PORT,
        user: process.env.EMAIL,
        secure: true
    });

    try {
        // Wait until client connects and authorizes
        await client.connect();
        console.log('Connected successfully!');

        // Select and lock a mailbox. Throws if mailbox does not exist
        let lock = await client.getMailboxLock('INBOX');
        try {
            console.log('Opened INBOX');
            
            // List latest 10 messages
            for await (let message of client.fetch('1:10', { envelope: true })) {
                console.log(`Message ${message.seq} - Subject: ${message.envelope.subject}`);
            }
        } finally {
            // Make sure lock is released, otherwise next `getMailboxLock()` never returns
            lock.release();
        }

        // Log out and close connection
        await client.logout();
    } catch (err) {
        console.error('Error occurred:', err);
        process.exit(1);
    }
}

test();
