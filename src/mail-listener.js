const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { EventEmitter } = require('events');
const db = require('./db');

class MailListener extends EventEmitter {
    constructor(config, db, io) {
        super();
        this.config = config;
        this.db = db;
        this.io = io;
        this.imap = null;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.imap = new Imap({
                user: this.config.email,
                password: this.config.password,
                host: this.config.imap_host,
                port: this.config.imap_port,
                tls: true,
                tlsOptions: { rejectUnauthorized: false }
            });

            this.imap.once('ready', () => {
                console.log('IMAP bağlantısı hazır');
                this.startListening();
                resolve();
            });

            this.imap.once('error', (err) => {
                console.error('IMAP hatası:', err);
                this.emit('error', err);
                reject(err);
            });

            this.imap.once('end', () => {
                console.log('IMAP bağlantısı sonlandı');
            });

            this.imap.connect();
        });
    }

    startListening() {
        this.imap.openBox('INBOX', false, (err, box) => {
            if (err) {
                console.error('Inbox açılırken hata:', err);
                return;
            }

            // Yeni e-postaları dinle
            this.imap.on('mail', () => {
                this.processNewEmails();
            });

            // Mevcut e-postaları işle
            this.processNewEmails();
        });
    }

    async processNewEmails() {
        try {
            const messages = await this.fetchNewEmails();
            for (const message of messages) {
                try {
                    const email = await this.parseEmail(message);
                    const savedEmail = await db.addEmail(email);
                    console.log('Yeni e-posta kaydedildi:', savedEmail.id);
                    
                    // Socket.io ile bildirim gönder
                    this.io.emit('new_email', savedEmail);
                } catch (error) {
                    console.error('E-posta işlenirken hata:', error);
                }
            }
        } catch (error) {
            console.error('E-postalar işlenirken hata:', error);
        }
    }

    fetchNewEmails() {
        return new Promise((resolve, reject) => {
            this.imap.search(['UNSEEN'], (err, results) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (!results || results.length === 0) {
                    resolve([]);
                    return;
                }

                const fetch = this.imap.fetch(results, {
                    bodies: '',
                    markSeen: true
                });

                const messages = [];

                fetch.on('message', (msg) => {
                    const message = {};
                    msg.on('body', (stream) => {
                        message.stream = stream;
                    });
                    messages.push(message);
                });

                fetch.once('error', (err) => {
                    reject(err);
                });

                fetch.once('end', () => {
                    resolve(messages);
                });
            });
        });
    }

    async parseEmail(message) {
        return new Promise((resolve, reject) => {
            message.stream.pipe(simpleParser())
                .then(parsed => {
                    resolve({
                        from_address: parsed.from.text,
                        subject: parsed.subject,
                        content: parsed.text || parsed.html,
                        received_date: parsed.date.getTime(),
                        flagged: 0
                    });
                })
                .catch(reject);
        });
    }

    disconnect() {
        if (this.imap && this.imap.state !== 'disconnected') {
            this.imap.end();
        }
    }
}

module.exports = MailListener;
