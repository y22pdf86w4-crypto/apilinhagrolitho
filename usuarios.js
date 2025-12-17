// usuarios.js - Versão Final Ajustada (Prepared Statements)
const bcrypt = require('bcryptjs');
const { query } = require('./db');
const sql = require('mssql'); // Importante para os tipos

const dashboardsPorPerfil = {
  admin: ['vendas', 'financeiro', 'operacional', 'rh', 'estoque', 'relatorios'],
  gerente: ['vendas', 'relatorios'],
  analista: ['financeiro', 'relatorios'],
  operador: ['operacional', 'estoque'],
  consultor: ['vendas', 'relatorios'],
  rh: ['rh', 'relatorios']
};

async function criarUsuario(usuario, senha, email, perfil = 'consultor') {
  try {
    const senhaHash = await bcrypt.hash(senha, 10);
    const dashboards = dashboardsPorPerfil[perfil] || dashboardsPorPerfil.consultor;
    const dashboardsJson = JSON.stringify(dashboards); // Salva como string JSON

    const sqlText = `
      INSERT INTO dbo.usuarios_api (usuario, senha_hash, email, perfil, dashboards, ativo, data_criacao)
      VALUES (@usuario, @senhaHash, @email, @perfil, @dashboards, 1, GETDATE());
      SELECT SCOPE_IDENTITY() AS id;
    `;

    // A função query do seu db.js deve suportar parâmetros
    // Se não suportar, avise e mudamos para concatenação segura
    const res = await query(sqlText, [
      { name: 'usuario', type: sql.NVarChar, value: usuario },
      { name: 'senhaHash', type: sql.NVarChar, value: senhaHash },
      { name: 'email', type: sql.NVarChar, value: email || null },
      { name: 'perfil', type: sql.NVarChar, value: perfil },
      { name: 'dashboards', type: sql.NVarChar, value: dashboardsJson }
    ]);

    // Ajuste para pegar ID corretamente dependendo do driver
    const novoId = res[0] ? res[0].id : null;

    return { sucesso: true, id: novoId, dashboards };
  } catch (err) {
    console.error('[CRIAR_USUARIO_ERROR]', err.message);
    return { sucesso: false, erro: err.message };
  }
}

async function validarCredenciais(usuario, senha) {
  try {
    const sqlText = `
      SELECT id, usuario, senha_hash, perfil, dashboards, email
      FROM dbo.usuarios_api
      WHERE usuario = @usuario AND ativo = 1
    `;
    const res = await query(sqlText, [
      { name: 'usuario', type: sql.NVarChar, value: usuario }
    ]);

    if (!res || !res.length) {
      return { valido: false, erro: 'Usuário não encontrado' };
    }

    const u = res[0];
    const ok = await bcrypt.compare(senha, u.senha_hash);
    
    if (!ok) return { valido: false, erro: 'Senha incorreta' };

    let dashboards = [];
    try {
      // Tenta parsear JSON, se falhar ou for nulo, pega padrão do perfil
      dashboards = u.dashboards ? JSON.parse(u.dashboards) : (dashboardsPorPerfil[u.perfil] || []);
      // Se parseou mas não é array (ex: string "todos"), força array
      if (!Array.isArray(dashboards)) dashboards = [dashboards];
    } catch {
      dashboards = dashboardsPorPerfil[u.perfil] || [];
    }

    return {
      valido: true,
      id: u.id,
      usuario: u.usuario,
      email: u.email,
      perfil: u.perfil,
      dashboards
    };
  } catch (err) {
    console.error('[VALIDAR_CREDENCIAIS_ERROR]', err.message);
    return { valido: false, erro: 'Erro ao validar credenciais' };
  }
}

async function listarUsuarios() {
  const sqlText = `
    SELECT id, usuario, email, perfil, ativo, CONVERT(varchar, data_criacao, 103) as data_criacao
    FROM dbo.usuarios_api
    ORDER BY data_criacao DESC
  `;
  return query(sqlText); // Query sem parâmetros
}

async function desativarUsuario(usuario) {
  try {
      const sqlText = `UPDATE dbo.usuarios_api SET ativo = 0, data_atualizacao = GETDATE() WHERE usuario = @usuario`;
      await query(sqlText, [{ name: 'usuario', type: sql.NVarChar, value: usuario }]);
      return { sucesso: true, mensagem: `Usuário ${usuario} desativado` };
  } catch (err) {
      return { sucesso: false, erro: err.message };
  }
}

async function reativarUsuario(usuario) {
  try {
      const sqlText = `UPDATE dbo.usuarios_api SET ativo = 1, data_atualizacao = GETDATE() WHERE usuario = @usuario`;
      await query(sqlText, [{ name: 'usuario', type: sql.NVarChar, value: usuario }]);
      return { sucesso: true, mensagem: `Usuário ${usuario} reativado` };
  } catch (err) {
      return { sucesso: false, erro: err.message };
  }
}

module.exports = {
  criarUsuario,
  validarCredenciais,
  listarUsuarios,
  desativarUsuario,
  reativarUsuario,
  dashboardsPorPerfil
};
