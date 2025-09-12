import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || '8655427d420a0072bbb5c98e2c0fb5c5ddf4337a16b928f416488d7013a78d26';

export function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}
