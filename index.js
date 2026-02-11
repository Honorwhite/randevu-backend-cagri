require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const axios = require('axios');

const app = express();
app.set('trust proxy', 1); // Güvenlik duvarı veya proxy arkasında çalışıyorsa gerekli (Heroku, Vercel, Nginx vb.)
const PORT = process.env.PORT || 3000;

const cors = require('cors');

// reCAPTCHA secret key
const RECAPTCHA_SECRET_KEY = '6Lejz2csAAAAAPJXiC-hg-IVW2AxiYyIRFZedqa1';

const CORS_ORIGIN = (process.env.CORS_ORIGIN || '').trim();

const allowedOrigins = [
  'https://drcagriyapar.com',
  'https://www.drcagriyapar.com',
  'http://localhost:3000',
  'http://localhost:5173'
];

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1 || CORS_ORIGIN === '*') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['X-Requested-With', 'Content-Type', 'Authorization', 'Accept']
}));

// Middleware
app.use(express.json());

// IP başına günde 3 istek ile sınırlama yapan rate limiter
const apiLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 saat (1 gün)
  max: 10, // IP başına maksimum 10 istek (hata yapma ihtimaline karşı artırıldı)
  message: {
    success: false,
    message: 'Çok fazla istek yaptınız. Lütfen 24 saat sonra tekrar deneyin.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// reCAPTCHA v3 doğrulama fonksiyonu
async function verifyRecaptchaV3(captchaToken) {
  try {
    const response = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      {
        params: {
          secret: RECAPTCHA_SECRET_KEY,
          response: captchaToken
        }
      }
    );

    const data = response.data;

    // v3 puanı kontrol et (0.0 - 1.0 arası)
    if (data.success && data.score !== undefined) {
      // 0.5'in üzerindeki skorlar genellikle insan olarak kabul edilir
      // Ancak güvenliği artırmak için eşiği yükseltebilirsiniz
      console.log(`reCAPTCHA Skoru: ${data.score}, Eylem: ${data.action}`);
      return {
        success: data.score >= 0.5,
        score: data.score,
        action: data.action
      };
    }

    return {
      success: false,
      score: 0,
      action: null
    };
  } catch (error) {
    console.error('reCAPTCHA doğrulama hatası:', error);
    return {
      success: false,
      score: 0,
      action: null
    };
  }
}

// E-posta gönderme fonksiyonu
async function sendEmail(formData) {
  // E-posta taşıyıcısı oluşturma
  const transporter = nodemailer.createTransport({
    host: 'smtp.yandex.ru',
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });

  // Konu/Hizmet metni kontrolü
  const konuHtml = formData.konu ?
    `<tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; color: #1a2e18;">Konu / Hizmet</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${formData.konu}</td>
    </tr>` : '';

  // Mesaj metni kontrolü
  const mesajHtml = formData.mesaj ?
    `<tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; color: #1a2e18;">Mesaj</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${formData.mesaj}</td>
    </tr>` : '';

  // E-posta varsa HTML
  const emailHtml = formData.email ?
    `<tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; color: #1a2e18;">E-posta</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee;"><a href="mailto:${formData.email}" style="color: #1a2e18; text-decoration: none;">${formData.email}</a></td>
    </tr>` : '';

  // Tarih varsa HTML
  const tarihHtml = formData.tarih ?
    `<tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; color: #1a2e18;">Tarih</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${formData.tarih}</td>
    </tr>` : '';

  // HTML E-posta içeriği
  const mailOptions = {
    from: `"Dr. Çağrı Yapar Randevu" <${process.env.EMAIL_USER}>`,
    to: process.env.RECIPIENT_EMAIL,
    subject: `Yeni Randevu/İletişim Talebi - ${formData.adSoyad}`,
    html: `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Yeni Randevu Talebi</title>
      <style>
        body {
          font-family: 'Outfit', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #1a2e18;
          margin: 0;
          padding: 0;
          background-color: #f4faeb;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          text-align: center;
          padding: 30px 0;
          background-color: #1a2e18;
          border-radius: 20px 20px 0 0;
        }
        .title {
          color: #c1e685;
          font-size: 24px;
          font-weight: bold;
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .subtitle {
          color: #ffffff;
          font-size: 14px;
          opacity: 0.8;
          margin-top: 5px;
        }
        .content {
          background-color: white;
          padding: 25px;
          border-radius: 0 0 20px 20px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.05);
          margin-bottom: 20px;
        }
        .info-box {
          background-color: #f4faeb;
          border-left: 4px solid #c1e685;
          padding: 12px 15px;
          margin: 20px 0;
          border-radius: 0 8px 8px 0;
          font-size: 15px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        table td {
          padding: 12px;
          border-bottom: 1px solid #eee;
          color: #333;
        }
        table td:first-child {
          font-weight: bold;
          width: 35%;
          color: #1a2e18;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          font-size: 12px;
          color: #647463;
          padding-top: 15px;
        }
        .button {
          display: inline-block;
          background-color: #1a2e18;
          color: #c1e685 !important;
          text-decoration: none;
          padding: 12px 25px;
          border-radius: 100px;
          margin-top: 15px;
          font-weight: bold;
          border: 1px solid #c1e685;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="title">Op. Dr. Çağrı Yapar</div>
          <div class="subtitle">Yeni İletişim / Randevu Talebi</div>
        </div>
        
        <div class="content">
          <div class="info-box">
            Web siteniz üzerinden yeni bir talep alındı. Detaylar aşağıdadır:
          </div>
          
          <table>
            <tr>
              <td>Ad Soyad</td>
              <td><strong>${formData.adSoyad}</strong></td>
            </tr>
            <tr>
              <td>Telefon</td>
              <td><a href="tel:${formData.telefon}" style="color: #1a2e18; text-decoration: none; font-weight: bold;">${formData.telefon}</a></td>
            </tr>
            ${emailHtml}
            ${konuHtml}
            ${tarihHtml}
            ${mesajHtml}
          </table>
          
          <div style="text-align: center; margin-top: 25px;">
            <a href="tel:${formData.telefon}" class="button">Hemen Ara</a>
          </div>
        </div>
        
        <div class="footer">
          <p>Bu e-posta, drcagriyapar.com iletişim formu aracılığıyla otomatik olarak gönderilmiştir.</p>
          <p>© 2026 Op. Dr. Çağrı Yapar - Tüm Hakları Saklıdır.</p>
        </div>
      </div>
    </body>
    </html>
    `,
    text: `Yeni bir iletişim/randevu talebi alındı:
    
Ad Soyad: ${formData.adSoyad}
Telefon: ${formData.telefon}
${formData.email ? `E-posta: ${formData.email}` : ''}
${formData.konu ? `Konu: ${formData.konu}` : ''}
${formData.tarih ? `Tarih: ${formData.tarih}` : ''}
${formData.mesaj ? `Mesaj: ${formData.mesaj}` : ''}
`
  };

  // E-postayı gönder
  return await transporter.sendMail(mailOptions);
}

// Randevu talebi alma endpoint'i - rate limiter ve reCAPTCHA v3 uygulandı
app.post('/api/randevu', apiLimiter, async (req, res) => {
  try {
    // reCAPTCHA v3 doğrulama
    const captchaToken = req.body.captcha;

    if (!captchaToken) {
      return res.status(400).json({
        success: false,
        message: 'Güvenlik doğrulaması gereklidir.'
      });
    }

    const recaptchaResult = await verifyRecaptchaV3(captchaToken);

    if (!recaptchaResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Güvenlik doğrulaması başarısız oldu. Lütfen tekrar deneyin.'
      });
    }

    // reCAPTCHA eylem kontrolü
    if (recaptchaResult.action && !['randevu_form', 'contact_form'].includes(recaptchaResult.action)) {
      console.warn(`Beklenen eylem 'contact_form', alınan: ${recaptchaResult.action}`);
    }

    const formData = {
      adSoyad: req.body.adSoyad || req.body.name,
      telefon: req.body.telefon || req.body.phone,
      email: req.body.email,
      konu: req.body.konu || req.body.subject || req.body.hizmetSecin,
      tarih: req.body.tarih || req.body.date,
      mesaj: req.body.mesaj || req.body.message || req.body.sikayet
    };

    // Form verilerinin kontrolü - En azından ad soyad ve telefon gerekli
    if (!formData.adSoyad || !formData.telefon) {
      return res.status(400).json({ success: false, message: 'Lütfen Ad Soyad ve Telefon alanlarını doldurun.' });
    }

    // E-posta gönderme
    await sendEmail(formData);

    res.status(200).json({ success: true, message: 'Mesajınız başarıyla iletildi. En kısa sürede dönüş yapılacaktır.' });
  } catch (error) {
    console.error('İşlem hatası:', error);
    res.status(500).json({ success: false, message: 'Mesaj iletilemedi. Lütfen daha sonra tekrar deneyin veya doğrudan telefon ile ulaşın.' });
  }
});

// Sağlık kontrolü endpoint'i
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Root check
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Dr. Çağrı Yapar Randevu API çalışıyor.' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Beklenmedik hata:', err);
  // Ensure CORS headers on errors too
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.status(500).json({
    success: false,
    message: 'Sunucu tarafında bir hata oluştu.'
  });
});

app.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});