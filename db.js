// db.js - Atualizado para Render
const sql = require('mssql');

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME || 'DWAW2',
  options: {
    encrypt: true,
    trustServerCertificate: true,
    connectionTimeout: 30000,
    requestTimeout: 30000
  }
};

let pool = null;

async function getPool() {
  if (pool && pool.connected) {
    return pool;
  }

  try {
    pool = await sql.connect(config);
    pool.on('error', err => {
      console.error('[DB_POOL_ERROR]', err.message);
      pool = null;
    });
    console.log('[DB] Pool conectado com sucesso');
    return pool;
  } catch (err) {
    console.error('[DB_CONNECT_ERROR]', err.message);
    throw err;
  }
}

async function query(sqlText, params = []) {
  try {
    const p = await getPool();
    const request = p.request();
    
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

module.exports = { sql, query, getPool };
