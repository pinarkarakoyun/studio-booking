// Bu import en üstte olmalı: diğer modüller (ör. pool.js) yüklenmeden önce .env okunur.
import 'dotenv/config';
import express from 'express';
import healthRouter from './routes/health.js';

const app = express();
// Gelen isteklerin JSON gövdesini çözüp req.body içine koyar.
app.use(express.json());

app.use(healthRouter);

// PORT tanımlı değilse 3000 kullanılır.
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
