// db.js - VERSÃO AJUSTADA PARA RENDER

const sql = require('mssql');

// Configuração segura via variáveis de ambiente
const config = {
  user: process.env.DB_USER || 'BI',
  password: process.env.DB_PASSWORD || 'mCslBhQAJrJQugHhgcJ5',
  server: process.env.DB_SERVER || '172.18.4.12',
  database: process.env.DB_NAME || 'DWAW2',
  options: {
    encrypt: true,
    trustServerCertificate: true,
    requestTimeout: 30000,
    connectionTimeout: 30000
  },
  pool: {
    min: 2,
    max: 10
  }
};

let pool = null;

async function getPool() {
  try {
    if (pool && pool.connected) {
      return pool;
    }
    
    console.log('[DB] Conectando ao SQL Server...');
    pool = await sql.connect(config);
    
    pool.on('error', err => {
      console.error('[DB_POOL_ERROR]', err.message);
      pool = null;
    });
    
    console.log('[DB] ✅ Pool conectado com sucesso');
    return pool;
  } catch (err) {
    console.error('[DB] ❌ Erro ao conectar:', err.message);
    throw err;
  }
}

async function query(sqlText, params = []) {
  try {
    const p = await getPool();
    const request = p.request();
    
    // Adicionar parâmetros se fornecidos
    params.forEach(param => {
      request.input(param.name, param.type, param.value);
    });
    
    const result = await request.query(sqlText);
    return result.recordset || [];
  } catch (err) {
    console.error('[QUERY_ERROR]', err.message);
    throw err;
  }
}

// Função para fechar conexão (útil para Render)
async function closePool() {
  if (pool) {
    await pool.close();
    pool = null;
    console.log('[DB] Pool fechado');
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[SHUTDOWN] Fechando conexão com banco...');
  await closePool();
  process.exit(0);
});

module.exports = { sql, query, getPool, closePool };