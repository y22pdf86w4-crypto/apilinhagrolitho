// usuarios.js - Gerenciamento de usuários
const bcrypt = require('bcryptjs');
const { query } = require('./db');
const sql = require('mssql');

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
    const dashboardsJson = JSON.stringify(dashboards);

    const sqlText = `
      INSERT INTO dbo.usuarios_api (usuario, senha_hash, email, perfil, dashboards, ativo, data_criacao)
      VALUES (@usuario, @senhaHash, @email, @perfil, @dashboards, 1, GETDATE());
      SELECT SCOPE_IDENTITY() AS id;
    `;

    const res = await query(sqlText, [
      { name: 'usuario', type: sql.NVarChar, value: usuario },
      { name: 'senhaHash', type: sql.NVarChar, value: senhaHash },
      { name: 'email', type: sql.NVarChar, value: email || null },
      { name: 'perfil', type: sql.NVarChar, value: perfil },
      { name: 'dashboards', type: sql.NVarChar, value: dashboardsJson }
    ]);

    const novoId = res ? res.id : null;

    console.log(`[CREATE_USER] Novo usuário criado: ${usuario} (ID: ${novoId})`);
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

    const u = res;
    const ok = await bcrypt.compare(senha, u.senha_hash);

    if (!ok) {
      return { valido: false, erro: 'Senha incorreta' };
    }

    let dashboards = [];
    try {
      dashboards = u.dashboards ? JSON.parse(u.dashboards) : (dashboardsPorPerfil[u.perfil] || []);
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
  try {
    const sqlText = `
      SELECT id, usuario, email, perfil, ativo, CONVERT(varchar, data_criacao, 103) as data_criacao
      FROM dbo.usuarios_api
      ORDER BY data_criacao DESC
    `;
    return await query(sqlText);
  } catch (err) {
    console.error('[LISTAR_USUARIOS_ERROR]', err.message);
    return [];
  }
}

async function desativarUsuario(usuario) {
  try {
    const sqlText = `
      UPDATE dbo.usuarios_api 
      SET ativo = 0, data_atualizacao = GETDATE() 
      WHERE usuario = @usuario
    `;

    await query(sqlText, [
      { name: 'usuario', type: sql.NVarChar, value: usuario }
    ]);

    console.log(`[DISABLE_USER] Usuário desativado: ${usuario}`);
    return { sucesso: true, mensagem: `Usuário ${usuario} desativado` };
  } catch (err) {
    return { sucesso: false, erro: err.message };
  }
}

async function reativarUsuario(usuario) {
  try {
    const sqlText = `
      UPDATE dbo.usuarios_api 
      SET ativo = 1, data_atualizacao = GETDATE() 
      WHERE usuario = @usuario
    `;

    await query(sqlText, [
      { name: 'usuario', type: sql.NVarChar, value: usuario }
    ]);

    console.log(`[ENABLE_USER] Usuário reativado: ${usuario}`);
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
