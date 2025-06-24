const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'mr-rabbit-secret';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

mongoose.connect('mongodb+srv://oyysreejan8:r9f3q8OpBE9UdFEv@cluster0.h3mzhuz.mongodb.net/mrrabbit', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const UserSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
});

const User = mongoose.model('User', UserSchema);

// Middleware: token verify
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ msg: 'No token' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ msg: 'Invalid token' });
  }
};

// Routes
app.post('/api/signup', async (req, res) => {
  const { username, email, password } = req.body;
  const exist = await User.findOne({ username });
  if (exist) return res.status(400).json({ msg: 'Username already exists' });

  const hashed = await bcrypt.hash(password, 10);
  const newUser = new User({ username, email, password: hashed });
  await newUser.save();

  const token = jwt.sign({ id: newUser._id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ msg: 'Account created and logged in!', token });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ msg: 'Login successful!', token });
});

app.get('/api/protected', verifyToken, (req, res) => {
  res.json({ msg: 'You are authenticated' });
});

// URL rewrite
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.sendFile(__dirname + '/public/login.html'));
app.get('/signup', (req, res) => res.sendFile(__dirname + '/public/signup.html'));
app.get('/success', (req, res) => res.sendFile(__dirname + '/public/success.html'));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
