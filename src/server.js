const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const dotenv = require('dotenv');
const db = require('./db');
const MailListener = require('./mail-listener');
const FlowSender = require('./flow-sender');
const sharedsession = require('express-socket.io-session');
const session = require('express-session');
const axios = require('axios');
const FormData = require('form-data');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
app.use(express.json());

// Session middleware
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
});

app.use(sessionMiddleware);

// Initialize database and start server
const startServer = async () => {
    try {
        // Veritabanını başlat
        await db.initializeDatabase();
        console.log('Veritabanı başlatıldı');

        // Create HTTP server
        const server = http.createServer(app);

        // Initialize Socket.IO
        const io = new Server(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        // Share session with socket.io
        io.use(sharedsession(sessionMiddleware, {
            autoSave: true
        }));

        // Flow sender'ı başlat
        const flowSender = new FlowSender(io);

        // Mail listener'ı başlat
        const mailListener = new MailListener({
            email: process.env.EMAIL,
            password: process.env.EMAIL_PASSWORD,
            imap_host: process.env.IMAP_HOST,
            imap_port: process.env.IMAP_PORT
        }, db, io);
        
        try {
            await mailListener.connect();
            console.log('Mail listener başarıyla başlatıldı');
        } catch (error) {
            console.error('Mail listener başlatılırken hata:', error);
        }

        // Serve static files
        app.use(express.static(path.join(__dirname, '../public')));

        // Mail listener error handling
        mailListener.on('error', (error) => {
            console.error('Mail listener error:', error);
        });

        // API endpoint to get application config
        app.get('/api/config', (req, res) => {
            res.json({
                flowUrl: process.env.FLOW_URL
            });
        });

        // E-posta listesi endpoint'i
        app.get('/api/emails', async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 10;
                const startDate = req.query.startDate || null;
                const endDate = req.query.endDate || null;

                console.log('API isteği alındı:', {
                    page,
                    limit,
                    startDate,
                    endDate,
                    rawStartDate: req.query.startDate,
                    rawEndDate: req.query.endDate
                });

                const result = await db.getEmailHistory(page, limit, startDate, endDate);
                res.json({ success: true, ...result });
            } catch (error) {
                console.error('E-posta geçmişi alınırken hata:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get email details
        app.get('/api/emails/:id', async (req, res) => {
            try {
                const email = await db.getEmailById(req.params.id);
                if (!email) {
                    return res.status(404).json({
                        success: false,
                        error: 'E-posta bulunamadı'
                    });
                }
                
                res.json({
                    success: true,
                    email: email
                });
            } catch (error) {
                console.error('E-posta detayları alınırken hata:', error);
                res.status(500).json({
                    success: false,
                    error: 'E-posta detayları alınırken hata oluştu'
                });
            }
        });

        // API endpoint to send email to Flow
        app.post('/api/emails/:id/send-to-flow', async (req, res) => {
            try {
                const emailId = req.params.id;
                console.log('Flow\'a gönderim isteği alındı, emailId:', emailId);

                const email = await db.getEmailById(emailId);
                if (!email) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'E-posta bulunamadı' 
                    });
                }

                // Flow URL'yi kontrol et
                if (!process.env.FLOW_URL) {
                    return res.status(500).json({
                        success: false,
                        error: 'Flow URL tanımlanmamış'
                    });
                }

                console.log('Flow\'a gönderilecek e-posta:', {
                    id: email.id,
                    from: email.from_address,
                    subject: email.subject
                });

                const result = await flowSender.sendToFlow(email);
                res.json(result);
            } catch (error) {
                console.error('Flow\'a gönderim hatası:', error);
                res.status(500).json({ 
                    success: false, 
                    error: 'Flow\'a gönderim başarısız',
                    details: error.message 
                });
            }
        });

        // API endpoint to get flow logs for an email
        app.get('/api/emails/:id/flow-logs', async (req, res) => {
            try {
                console.log('Flow logları isteniyor, emailId:', req.params.id);
                const logs = await db.getFlowLogs(req.params.id);
                res.json({ success: true, logs });
            } catch (error) {
                console.error('Flow logları alınırken hata:', error);
                res.status(500).json({ 
                    success: false, 
                    error: 'Flow logları alınamadı' 
                });
            }
        });

        // Start server
        const port = process.env.PORT || 3000;
        server.listen(port, () => {
            console.log(`Server ${port} portunda çalışıyor`);
        });

    } catch (error) {
        console.error('Server başlatılırken hata:', error);
        process.exit(1);
    }
};

startServer();

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM sinyali alındı. Server kapatılıyor...');
    server.close(() => {
        console.log('Server kapatıldı');
        process.exit(0);
    });
});
