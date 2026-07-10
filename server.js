const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 정적 파일 서빙
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 업로드 디렉토리 생성
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// 이메일 트랜스포터 설정
let transporter;
async function setupMailer() {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    // 실제 이메일 (예: Gmail)
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    console.log('✅ 실제 이메일 전송이 구성되었습니다.');
  } else {
    // 가짜 이메일 서버 (Ethereal) 테스트용
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log('⚠️ 테스트용 Ethereal 이메일 계정이 생성되었습니다.');
    console.log(`- 테스트 이메일 확인: https://ethereal.email/login`);
    console.log(`- User: ${testAccount.user} / Pass: ${testAccount.pass}`);
  }
}
setupMailer();

// 이미지 업로드 API (Base64)
app.post('/api/upload', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: '이미지가 없습니다.' });
    }

    // Cloudinary 설정이 있으면 클라우드에 우선 업로드
    if (process.env.CLOUDINARY_URL) {
      try {
        const result = await cloudinary.uploader.upload(image, {
          folder: 'life-four-cuts'
        });
        console.log('☁️ 이미지가 Cloudinary에 정상 업로드되었습니다.');
        return res.json({
          success: true,
          id: result.public_id,
          url: result.secure_url,
          imageUrl: result.secure_url
        });
      } catch (cloudErr) {
        console.error('Cloudinary 업로드 에러:', cloudErr);
        // 에러 시 로컬 저장으로 폴백
      }
    }

    // Base64 데이터에서 헤더 분리 (data:image/png;base64,...)
    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: '잘못된 이미지 포맷입니다.' });
    }

    const ext = matches[1].split('/')[1] || 'png';
    const buffer = Buffer.from(matches[2], 'base64');
    
    const id = uuidv4();
    const filename = `${id}.${ext}`;
    const filepath = path.join(uploadDir, filename);

    fs.writeFileSync(filepath, buffer);

    // 호스팅되는 URL 반환
    const clientOrigin = req.headers['origin'] || req.headers['x-forwarded-host'] ? `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host']}` : `${req.protocol}://${req.get('host')}`;
    const baseUrl = req.body.clientBaseUrl || clientOrigin;
    const photoUrl = `${baseUrl}/photo/${id}`;

    res.json({ success: true, id, url: photoUrl, imageUrl: `${baseUrl}/uploads/${filename}` });
  } catch (error) {
    console.error('업로드 에러:', error);
    res.status(500).json({ error: '업로드 중 서버 에러가 발생했습니다.' });
  }
});

// 이메일 전송 API
app.post('/api/email', async (req, res) => {
  try {
    const { email, imageUrl } = req.body;
    
    if (!email || !imageUrl) {
      return res.status(400).json({ error: '이메일 주소와 이미지 URL이 필요합니다.' });
    }

    if (!transporter) {
      return res.status(500).json({ error: '이메일 서버가 구성되지 않았습니다.' });
    }

    let mailOptions = {
      from: '"인생네컷 포토부스" <noreply@life4cuts.com>',
      to: email,
      subject: '📸 인생네컷 포토부스에서 촬영한 사진입니다!',
      text: '인생네컷 포토부스에서 촬영한 사진이 도착했습니다. 첨부파일을 확인해주세요.',
      html: `
        <div style="font-family: sans-serif; text-align: center; padding: 20px;">
          <h2>ជីវិតបួនសន្លឹក / Life Four Cuts</h2>
          <p>រូបថតរបស់អ្នករួចរាល់ហើយ! / Your photos are ready!</p>
          <p>សូមទាញយកឯកសារភ្ជាប់ខាងក្រោម។ / Please download the attached file.</p>
        </div>
      `,
      attachments: []
    };

    // 로컬 경로 파일로 첨부하기 위해 url에서 파일명 추출
    const filename = imageUrl.split('/').pop();
    const filepath = path.join(uploadDir, filename);

    if (fs.existsSync(filepath)) {
      mailOptions.attachments.push({
        filename: 'life4cuts.png',
        path: filepath
      });
    } else if (imageUrl.startsWith('http')) {
      // 로컬에 파일이 없거나 Cloudinary 주소일 경우 원격 URL을 직접 첨부
      mailOptions.attachments.push({
        filename: 'life4cuts.png',
        path: imageUrl
      });
    } else {
      mailOptions.html += `<p><a href="${imageUrl}">사진 다운로드 링크</a></p>`;
    }

    const info = await transporter.sendMail(mailOptions);
    
    let previewUrl = '';
    if (info.messageId && nodemailer.getTestMessageUrl(info)) {
      previewUrl = nodemailer.getTestMessageUrl(info);
      console.log('이메일 미리보기 URL: %s', previewUrl);
    }

    res.json({ success: true, message: '이메일이 전송되었습니다.', previewUrl });
  } catch (error) {
    console.error('이메일 전송 에러:', error);
    res.status(500).json({ error: '이메일 전송 중 서버 에러가 발생했습니다.' });
  }
});

// 모바일 사진 다운로드 페이지 제공
app.get('/photo/:id', (req, res) => {
  const id = req.params.id;
  
  // uploads 폴더에서 해당 id를 가진 이미지 찾기
  const files = fs.readdirSync(uploadDir);
  const file = files.find(f => f.startsWith(id + '.'));

  if (!file) {
    return res.status(404).send('사진을 찾을 수 없습니다.');
  }

  const imageUrl = `/uploads/${file}`;

  const html = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>ជីវិតបួនសន្លឹក - ទាញយករូបថត / Download Photo</title>
      <style>
        body { margin: 0; padding: 20px; background-color: #08081a; color: white; font-family: sans-serif; text-align: center; }
        .container { max-width: 500px; margin: 0 auto; }
        img { max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); margin-bottom: 20px; }
        .btn { display: inline-block; background: linear-gradient(135deg, #00d4ff, #b44dff); color: white; text-decoration: none; padding: 15px 30px; border-radius: 30px; font-weight: bold; font-size: 16px; margin-bottom: 20px; }
        p { color: #8888aa; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>រួចរាល់! / Complete!</h2>
        <p>ចុចឱ្យយូរលើរូបភាពដើម្បីរក្សាទុក ឬចុចប៊ូតុងខាងក្រោម។<br>Long press the image to save or click the button below.</p>
        <img src="${imageUrl}" alt="Life Four Cuts Photo">
        <br>
        <a href="${imageUrl}" download="life4cuts.jpg" class="btn">ទាញយករូបថត / Download Photo</a>
      </div>
    </body>
    </html>
  `;

  res.send(html);
});

app.listen(PORT, () => {
  console.log(`🚀 인생네컷 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
