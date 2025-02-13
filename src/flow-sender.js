const { EventEmitter } = require('events');
const axios = require('axios');
const db = require('./db');

class FlowSender extends EventEmitter {
    constructor(io) {
        super();
        this.io = io;
    }

    async sendToFlow(email) {
        console.log('Flow\'a gönderiliyor:', {
            id: email.id,
            subject: email.subject
        });

        try {
            if (!process.env.FLOW_URL) {
                throw new Error('FLOW_URL tanımlanmamış');
            }

            // Flow'a gönderilecek veriyi hazırla
            const flowData = {
                entityTypeId: "1036",
                fields: {
                    title: email.subject || 'Konu Yok',
                    ufCrm6_1734677556654: email.content || '',
                    opened: "N",
                    ufCrm6_1735552809: "",
                    contactId: "2262"
                }
            };

            console.log('Flow\'a gönderilecek veri:', JSON.stringify(flowData, null, 2));

            // Flow'a gönder
            const flowResponse = await axios.post(process.env.FLOW_URL, flowData, {
                headers: {
                    'Content-Type': 'application/json'
                },
                validateStatus: false // Tüm HTTP durum kodlarını kabul et
            });

            console.log('Flow yanıtı:', {
                status: flowResponse.status,
                statusText: flowResponse.statusText,
                data: flowResponse.data
            });

            // Başarı durumunu kontrol et
            const isSuccess = flowResponse.status >= 200 && flowResponse.status < 300;

            // Log kaydı
            await db.logFlowAttempt(
                email.id,
                isSuccess,
                flowResponse.status,
                isSuccess ? null : flowResponse.statusText,
                JSON.stringify(flowResponse.data)
            );

            // Socket.io ile bildirim gönder
            this.io.emit('flow_status', {
                emailId: email.id,
                success: isSuccess,
                message: isSuccess ? 'Flow\'a başarıyla gönderildi' : 'Flow\'a gönderim başarısız'
            });

            if (!isSuccess) {
                throw new Error(`Flow yanıtı başarısız: ${flowResponse.status} - ${flowResponse.statusText}`);
            }

            return {
                success: true,
                message: 'Flow\'a başarıyla gönderildi',
                response: flowResponse.data
            };

        } catch (error) {
            console.error('Flow\'a gönderim hatası:', error);

            // Hata durumunda log tut
            await db.logFlowAttempt(
                email.id,
                false,
                error.response?.status || 500,
                error.message,
                error.response?.data ? JSON.stringify(error.response.data) : null
            );

            // Socket.io ile hata bildirimi gönder
            this.io.emit('flow_error', {
                emailId: email.id,
                error: error.message
            });

            throw error;
        }
    }
}

module.exports = FlowSender;
