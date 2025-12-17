// auth.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { validarCredenciais } = require('./usuarios');

function garantirSecret() {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'api_linhagro_2025';
  }
}

function gerarToken(usuario, perfil = 'consultor') {
  garantirSecret();
  return jwt.sign(
    { usuario, perfil },
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
      return res.status(401).json({ sucesso: false, erro: 'Use Bearer <token>' });
    }

    garantirSecret();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded.usuario;
    req.perfil = decoded.perfil;
    next();
  } catch (err) {
    return res.status(403).json({ sucesso: false, erro: 'Token inválido ou expirado' });
  }
}

function verificarAdmin(req, res, next) {
  if (req.perfil !== 'admin') {
    return res.status(403).json({ sucesso: false, erro: 'Requer perfil admin' });
  }
  next();
}

module.exports = {
  gerarToken,
  validarToken,
  verificarAdmin,
  validarCredenciais
};
