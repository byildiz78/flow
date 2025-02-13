const axios = require('axios');
const db = require('./db');
const { EventEmitter } = require('events');

class WebhookSender extends EventEmitter {
    constructor(io) {
        super();
        this.io = io;
        this.queue = [];
        this.processing = false;
    }

    async addToQueue(email) {
        console.log('E-posta webhook kuyruğuna ekleniyor:', email.id);
        this.queue.push(email);
        
        // Emit event
        this.emit('webhook_queued', { email });
        
        if (!this.processing) {
            await this.processQueue();
        }
    }

    async processQueue() {
        if (this.queue.length === 0) {
            console.log('İşlenecek e-posta yok');
            this.processing = false;
            return;
        }

        this.processing = true;
        const email = this.queue.shift();

        try {
            console.log('E-posta işleniyor:', email.id);

            // Webhook URL ve Flow URL kontrolü
            const webhookUrl = process.env.WEBHOOK_URL;
            const flowUrl = process.env.FLOW_URL;

            if (!webhookUrl && !flowUrl) {
                throw new Error('Ne Webhook URL ne de Flow URL tanımlanmamış');
            }

            // E-posta içeriğini hazırla
            const emailData = {
                from: email.from_address,
                subject: email.subject,
                content: email.content,
                receivedDate: email.received_date
            };

            // Webhook gönderimi
            if (webhookUrl) {
                console.log('Webhook gönderimi başlatılıyor:', email.id);
                const webhookResponse = await axios.post(webhookUrl, emailData, {
                    headers: { 'Content-Type': 'application/json' }
                });

                console.log('Webhook başarıyla gönderildi:', email.id);
                await this.logAttempt(email.id, 'webhook', true, webhookResponse.status, null, JSON.stringify(webhookResponse.data));
                this.emitSuccess('webhook', email, webhookResponse.data);
            }

            // Flow gönderimi
            if (flowUrl) {
                console.log('Flow gönderimi başlatılıyor:', email.id);
                const flowResponse = await axios.post(flowUrl, emailData, {
                    headers: { 'Content-Type': 'application/json' }
                });

                console.log('Flow başarıyla gönderildi:', email.id);
                await this.logAttempt(email.id, 'flow', true, flowResponse.status, null, JSON.stringify(flowResponse.data));
                this.emitSuccess('flow', email, flowResponse.data);
            }

        } catch (error) {
            console.error('Gönderim sırasında hata:', error);
            const errorResponse = error.response?.data ? JSON.stringify(error.response.data) : null;
            const type = error.config?.url === process.env.FLOW_URL ? 'flow' : 'webhook';
            
            await this.logAttempt(
                email.id,
                type,
                false,
                error.response?.status || 500,
                error.message,
                errorResponse
            );

            this.emitError(type, email, error);
        }

        // Kuyruktaki diğer e-postaları işle
        await this.processQueue();
    }

    async logAttempt(emailId, type, success, status, errorMessage, responseData) {
        if (type === 'webhook') {
            await db.logWebhookAttempt(emailId, success, status, errorMessage, responseData);
        } else {
            await db.logFlowAttempt(emailId, success, status, errorMessage, responseData);
        }
    }

    emitSuccess(type, email, response) {
        const eventData = {
            emailId: email.id,
            status: 'delivered',
            response: response
        };

        this.emit(`${type}_success`, { email, response });
        this.io.emit(`${type}_success`, eventData);
    }

    emitError(type, email, error) {
        const eventData = {
            emailId: email.id,
            status: 'failed',
            error: error.message
        };

        this.emit(`${type}_error`, { email, error });
        this.io.emit(`${type}_error`, eventData);
    }
}

module.exports = WebhookSender;
