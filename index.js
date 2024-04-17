const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sqlite3 = require('better-sqlite3');
const stringSimilarity = require('string-similarity');

const app = express();
const dbPath = path.join(__dirname, 'sim', 'data', 'data.sqlite');
const db = new sqlite3(dbPath);

const downloadFile = async (url, filePath) => {
  const writer = fs.createWriteStream(filePath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
};

const initializeDatabase = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ask TEXT,
      ans TEXT
    )
  `);
};

initializeDatabase();

app.get('/api/sim/simv3', async(req, res, next) => {
  try {
    if (!req.query.type) throw new Error('Missing query parameter "type"');

    if (req.query.type === 'ask') {
      const ask = decodeURIComponent(req.query.ask);
      if (!ask) throw new Error('Missing query parameter "ask"');

      const stmt = db.prepare('SELECT ask FROM data');
      const rows = stmt.all();
      const msg = rows.map(row => row.ask);
      const matches = stringSimilarity.findBestMatch(ask, msg);

      if (matches.bestMatch.rating >= 0.1) {
        const search = matches.bestMatch.target;
        const resultStmt = db.prepare('SELECT * FROM data WHERE ask = ?');
        const resultRows = resultStmt.all(search);
        if (resultRows.length > 0) {
          const find = resultRows[Math.floor(Math.random() * resultRows.length)];
          const ans = JSON.parse(find.ans);
          const answer = ans[Math.floor(Math.random() * ans.length)];
          return res.json({ answer });
        }
      }
      return res.json({ answer: 'I dont understand anything!!!' });
    } 

    else if (req.query.type === 'teach') {
      const ask = req.query.ask;
      const ans = req.query.ans;
      if (!ask || !ans) throw new Error('Missing query parameters "ask" or "ans"');

      const existingStmt = db.prepare('SELECT * FROM data WHERE ask = ?');
      const existingData = existingStmt.get(ask);

      if (existingData) {
        const existingAns = JSON.parse(existingData.ans);
        if (existingAns.includes(ans)) {
          return res.json({ error: 'The answer already exists!' });
        }
        existingAns.push(ans);
        db.prepare('UPDATE data SET ans = ? WHERE ask = ?').run(JSON.stringify(existingAns), ask);
      } else {
        db.prepare('INSERT INTO data (ask, ans) VALUES (?, ?)').run(ask, JSON.stringify([ans]));
      }
      return res.json({ msg: 'Teach sim success', data: { ask, ans } });
    } 

    else {
      throw new Error('Invalid value for query parameter "type"');
    }
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('<h1>Hello, World!</h1>');
});

const PORT = process.env.PORT || 1041;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is listening on port ${PORT}`);
});
