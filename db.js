// db.js
const sql = require('mssql');

const config = {
  user: process.env.DB_USER || 'BI',
  password: process.env.DB_PASSWORD || 'mCslBhQAJrJQugHhgcJ5',
  server: process.env.DB_SERVER || '172.18.4.12',
  database: process.env.DB_NAME || 'DWAW2',
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

let pool = null;

async function getPool() {
  if (pool && pool.connected) return pool;

  pool = await sql.connect(config);

  pool.on('error', err => {
    console.error('[DB_POOL_ERROR]', err.message);
    pool = null;
  });

  console.log('[DB] Pool conectado');
  return pool;
}

async function query(sqlText, params = []) {
  const p = await getPool();
  const request = p.request();

  params.forEach(p => request.input(p.name, p.type, p.value));

  const result = await request.query(sqlText);
  return result.recordset || [];
}

module.exports = { sql, query, getPool };
