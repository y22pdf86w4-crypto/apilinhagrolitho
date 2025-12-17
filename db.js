// db.js

const sql = require('mssql');

const config = {
  user: process.env.DB_USER,                    // definido no Render
  password: process.env.DB_PASSWORD,           // definido no Render
  server: process.env.DB_SERVER || 'db.lin.com.br',
  database: process.env.DB_DATABASE || process.env.DB_NAME || 'DWAW2',
  port: parseInt(process.env.DB_PORT || '1433', 10),
  options: {
    encrypt: false,            // seu SQL é interno via túnel, pode deixar false
    trustServerCertificate: true
  }
};

let pool = null;

async function getPool() {
  if (pool && pool.connected) return pool;

  try {
    pool = await sql.connect(config);

    pool.on('error', err => {
      console.error('[DB_POOL_ERROR]', err.message);
      pool = null;
    });

    console.log('[DB] Pool conectado');
    return pool;
  } catch (err) {
    console.error('[DB_CONNECT_ERROR]', err.message);
    throw err;
  }
}

async function query(sqlText, params = []) {
  const p = await getPool();
  const request = p.request();

  params.forEach(par => request.input(par.name, par.type, par.value));

  const result = await request.query(sqlText);
  return result.recordset || [];
}

module.exports = { sql, query, getPool };
