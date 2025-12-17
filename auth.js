// auth.js - Autenticação JWT
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function garantirSecret() {
  if (!process.env.JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET não configurado em produção!');
    }
    console.warn('[WARN] JWT_SECRET não definido, usando default de desenvolvimento');
    process.env.JWT_SECRET = 'dev_secret_linhagro_2025';
  }
}

function gerarToken(usuario, perfil = 'consultor') {
  garantirSecret();
  return jwt.sign(
    { usuario, perfil, timestamp: Date.now() },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '7d' }
  );
}

function validarToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
      return res.status(401).json({ sucesso: false, erro: 'Token não fornecido' });
    }

    const [schema, token] = authHeader.split(' ');
    
    if (schema !== 'Bearer' || !token) {
      return res.status(401).json({ sucesso: false, erro: 'Use formato: Bearer <token>' });
    }

    garantirSecret();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    req.usuario = decoded.usuario;
    req.perfil = decoded.perfil;
    
    next();
  } catch (err) {
    console.error('[TOKEN_VALIDATION_ERROR]', err.message);
    return res.status(403).json({ sucesso: false, erro: 'Token inválido ou expirado' });
  }
}

function verificarAdmin(req, res, next) {
  if (req.perfil !== 'admin') {
    return res.status(403).json({ sucesso: false, erro: 'Acesso restrito: requer perfil admin' });
  }
  next();
}

module.exports = {
  gerarToken,
  validarToken,
  verificarAdmin
};
