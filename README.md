# Webhook Forwarder

E-posta hesabınızı IMAP üzerinden dinleyerek gelen e-postaları belirlediğiniz webhook adresine ileten ve işlemleri web arayüzünden takip etmenizi sağlayan bir uygulama.

## Özellikler

- IMAP üzerinden e-posta dinleme
- Gelen e-postaları webhook adresine iletme
- Real-time web arayüzü ile işlem takibi
- E-posta geçmişi ve webhook durum takibi
- İstatistikler (toplam e-posta, başarı oranı)

## Kurulum

1. Repoyu klonlayın:
```bash
git clone https://github.com/yourusername/webhookforwarder.git
cd webhookforwarder
```

2. Bağımlılıkları yükleyin:
```bash
npm install
```

3. `.env` dosyasını düzenleyin:
```env
EMAIL=your_email@example.com
EMAIL_PASSWORD=your_email_password
IMAP_HOST=outlook.office365.com
IMAP_PORT=993
WEBHOOK_URL=your_webhook_url_here
```

Not: Office365 kullanıyorsanız, "Uygulama Şifreleri" özelliğini kullanmanız gerekebilir. Bunun için:
1. Office365 hesap ayarlarından "Güvenlik" > "Gelişmiş güvenlik" > "Uygulama şifreleri" bölümüne gidin
2. Yeni bir uygulama şifresi oluşturun
3. Oluşturulan şifreyi `EMAIL_PASSWORD` olarak kullanın

## Çalıştırma

Geliştirme modunda çalıştırmak için:
```bash
npm run dev
```

Production modunda çalıştırmak için:
```bash
npm start
```

Uygulama varsayılan olarak `http://localhost:3000` adresinde çalışacaktır.

## Web Arayüzü

Web arayüzünde aşağıdaki bilgileri görebilirsiniz:

- Bağlantı durumu
- Toplam e-posta sayısı
- Webhook başarı oranı
- E-posta geçmişi
  - Alınma tarihi
  - Gönderen
  - Konu
  - Webhook durumu
  - Deneme sayısı
  - Son yanıt kodu

## Webhook Format

Webhook adresine gönderilen POST isteğinin içeriği:

```json
{
  "subject": "E-posta konusu",
  "from": "gönderen@example.com",
  "date": "2024-02-12T09:00:00.000Z",
  "content": "E-posta içeriği"
}
```

## Lisans

MIT
