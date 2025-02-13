const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

// Örnek kayıtları göster
db.all('SELECT received_date FROM emails ORDER BY received_date DESC LIMIT 5', [], (err, rows) => {
    if (err) {
        console.error('Hata:', err);
        return;
    }
    console.log('Veritabanındaki tarih örnekleri:');
    rows.forEach(row => {
        console.log(row.received_date);
    });

    // Test sorgusu
    const startDate = '2025-02-11 21:00:00.000';
    const endDate = '2025-02-14 20:59:59.999';
    
    const query = `
        SELECT COUNT(*) as count 
        FROM emails 
        WHERE received_date >= ? 
        AND received_date <= ?
    `;
    
    db.get(query, [startDate, endDate], (err, result) => {
        if (err) {
            console.error('Sorgu hatası:', err);
            return;
        }
        console.log('\nBasit tarih sorgusu sonucu:', result);
        
        // strftime ile test
        const strftimeQuery = `
            SELECT COUNT(*) as count 
            FROM emails 
            WHERE strftime('%s', received_date) >= strftime('%s', ?)
            AND strftime('%s', received_date) <= strftime('%s', ?)
        `;
        
        db.get(strftimeQuery, [startDate, endDate], (err, strftimeResult) => {
            if (err) {
                console.error('strftime sorgu hatası:', err);
                return;
            }
            console.log('strftime ile sorgu sonucu:', strftimeResult);
            
            // Tüm kayıtların tarih aralığını göster
            db.get('SELECT MIN(received_date) as min_date, MAX(received_date) as max_date FROM emails', [], (err, range) => {
                if (err) {
                    console.error('Tarih aralığı sorgu hatası:', err);
                    return;
                }
                console.log('\nTüm kayıtların tarih aralığı:');
                console.log('En eski:', range.min_date);
                console.log('En yeni:', range.max_date);
                
                db.close();
            });
        });
    });
});
