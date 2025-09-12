import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { generateToken, verifyToken } from './jwt.js';
import sitesRouter from './sites.js';
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use('/sites', sitesRouter);

const dbConfig = {
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
};

async function getConnection() {
	return await mysql.createConnection(dbConfig);
}

// --- Admin JWT Login ---
app.post('/admin-login', async (req, res) => {
	const { password } = req.body;
	const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
	if (!password || password !== ADMIN_PASSWORD) {
		return res.status(401).json({ error: 'Invalid admin password' });
	}
	const token = generateToken({ role: 'admin' });
	return res.json({ success: true, token });
});

// --- Admin User Management ---
app.post('/admin/users', async (req, res) => {
	const { site, username, password } = req.body;
	if (!site || !username || !password) {
		return res.status(400).json({ error: 'Missing site, username, or password' });
	}
	try {
		const conn = await getConnection();
		const [existing] = await conn.execute('SELECT id FROM users WHERE site = ? AND username = ?', [site, username]);
		if (existing.length > 0) {
			await conn.end();
			return res.status(409).json({ error: 'User already exists' });
		}
		const hashed = await bcrypt.hash(password, 10);
		await conn.execute('INSERT INTO users (site, username, password) VALUES (?, ?, ?)', [site, username, hashed]);
		await conn.end();
		return res.json({ success: true });
	} catch (err) {
		return res.status(500).json({ error: 'Server error', details: err.message });
	}
});

app.get('/admin/users', async (req, res) => {
	try {
		const conn = await getConnection();
		const [rows] = await conn.execute('SELECT id, site, username FROM users');
		await conn.end();
		return res.json({ users: rows });
	} catch (err) {
		return res.status(500).json({ error: 'Server error', details: err.message });
	}
});

app.put('/admin/users/:id', async (req, res) => {
	const { id } = req.params;
	const { site, username, password } = req.body;
	if (!site || !username) {
		return res.status(400).json({ error: 'Missing site or username' });
	}
	try {
		const conn = await getConnection();
		if (password) {
			const hashed = await bcrypt.hash(password, 10);
			await conn.execute('UPDATE users SET site = ?, username = ?, password = ? WHERE id = ?', [site, username, hashed, id]);
		} else {
			await conn.execute('UPDATE users SET site = ?, username = ? WHERE id = ?', [site, username, id]);
		}
		await conn.end();
		return res.json({ success: true });
	} catch (err) {
		return res.status(500).json({ error: 'Server error', details: err.message });
	}
});

app.delete('/admin/users/:id', async (req, res) => {
	const { id } = req.params;
	try {
		const conn = await getConnection();
		await conn.execute('DELETE FROM users WHERE id = ?', [id]);
		await conn.end();
		return res.json({ success: true });
	} catch (err) {
		return res.status(500).json({ error: 'Server error', details: err.message });
	}
});

// --- Auth Endpoints ---
app.post('/signup', async (req, res) => {
	const { site, username, password } = req.body;
	if (!site || !username || !password) {
		return res.status(400).json({ error: 'Missing fields' });
	}
	try {
		const conn = await getConnection();
		const [rows] = await conn.execute('SELECT id FROM users WHERE site = ? AND username = ?', [site, username]);
		if (rows.length > 0) {
			await conn.end();
			return res.status(409).json({ error: 'Username already exists for this site' });
		}
		const hashed = await bcrypt.hash(password, 10);
		await conn.execute('INSERT INTO users (site, username, password) VALUES (?, ?, ?)', [site, username, hashed]);
		await conn.end();
		return res.json({ success: true });
	} catch (err) {
		return res.status(500).json({ error: 'Server error', details: err.message });
	}
});

app.post('/login', async (req, res) => {
	const { site, username, password } = req.body;
	if (!site || !username || !password) {
		return res.status(400).json({ error: 'Missing fields' });
	}
	try {
		const conn = await getConnection();
		const [rows] = await conn.execute('SELECT id, password FROM users WHERE site = ? AND username = ?', [site, username]);
		await conn.end();
		if (rows.length === 0) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}
		const valid = await bcrypt.compare(password, rows[0].password);
		if (!valid) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}
		const token = generateToken({ userId: rows[0].id, site, username });
		return res.json({ success: true, token });
	} catch (err) {
		return res.status(500).json({ error: 'Server error', details: err.message });
	}
});

// Store connected SSE clients
const sseClients = new Set();

// SSE endpoint for real-time feedback updates
app.get('/feedback-updates', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Send an initial message
  res.write('data: connected\n\n');

  // Keep the connection alive with a periodic heartbeat
  const heartbeat = setInterval(() => {
    if (res.writableEnded) return;
    res.write('data: heartbeat\n\n');
  }, 30000);

  const client = res;
  sseClients.add(client);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(client);
  });
});

// Function to notify all connected clients
const notifyClients = () => {
  sseClients.forEach(client => {
    client.write('data: update\n\n');
  });
};

// --- Feedback Endpoints ---

// Accepts responses array and calculates overall rating
app.post('/feedback', async (req, res) => {
  const { site, canteen, responses, userId, username } = req.body;
  if (!site || !canteen || !Array.isArray(responses) || responses.length === 0) {
    return res.status(400).json({ error: 'Missing feedback data' });
  }
  // Calculate overall rating (average of all question ratings)
  const overallRating = Math.round(
    responses.reduce((sum, r) => sum + (r.rating || 0), 0) / responses.length * 100
  ) / 100;
  try {
    const conn = await getConnection();
    let [canteenRows] = await conn.execute('SELECT id FROM canteens WHERE site = ? AND name = ?', [site, canteen]);
    let canteenId;
    if (canteenRows.length === 0) {
      const [result] = await conn.execute('INSERT INTO canteens (site, name) VALUES (?, ?)', [site, canteen]);
      canteenId = result.insertId;
    } else {
      canteenId = canteenRows[0].id;
    }
    // Save feedback with responses as JSON
    await conn.execute(
      'INSERT INTO feedback (user_id, site, canteen_id, rating, username, responses, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId || null, site, canteenId, overallRating, username || null, JSON.stringify(responses), Date.now()]
    );
    await conn.end();
    
    // Notify all connected clients about the new feedback
    notifyClients();
    
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});// --- Admin Feedback Management ---
app.get('/admin/feedback', async (req, res) => {
	try {
		const conn = await getConnection();
		const [rows] = await conn.execute('SELECT * FROM feedback');
		await conn.end();
		return res.json({ feedback: rows });
	} catch (err) {
		return res.status(500).json({ error: 'Server error', details: err.message });
	}
});

app.put('/admin/feedback/:id', async (req, res) => {
	const { id } = req.params;
	const { rating } = req.body;
	if (!rating) {
		return res.status(400).json({ error: 'Missing rating' });
	}
	try {
		const conn = await getConnection();
		await conn.execute('UPDATE feedback SET rating = ? WHERE id = ?', [rating, id]);
		await conn.end();
		return res.json({ success: true });
	} catch (err) {
		return res.status(500).json({ error: 'Server error', details: err.message });
	}
});

app.delete('/admin/feedback/:id', async (req, res) => {
	const { id } = req.params;
	try {
		const conn = await getConnection();
		await conn.execute('DELETE FROM feedback WHERE id = ?', [id]);
		await conn.end();
		return res.json({ success: true });
	} catch (err) {
		return res.status(500).json({ error: 'Server error', details: err.message });
	}
});

// --- Canteen Endpoints ---
app.get('/canteens', async (req, res) => {
	const site = req.query.site;
	if (!site) return res.status(400).json({ error: 'Missing site' });
	try {
		const conn = await getConnection();
		const [rows] = await conn.execute('SELECT name FROM canteens WHERE site = ?', [site]);
		await conn.end();
		return res.json({ canteens: rows.map(r => r.name) });
	} catch (err) {
		return res.status(500).json({ error: 'Server error', details: err.message });
	}
});

app.post('/admin/canteens', async (req, res) => {
	const { site, name } = req.body;
	if (!site || !name) {
		return res.status(400).json({ error: 'Missing site or canteen name' });
	}
	try {
		const conn = await getConnection();
		const [rows] = await conn.execute('SELECT id FROM canteens WHERE site = ? AND name = ?', [site, name]);
		if (rows.length > 0) {
			await conn.end();
			return res.status(409).json({ error: 'Canteen already exists for this site' });
		}
		await conn.execute('INSERT INTO canteens (site, name) VALUES (?, ?)', [site, name]);
		await conn.end();
		return res.json({ success: true });
	} catch (err) {
		return res.status(500).json({ error: 'Server error', details: err.message });
	}
});

app.delete('/admin/canteens', async (req, res) => {
	const site = req.query.site;
	const name = req.query.name;
	if (!site || !name) {
		return res.status(400).json({ error: 'Missing site or canteen name' });
	}
	try {
		const conn = await getConnection();
		const [rows] = await conn.execute('SELECT id FROM canteens WHERE site = ? AND name = ?', [site, name]);
		if (rows.length === 0) {
			await conn.end();
			return res.status(404).json({ error: 'Canteen not found for this site' });
		}
		await conn.execute('DELETE FROM canteens WHERE site = ? AND name = ?', [site, name]);
		await conn.end();
		return res.json({ success: true });
	} catch (err) {
		return res.status(500).json({ error: 'Server error', details: err.message });
	}
});

// --- Question Endpoints ---
app.get('/questions', async (req, res) => {
	const { site } = req.query;
	if (!site) return res.status(400).json({ error: 'Missing site' });
	try {
		const conn = await getConnection();
		const [rows] = await conn.execute('SELECT id, question_text FROM questions WHERE site = ?', [site]);
		await conn.end();
		return res.json({ questions: rows });
	} catch (err) {
		return res.status(500).json({ error: 'Server error', details: err.message });
	}
});

app.post('/questions', async (req, res) => {
	const { site, question_text } = req.body;
	if (!site || !question_text) {
		return res.status(400).json({ error: 'Missing fields' });
	}
	try {
		const conn = await getConnection();
		await conn.execute('INSERT INTO questions (site, question_text) VALUES (?, ?)', [site, question_text]);
		await conn.end();
		return res.json({ success: true });
	} catch (err) {
		return res.status(500).json({ error: 'Server error', details: err.message });
	}
});

app.put('/questions/:id', async (req, res) => {
	const { id } = req.params;
	const { question_text } = req.body;
	if (!question_text) {
		return res.status(400).json({ error: 'Missing question_text' });
	}
	try {
		const conn = await getConnection();
		await conn.execute('UPDATE questions SET question_text = ? WHERE id = ?', [question_text, id]);
		await conn.end();
		return res.json({ success: true });
	} catch (err) {
		return res.status(500).json({ error: 'Server error', details: err.message });
	}
});

app.delete('/questions/:id', async (req, res) => {
	const { id } = req.params;
	try {
		const conn = await getConnection();
		await conn.execute('DELETE FROM questions WHERE id = ?', [id]);
		await conn.end();
		return res.json({ success: true });
	} catch (err) {
		return res.status(500).json({ error: 'Server error', details: err.message });
	}
});

// --- Protected Profile Route Example ---
app.get('/profile', (req, res) => {
	const auth = req.headers.authorization;
	if (!auth || !auth.startsWith('Bearer ')) {
		return res.status(401).json({ error: 'Missing token' });
	}
	const token = auth.split(' ')[1];
	const payload = verifyToken(token);
	if (!payload) {
		return res.status(401).json({ error: 'Invalid token' });
	}
	return res.json({ user: payload });
});

// --- Server Startup ---
const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
	console.log(`Backend running on port ${PORT}`);
});
