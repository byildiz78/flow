const sqlite3 = require('sqlite3').verbose();
let db = null;

// Veritabanına bağlan
const connect = () => {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database('./database.sqlite', (err) => {
            if (err) {
                console.error('Veritabanına bağlanırken hata:', err);
                reject(err);
                return;
            }
            console.log('SQLite veritabanına bağlandı');
            resolve();
        });
    });
};

// SQL sorgusu çalıştır
const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        console.log('SQL çalıştırılıyor:', sql);
        console.log('Parametreler:', params);

        db.run(sql, params, function(err) {
            if (err) {
                console.error('SQL hatası:', err);
                reject(err);
                return;
            }
            console.log('SQL başarıyla çalıştırıldı, lastID:', this.lastID);
            resolve(this);
        });
    });
};

// Tek satır getir
const dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        console.log('SQL çalıştırılıyor:', sql);
        console.log('Parametreler:', params);

        db.get(sql, params, (err, row) => {
            if (err) {
                console.error('SQL hatası:', err);
                reject(err);
                return;
            }
            resolve(row);
        });
    });
};

// Çoklu satır getir
const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        console.log('SQL çalıştırılıyor:', sql);
        console.log('Parametreler:', params);

        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('SQL hatası:', err);
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
};

// Veritabanını başlat
const initializeDatabase = async () => {
    try {
        // Önce bağlantıyı oluştur
        await connect();

        // Tabloları kontrol et ve gerekirse oluştur
        console.log('Tablolar kontrol ediliyor...');

        // Emails tablosunu kontrol et
        const emailsTableExists = await dbGet("SELECT name FROM sqlite_master WHERE type='table' AND name='emails'");
        if (!emailsTableExists) {
            console.log('Emails tablosu oluşturuluyor...');
            await dbRun(`
                CREATE TABLE IF NOT EXISTS emails (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    from_address TEXT,
                    subject TEXT,
                    content TEXT,
                    received_date INTEGER,
                    webhook_status INTEGER DEFAULT 0,
                    flow_status INTEGER DEFAULT 0,
                    flagged INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('Emails tablosu oluşturuldu');
        } else {
            // Sütunları kontrol et
            const columns = await dbAll("PRAGMA table_info(emails)");
            console.log('Mevcut sütunlar:', columns);
            
            // flow_status sütununu kontrol et
            const flowStatusColumnExists = columns.some(col => col.name === 'flow_status');
            if (!flowStatusColumnExists) {
                console.log('Flow status sütunu ekleniyor...');
                await dbRun('ALTER TABLE emails ADD COLUMN flow_status INTEGER DEFAULT 0');
                console.log('Flow status sütunu eklendi');
            }

            // flagged sütununu kontrol et
            const flaggedColumnExists = columns.some(col => col.name === 'flagged');
            if (!flaggedColumnExists) {
                console.log('Flagged sütunu ekleniyor...');
                await dbRun('ALTER TABLE emails ADD COLUMN flagged INTEGER DEFAULT 0');
                console.log('Flagged sütunu eklendi');
            }
        }

        // Webhook logs tablosunu kontrol et
        const webhookLogsTableExists = await dbGet("SELECT name FROM sqlite_master WHERE type='table' AND name='webhook_logs'");
        if (!webhookLogsTableExists) {
            console.log('Webhook logs tablosu oluşturuluyor...');
            await dbRun(`
                CREATE TABLE IF NOT EXISTS webhook_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email_id INTEGER,
                    success INTEGER,
                    status_code INTEGER,
                    error_message TEXT,
                    response_data TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (email_id) REFERENCES emails(id)
                )
            `);
            console.log('Webhook logs tablosu oluşturuldu');
        }

        // Flow logs tablosunu kontrol et
        const flowLogsTableExists = await dbGet("SELECT name FROM sqlite_master WHERE type='table' AND name='flow_logs'");
        if (!flowLogsTableExists) {
            console.log('Flow logs tablosu oluşturuluyor...');
            await dbRun(`
                CREATE TABLE IF NOT EXISTS flow_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email_id INTEGER,
                    success INTEGER,
                    status_code INTEGER,
                    error_message TEXT,
                    response_data TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (email_id) REFERENCES emails(id)
                )
            `);
            console.log('Flow logs tablosu oluşturuldu');
        }

        console.log('Veritabanı başarıyla başlatıldı');
    } catch (error) {
        console.error('Veritabanı başlatılırken hata:', error);
        throw error;
    }
};

const addEmail = async (emailData) => {
    try {
        const query = `
            INSERT INTO emails (
                from_address, subject, content, received_date, flagged
            ) VALUES (?, ?, ?, ?, ?)
        `;
        
        await dbRun(query, [
            emailData.from_address,
            emailData.subject,
            emailData.content,
            emailData.received_date,
            emailData.flagged || 0
        ]);

        // Eklenen e-postanın ID'sini al
        const result = await dbGet('SELECT last_insert_rowid() as id');
        const emailId = result.id;

        // Eklenen e-postayı getir
        return await getEmailById(emailId);
    } catch (error) {
        console.error('E-posta eklenirken hata:', error);
        throw error;
    }
};

const updateWebhookStatus = async (emailId, status) => {
    try {
        // Convert status to integer if it's a string
        let statusInt;
        if (typeof status === 'boolean') {
            statusInt = status ? 1 : 0;
        } else if (status === 'pending') {
            statusInt = 2;
        } else {
            statusInt = parseInt(status);
        }

        await dbRun(
            'UPDATE emails SET webhook_status = ? WHERE id = ?',
            [statusInt, emailId]
        );
    } catch (error) {
        console.error('Error updating webhook status:', error);
        throw error;
    }
};

const getEmailHistory = async (page = 1, limit = 10, startDate = null, endDate = null) => {
    try {
        console.log('E-posta geçmişi getiriliyor...');
        
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT 
                e.*,
                COALESCE(
                    (SELECT success 
                     FROM webhook_logs 
                     WHERE email_id = e.id 
                     ORDER BY created_at DESC 
                     LIMIT 1
                    ), 
                    0
                ) as webhook_status
            FROM emails e
            WHERE 1=1
        `;
        
        const params = [];
        
        if (startDate) {
            // Başlangıç tarihini Unix timestamp'e çevir (milisaniye)
            const startTimestamp = new Date(startDate).getTime();
            query += ' AND received_date >= ?';
            params.push(startTimestamp);
        }
        
        if (endDate) {
            // Bitiş tarihini gün sonuna ayarla ve Unix timestamp'e çevir
            const endOfDay = new Date(endDate);
            endOfDay.setHours(23, 59, 59, 999);
            const endTimestamp = endOfDay.getTime();
            query += ' AND received_date <= ?';
            params.push(endTimestamp);
        }
        
        // Toplam kayıt sayısını al
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM emails e 
            WHERE 1=1
            ${startDate ? ' AND received_date >= ?' : ''}
            ${endDate ? ' AND received_date <= ?' : ''}
        `;
        
        const countResult = await dbGet(countQuery, params);
        const total = countResult.total;
        
        // Debug bilgileri
        console.log('Tarih parametreleri:', {
            startDate: startDate ? new Date(startDate).toISOString() : null,
            endDate: endDate ? new Date(endDate).toISOString() : null,
            startTimestamp: startDate ? new Date(startDate).getTime() : null,
            endTimestamp: endDate ? new Date(endDate + ' 23:59:59.999').getTime() : null
        });
        
        // Ana sorguyu tamamla
        query += `
            ORDER BY received_date DESC
            LIMIT ? OFFSET ?
        `;
        params.push(limit, offset);
        
        console.log('SQL Query:', query);
        console.log('Query Parameters:', params);
        
        const emails = await dbAll(query, params);
        console.log('Bulunan e-posta sayısı:', emails.length);
        if (emails.length > 0) {
            console.log('İlk e-posta tarihi:', new Date(emails[0].received_date).toISOString());
            console.log('Son e-posta tarihi:', new Date(emails[emails.length - 1].received_date).toISOString());
        }
        
        // E-posta tarihlerini ISO string formatına çevir
        emails.forEach(email => {
            email.received_date = new Date(parseInt(email.received_date)).toISOString();
        });
        
        return {
            emails,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    } catch (error) {
        console.error('E-posta geçmişi alınırken hata:', error);
        throw error;
    }
};

const getEmailCount = async ({ search = '', webhookStatus, date }) => {
    try {
        console.log('E-posta sayısı alınıyor...');
        console.log('Parametreler:', { search, webhookStatus, date });

        let query = `
            SELECT COUNT(*) as count 
            FROM emails e 
            WHERE 1=1
        `;
        
        const params = [];

        if (search) {
            query += ` AND (
                e.subject LIKE ? OR 
                e.from_address LIKE ? OR 
                e.content LIKE ?
            )`;
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam);
        }

        if (webhookStatus !== undefined) {
            query += ` AND (
                SELECT success 
                FROM webhook_logs 
                WHERE email_id = e.id 
                ORDER BY created_at DESC 
                LIMIT 1
            ) = ?`;
            params.push(webhookStatus);
        }

        if (date) {
            query += ` AND DATE(e.created_at) = DATE(?)`;
            params.push(date);
        }

        console.log('SQL sorgusu:', query);
        console.log('Parametreler:', params);

        const result = await dbGet(query, params);
        console.log('Toplam e-posta sayısı:', result.count);

        return result.count;
    } catch (error) {
        console.error('E-posta sayısı alınırken hata:', error);
        throw error;
    }
};

const getEmailById = async (id) => {
    try {
        console.log('E-posta aranıyor, ID:', id);
        
        const query = `
            SELECT 
                e.*,
                COALESCE(
                    (SELECT success 
                     FROM webhook_logs 
                     WHERE email_id = e.id 
                     ORDER BY created_at DESC 
                     LIMIT 1
                    ), 
                    2
                ) as webhook_status
            FROM emails e
            WHERE e.id = ?
        `;
        
        const email = await dbGet(query, [id]);
        console.log('E-posta sorgusu sonucu:', email);
        
        if (!email) {
            console.log('E-posta bulunamadı');
            return null;
        }

        return email;
    } catch (error) {
        console.error('E-posta aranırken hata:', error);
        throw error;
    }
};

const getFailedWebhooks = async () => {
    try {
        const webhooks = await dbAll(`
            SELECT e.* 
            FROM emails e 
            WHERE e.webhook_status = 0 
            ORDER BY e.received_date ASC
        `);
        return webhooks;
    } catch (error) {
        console.error('Error getting failed webhooks:', error);
        throw error;
    }
};

const logWebhookAttempt = async (emailId, success, statusCode, errorMessage = null, responseData = null) => {
    try {
        console.log('Webhook denemesi kaydediliyor...');
        console.log('Parametreler:', { emailId, success, statusCode, errorMessage });
        
        const query = `
            INSERT INTO webhook_logs (
                email_id, success, status_code, error_message, response_data
            ) VALUES (?, ?, ?, ?, ?)
        `;
        
        // responseData'yı string'e çevir
        let parsedResponseData = null;
        if (responseData) {
            try {
                // Eğer zaten string ise parse et ve tekrar stringify yap
                // Bu şekilde geçerli JSON olduğundan emin oluruz
                parsedResponseData = JSON.stringify(
                    typeof responseData === 'string' ? JSON.parse(responseData) : responseData
                );
            } catch (error) {
                console.error('Response data parse edilirken hata:', error);
                parsedResponseData = JSON.stringify({ error: 'Invalid JSON data', raw: responseData });
            }
        }
        
        await dbRun(query, [
            emailId,
            success ? 1 : 0,
            statusCode,
            errorMessage,
            parsedResponseData
        ]);
        
        console.log('Webhook denemesi kaydedildi');

        // Update email webhook status
        await updateWebhookStatus(emailId, success);
    } catch (error) {
        console.error('Webhook denemesi kaydedilirken hata:', error);
        throw error;
    }
};

const logFlowAttempt = async (emailId, success, statusCode, errorMessage = null, responseData = null) => {
    try {
        console.log('Flow log kaydediliyor...');
        console.log('Parametreler:', { emailId, success, statusCode, errorMessage, responseData });
        
        // responseData'nın string olduğundan emin ol
        let responseDataStr = null;
        if (responseData) {
            responseDataStr = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
        }
        
        const query = `
            INSERT INTO flow_logs (
                email_id, success, status_code, error_message, response_data
            ) VALUES (?, ?, ?, ?, ?)
        `;
        
        await dbRun(query, [
            emailId,
            success ? 1 : 0,
            statusCode,
            errorMessage,
            responseDataStr
        ]);
        
        console.log('Flow log kaydedildi');
    } catch (error) {
        console.error('Flow log kaydedilirken hata:', error);
        throw error;
    }
};

// Flow loglarını getir
const getFlowLogs = async (emailId) => {
    try {
        console.log('Flow logları getiriliyor...');
        
        const query = `
            SELECT 
                id,
                email_id,
                success,
                status_code,
                error_message,
                response_data,
                datetime(created_at, 'localtime') as created_at
            FROM flow_logs
            WHERE email_id = ?
            ORDER BY created_at DESC
        `;
        
        const logs = await dbAll(query, [emailId]);
        console.log('Flow log sayısı:', logs.length);
        
        // Response data'yı parse et
        return logs.map(log => {
            try {
                return {
                    ...log,
                    success: log.success === 1,
                    response_data: log.response_data ? JSON.parse(log.response_data) : null
                };
            } catch (error) {
                console.error('Log verisi parse edilirken hata:', error);
                return {
                    ...log,
                    success: log.success === 1,
                    response_data: log.response_data // Parse edilemeyen veriyi ham halde döndür
                };
            }
        });
    } catch (error) {
        console.error('Flow logları alınırken hata:', error);
        throw error;
    }
};

const clearDatabase = async () => {
    try {
        await dbRun('DELETE FROM webhook_logs');
        await dbRun('DELETE FROM flow_logs');
        await dbRun('DELETE FROM emails');
        await dbRun('VACUUM');
    } catch (error) {
        console.error('Error clearing database:', error);
        throw error;
    }
};

// Tüm e-postaları getir
const getAllEmails = async () => {
    try {
        console.log('Tüm e-postalar getiriliyor...');
        
        const query = `
            SELECT 
                e.*,
                COALESCE(
                    (SELECT success 
                     FROM webhook_logs 
                     WHERE email_id = e.id 
                     ORDER BY created_at DESC 
                     LIMIT 1
                    ), 
                    0
                ) as webhook_status
            FROM emails e
            ORDER BY received_date DESC
        `;
        
        const emails = await dbAll(query);
        console.log('Bulunan e-posta sayısı:', emails.length);
        
        return emails;
    } catch (error) {
        console.error('Tüm e-postalar alınırken hata:', error);
        throw error;
    }
};

const getWebhookLogs = async (emailId) => {
    try {
        console.log('Webhook logları getiriliyor...');
        
        const query = `
            SELECT 
                id,
                email_id,
                success,
                status_code,
                error_message,
                response_data,
                datetime(created_at, 'localtime') as created_at
            FROM webhook_logs
            WHERE email_id = ?
            ORDER BY created_at DESC
        `;
        
        const logs = await dbAll(query, [emailId]);
        console.log('Webhook log sayısı:', logs.length);
        
        // Response data'yı parse et
        return logs.map(log => {
            try {
                return {
                    ...log,
                    success: log.success === 1,
                    response_data: log.response_data ? JSON.parse(log.response_data) : null
                };
            } catch (error) {
                console.error('Log verisi parse edilirken hata:', error);
                return {
                    ...log,
                    success: log.success === 1,
                    response_data: {
                        error: 'JSON parse error',
                        raw: log.response_data
                    }
                };
            }
        });
    } catch (error) {
        console.error('Webhook logları alınırken hata:', error);
        throw error;
    }
};

// Flow durumunu güncelle
const updateFlowStatus = async (emailId, status) => {
    try {
        // Convert status to integer if it's not
        const statusInt = parseInt(status);
        
        await dbRun(
            'UPDATE emails SET flow_status = ? WHERE id = ?',
            [statusInt, emailId]
        );
        
        return true;
    } catch (error) {
        console.error('Flow durumu güncellenirken hata:', error);
        throw error;
    }
};

module.exports = {
    initializeDatabase,
    addEmail,
    getEmailHistory,
    getEmailCount,
    getEmailById,
    getFailedWebhooks,
    logWebhookAttempt,
    logFlowAttempt,
    getFlowLogs,
    clearDatabase,
    getAllEmails,
    getWebhookLogs,
    updateWebhookStatus,
    updateFlowStatus
};
