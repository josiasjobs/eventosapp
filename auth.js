/**
 * EventosAPP - Authentication & Authorization Layer
 * PIN hashing (bcryptjs), session management, and rate limiting
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { queries } = require('./db');

// In-memory rate limiting map: ip -> { attempts: number, lastAttempt: timestamp, blockedUntil: timestamp }
const rateLimitMap = new Map();
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 2 * 60 * 1000; // 2 minutes cooldown after 5 failed attempts

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record) return { allowed: true };

  if (record.blockedUntil && record.blockedUntil > now) {
    const remainingSeconds = Math.ceil((record.blockedUntil - now) / 1000);
    return {
      allowed: false,
      message: `Muitas tentativas incorretas. Aguarde ${remainingSeconds} segundos antes de tentar novamente.`,
      remainingSeconds
    };
  }

  // If block period passed, reset
  if (record.blockedUntil && record.blockedUntil <= now) {
    rateLimitMap.delete(ip);
    return { allowed: true };
  }

  return { allowed: true };
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { attempts: 0, lastAttempt: now, blockedUntil: 0 };
  record.attempts += 1;
  record.lastAttempt = now;

  if (record.attempts >= MAX_ATTEMPTS) {
    record.blockedUntil = now + BLOCK_DURATION_MS;
    record.attempts = 0;
  }
  rateLimitMap.set(ip, record);
}

function clearFailedAttempts(ip) {
  rateLimitMap.delete(ip);
}

// Hash PIN
async function hashPin(pin) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(pin.toString(), salt);
}

// Compare PIN
async function comparePin(pin, hash) {
  return bcrypt.compare(pin.toString(), hash);
}

// Generate session
function createSession(role, ip) {
  const token = crypto.randomBytes(32).toString('hex');
  // 7 days expiration for local event operation resilience
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  queries.createSession(token, role, ip, expires);
  return { token, role, expiresAt: expires };
}

// Validate PIN format (4 to 8 digits)
function isValidPin(pin) {
  return typeof pin === 'string' && /^\d{4,8}$/.test(pin);
}

// Middleware: Authenticate Session Token
function authenticate(requiredRole = null) {
  return (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.query.token || req.headers['x-session-token']);

    if (!token) {
      return res.status(401).json({ error: 'Sessão não informada. Forneça o PIN de acesso.' });
    }

    const session = queries.getSession(token);
    if (!session) {
      return res.status(401).json({ error: 'Sessão expirada ou inválida. Por favor, autentique-se novamente.' });
    }

    if (requiredRole === 'admin' && session.role !== 'admin') {
      return res.status(403).json({ error: 'Permissão insuficiente. O Modo Edição requer o PIN de Administrador.' });
    }

    req.user = session;
    next();
  };
}

module.exports = {
  hashPin,
  comparePin,
  createSession,
  isValidPin,
  checkRateLimit,
  recordFailedAttempt,
  clearFailedAttempts,
  authenticate
};
