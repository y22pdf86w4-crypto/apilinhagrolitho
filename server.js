const express = require('express');
require('dotenv').config();
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { query } = require('./db');
const { gerarToken, validarToken, verificarAdmin, validarCredenciais } = require('./auth');
const usuarios = require('./usuarios');


const app = express();


// ==============================
// 1. SEGURANÇA & CONFIG
// ==============================


app.use(helmet());
app.use(cors());
app.use(express.json());


const limiter = rateLimit({ 
    windowMs: 15 * 60 * 1000, 
    max: 5000,
    message: { sucesso: false, erro: 'Muitas requisições. Tente novamente mais tarde.' }
});
app.use('/api/', limiter);


const loginLimiter = rateLimit({ 
    windowMs: 15 * 60 * 1000, 
    max: 500,
    skipSuccessfulRequests: true,
    message: { sucesso: false, erro: 'Bloqueado por tentativas excessivas.' }
});


// ==============================
// 2. CONSTANTES & UTILS
// ==============================


const DATA_PADRAO = '2025-01-01';


const IDS_BLOQUEADOS_LINHAGRO = [
  5, 22, 55, 78, 80, 97, 116, 122, 130, 137, 138, 140,
  166, 167, 168, 169, 175, 176, 177, 179, 180, 181, 182, 183
];
const IDS_BLOQUEADOS_SQL = IDS_BLOQUEADOS_LINHAGRO.join(',');


function sanitizar(texto) {
    if (!texto || typeof texto !== 'string') return null;
    return texto.replace(/'/g, "''").replace(/;/g, "");
}


// Função de tratamento de data (Blindada contra arrays e formatos inválidos)
function limparData(valor, padrao) {
    let d = Array.isArray(valor) ? valor[0] : (valor || padrao);
    
    // Se vier DD/MM/YYYY, converte para YYYY-MM-DD
    if (typeof d === 'string' && d.includes('/') && d.split('/').length === 3) {
        const p = d.split('/');
        d = `${p[2]}-${p[1]}-${p[0]}`;
    }
    
    // Remove traços para formato YYYYMMDD
    return typeof d === 'string' ? d.replace(/-/g, '') : padrao.replace(/-/g, '');
}


// ==============================
// 3. ROTAS PÚBLICAS
// ==============================


app.get('/', (req, res) => {
  res.json({
    api: 'linhagro-v1.0',
    status: 'online',
    versao: '1.0.0',
    seguranca: 'ativa'
  });
});


app.post('/api/linhagro/login', loginLimiter, async (req, res) => {
  try {
    const { usuario, senha } = req.body;
    if (!usuario || !senha) return res.status(400).json({ sucesso: false, erro: 'Dados obrigatórios' });


    const resultado = await validarCredenciais(usuario, senha);
    if (!resultado.valido) return res.status(401).json({ sucesso: false, erro: 'Credenciais inválidas' });


    const token = gerarToken(resultado.usuario, resultado.perfil);
    console.log(`[LOGIN] User: ${resultado.usuario} - IP: ${req.ip}`);


    res.json({
      sucesso: true,
      usuario: resultado.usuario,
      token,
      expiracao: '7d'
    });
  } catch (err) {
    console.error(`[LOGIN_ERROR] ${err.message}`);
    res.status(500).json({ sucesso: false, erro: 'Erro interno no login' });
  }
});


// ==============================
// 4. DASHBOARD (LINHAGRO)
// ==============================


app.get('/api/linhagro/resumo-geral', validarToken, async (req, res) => {
  try {
    const { dtInicio, dtFim, nmVendedor, status, tipoAtividade } = req.query;

    // Tratamento de datas
    const dtInicioSafe = limparData(dtInicio, DATA_PADRAO);
    const dtFimSafe = limparData(dtFim, new Date().toISOString().split('T')[0]);

    const vendedorSafe = sanitizar(nmVendedor);
    const statusSafe = (status && status !== 'null') ? Number(status) : 'NULL';
    const tipoSafe = (tipoAtividade && tipoAtividade !== 'null') ? Number(tipoAtividade) : 'NULL';
    const vendedorSQL = (vendedorSafe && vendedorSafe !== '') ? `CAST(${Number(vendedorSafe)} AS int)` : 'NULL';

    const sql = `
      DECLARE @DataInicio datetime = TRY_CAST('${dtInicioSafe}' AS datetime);
      DECLARE @DataFim datetime = TRY_CAST('${dtFimSafe} 23:59:59' AS datetime);
      DECLARE @Status int = ${statusSafe};
      DECLARE @TipoAtv int = ${tipoSafe};
      DECLARE @IdVendedorFiltro int = ${vendedorSQL};

      IF @DataInicio IS NULL SET @DataInicio = '${DATA_PADRAO}';
      IF @DataFim IS NULL SET @DataFim = GETDATE();

      -- ATIVIDADES filtradas por data / status / tipo / vendedor
      WITH ATIVIDADES_FILTRADAS AS (
        SELECT a.*
        FROM DWAW2.dbo.atividades a
        WHERE a.idVendedor NOT IN (${IDS_BLOQUEADOS_SQL})
          AND a.dtInicial >= @DataInicio
          AND a.dtInicial <= @DataFim
          AND (@Status IS NULL OR a.idStatus = @Status)
          AND (@TipoAtv IS NULL OR a.idTipoAtividade = @TipoAtv)
          AND (@IdVendedorFiltro IS NULL OR a.idVendedor = @IdVendedorFiltro)
      ),

      -- CARTEIRA filtrada apenas por vendedor (não por data/status/tipo)
      RESUMO_CARTEIRA AS (
        SELECT 
          cc.vendedor_id AS idVendedor,
          COUNT(DISTINCT c.id) AS qtde_clientes_carteira,
          COUNT(DISTINCT CASE WHEN af.idCliente IS NOT NULL THEN c.id END) AS qtde_clientes_visitados,
          COUNT(DISTINCT CASE WHEN af.idCliente IS NULL THEN c.id END) AS qtde_clientes_risco
        FROM DWAW2.dbo.cliente c
        INNER JOIN DWAW2.dbo.cliente_consultor cc ON cc.cliente_id = c.id
        LEFT JOIN (
          SELECT DISTINCT idCliente 
          FROM DWAW2.dbo.atividades a
          WHERE a.idVendedor NOT IN (${IDS_BLOQUEADOS_SQL})
            AND (@IdVendedorFiltro IS NULL OR a.idVendedor = @IdVendedorFiltro)
        ) af ON af.idCliente = c.id
        WHERE cc.vendedor_id NOT IN (${IDS_BLOQUEADOS_SQL})
          AND cc.vendedor_id IS NOT NULL
          AND (@IdVendedorFiltro IS NULL OR cc.vendedor_id = @IdVendedorFiltro)
        GROUP BY cc.vendedor_id
      ),

      RESUMO_ATIVIDADES AS (
        SELECT 
          a.idVendedor,
          COUNT(*) AS qtde_atividades_total,
          COUNT(CASE WHEN a.dtInicial >= DATEADD(DAY, -30, @DataFim) THEN 1 END) AS qtde_atividades_30d,
          COUNT(CASE WHEN a.dtInicial >= DATEADD(DAY, -60, @DataFim) THEN 1 END) AS qtde_atividades_60d
        FROM ATIVIDADES_FILTRADAS a
        GROUP BY a.idVendedor
      ),

      META_PERIODO AS (
        SELECT 
          6 * (
            DATEDIFF(DAY, DATEFROMPARTS(YEAR(@DataInicio), MONTH(@DataInicio), 1), DATEADD(DAY, 1, EOMONTH(@DataInicio))) -
            2 * DATEDIFF(WEEK, DATEFROMPARTS(YEAR(@DataInicio), MONTH(@DataInicio), 1), DATEADD(DAY, 1, EOMONTH(@DataInicio))) -
            CASE WHEN DATENAME(WEEKDAY, DATEFROMPARTS(YEAR(@DataInicio), MONTH(@DataInicio), 1)) = 'Sunday' THEN 1 ELSE 0 END -
            CASE WHEN DATENAME(WEEKDAY, DATEADD(DAY, 1, EOMONTH(@DataInicio))) = 'Saturday' THEN 1 ELSE 0 END
          ) AS meta_atividades_mes
      ),

      VENDEDORES_NOMES AS (
        SELECT DISTINCT idVendedor, nmVendedor FROM DWAW2.dbo.atividades
      )

      SELECT 
        c.idVendedor AS id_vendedor,
        ISNULL(v.nmVendedor, CONCAT('Vendedor ', c.idVendedor)) AS nmVendedor,
        c.qtde_clientes_carteira,
        c.qtde_clientes_visitados,
        c.qtde_clientes_risco,
        CONVERT(decimal(10,2), 100.0 * c.qtde_clientes_risco / NULLIF(c.qtde_clientes_carteira, 0)) AS pct_clientes_risco,
        ISNULL(r.qtde_atividades_total, 0) AS qtde_atividades_total,
        ISNULL(r.qtde_atividades_30d, 0) AS qtde_atividades_30d,
        ISNULL(r.qtde_atividades_60d, 0) AS qtde_atividades_60d,
        M.meta_atividades_mes,
        CONVERT(decimal(10,2), 100.0 * ISNULL(r.qtde_atividades_total,0) / NULLIF(M.meta_atividades_mes,0)) AS pct_meta_atividades_mes,
        (M.meta_atividades_mes - ISNULL(r.qtde_atividades_total,0)) AS atividades_faltantes_meta,
        CONVERT(decimal(10,2), 100.0 * (M.meta_atividades_mes - ISNULL(r.qtde_atividades_total,0)) / NULLIF(M.meta_atividades_mes,0)) AS pct_atividades_faltantes_meta
      FROM RESUMO_CARTEIRA c
      LEFT JOIN RESUMO_ATIVIDADES r ON r.idVendedor = c.idVendedor
      LEFT JOIN VENDEDORES_NOMES v ON v.idVendedor = c.idVendedor
      CROSS JOIN META_PERIODO M
      WHERE c.idVendedor NOT IN (${IDS_BLOQUEADOS_SQL})
        AND (@IdVendedorFiltro IS NULL OR c.idVendedor = @IdVendedorFiltro)
      ORDER BY v.nmVendedor
    `;

    const dados = await query(sql);
    res.json({ sucesso: true, dados });
  } catch (err) {
    console.error('Erro Linhagro Resumo Geral:', err);
    res.status(500).json({
      sucesso: false,
      erro: 'Erro ao processar resumo geral Linhagro.',
      detalhe: err.message
    });
  }
});


app.get('/api/linhagro/evolucao', validarToken, async (req, res) => {
    try {
        const { dtInicio, dtFim, nmVendedor, status, tipoAtividade, periodo } = req.query;

        // Tratamento de datas
        const dtInicioSafe = limparData(dtInicio, DATA_PADRAO);
        const dtFimSafe = limparData(dtFim, new Date().toISOString().split('T')[0]);

        const vendedorSafe = sanitizar(nmVendedor);
        const statusSafe = (status && status !== 'null') ? Number(status) : 'NULL';
        const tipoSafe = (tipoAtividade && tipoAtividade !== 'null') ? Number(tipoAtividade) : 'NULL';
        const vendedorSQL = (vendedorSafe && vendedorSafe !== '') ? `CAST(${Number(vendedorSafe)} AS int)` : 'NULL';

        const headerSQL = `
            DECLARE @DataInicio datetime = '${dtInicioSafe}';
            DECLARE @DataFim datetime = '${dtFimSafe} 23:59:59';
            DECLARE @IdVendedorFiltro int = ${vendedorSQL};
            DECLARE @Status int = ${statusSafe};
            DECLARE @TipoAtv int = ${tipoSafe};
        `;

        const whereClause = `
            WHERE a.idVendedor NOT IN (${IDS_BLOQUEADOS_SQL})
            AND a.dtInicial >= @DataInicio
            AND a.dtInicial <= @DataFim
            AND (@Status IS NULL OR a.idStatus = @Status)
            AND (@TipoAtv IS NULL OR a.idTipoAtividade = @TipoAtv)
            AND (@IdVendedorFiltro IS NULL OR a.idVendedor = @IdVendedorFiltro)
        `;

        let sql = '';
        if (periodo === 'mes') {
            sql = `
                ${headerSQL}
                SELECT 
                    a.idVendedor, 
                    a.nmVendedor,
                    YEAR(a.dtInicial) as ano, 
                    MONTH(a.dtInicial) as mes, 
                    COUNT(*) as qtd
                FROM DWAW2.dbo.atividades a
                ${whereClause}
                GROUP BY a.idVendedor, a.nmVendedor, YEAR(a.dtInicial), MONTH(a.dtInicial)
                ORDER BY a.nmVendedor, ano, mes
            `;
        } else {
            sql = `
                ${headerSQL}
                SELECT 
                    a.idVendedor,
                    a.nmVendedor,
                    DATEPART(WEEK, a.dtInicial) as semana, 
                    COUNT(*) as qtd
                FROM DWAW2.dbo.atividades a
                ${whereClause}
                GROUP BY a.idVendedor, a.nmVendedor, DATEPART(WEEK, a.dtInicial)
                ORDER BY a.nmVendedor, semana
            `;
        }

        const dados = await query(sql);
        res.json({ sucesso: true, dados });

    } catch (err) { 
        console.error('Erro Evolucao Linhagro:', err);
        res.status(500).json({ 
            sucesso: false, 
            erro: 'Erro ao gerar evolução Linhagro.',
            detalhe: err.message 
        }); 
    }
});


app.get('/api/linhagro/distribuicao', validarToken, async (req, res) => {
    try {
        const { dtInicio, dtFim, nmVendedor, status, tipoAtividade } = req.query;

        // Tratamento de datas
        const dtInicioSafe = limparData(dtInicio, DATA_PADRAO);
        const dtFimSafe = limparData(dtFim, new Date().toISOString().split('T')[0]);

        const vendedorSafe = sanitizar(nmVendedor);
        const statusSafe = (status && status !== 'null') ? Number(status) : 'NULL';
        const tipoSafe = (tipoAtividade && tipoAtividade !== 'null') ? Number(tipoAtividade) : 'NULL';
        const vendedorSQL = (vendedorSafe && vendedorSafe !== '') ? `CAST(${Number(vendedorSafe)} AS int)` : 'NULL';

        const sql = `
            DECLARE @DataInicio datetime = '${dtInicioSafe}';
            DECLARE @DataFim datetime = '${dtFimSafe} 23:59:59';
            DECLARE @IdVendedorFiltro int = ${vendedorSQL};
            DECLARE @Status int = ${statusSafe};
            DECLARE @TipoAtv int = ${tipoSafe};

            SELECT 
                a.idVendedor,
                a.nmVendedor,
                t.nome as tipo_atividade, 
                COUNT(*) as qtd
            FROM DWAW2.dbo.atividades a
            JOIN DWAW2.dbo.tp_atividade t ON a.idTipoAtividade = t.idTipoAtividade
            WHERE a.idVendedor NOT IN (${IDS_BLOQUEADOS_SQL})
              AND a.dtInicial >= @DataInicio
              AND a.dtInicial <= @DataFim
              AND t.ativo = 1
              AND (@Status IS NULL OR a.idStatus = @Status)
              AND (@TipoAtv IS NULL OR a.idTipoAtividade = @TipoAtv)
              AND (@IdVendedorFiltro IS NULL OR a.idVendedor = @IdVendedorFiltro)
            GROUP BY a.idVendedor, a.nmVendedor, t.nome 
            ORDER BY a.nmVendedor, qtd DESC
        `;

        const dados = await query(sql);
        res.json({ sucesso: true, dados });

    } catch (err) { 
        console.error('Erro Distribuicao Linhagro:', err);
        res.status(500).json({ 
            sucesso: false, 
            erro: 'Erro ao gerar distribuição Linhagro.',
            detalhe: err.message 
        }); 
    }
});


app.get('/api/linhagro/filtros', validarToken, async (req, res) => {
    try {
        const sqlStatus = `SELECT DISTINCT idStatus as id, status as nome FROM DWAW2.dbo.atividades WHERE idVendedor NOT IN (${IDS_BLOQUEADOS_SQL}) AND status IS NOT NULL GROUP BY idStatus, status`;
        const sqlTipos = `SELECT DISTINCT t.idTipoAtividade as id, t.nome FROM DWAW2.dbo.atividades a JOIN DWAW2.dbo.tp_atividade t ON a.idTipoAtividade = t.idTipoAtividade WHERE a.idVendedor NOT IN (${IDS_BLOQUEADOS_SQL}) AND t.ativo = '1' ORDER BY t.nome`;
        const sqlVendedores = `SELECT DISTINCT a.idVendedor as id, a.nmVendedor as nome FROM DWAW2.dbo.atividades a WHERE a.idVendedor NOT IN (${IDS_BLOQUEADOS_SQL}) ORDER BY a.nmVendedor`;

        const [status, tipos, vendedores] = await Promise.all([query(sqlStatus), query(sqlTipos), query(sqlVendedores)]);

        res.json({ 
            sucesso: true, 
            vendedores,
            status, 
            tiposAtividade: tipos, 
            dataPadrao: DATA_PADRAO,
            idsBloqueados: IDS_BLOQUEADOS_LINHAGRO.length
        });
    } catch (err) { 
        console.error('Erro ao carregar filtros Linhagro:', err);
        res.status(500).json({ erro: 'Erro ao carregar filtros Linhagro.' }); 
    }
});


app.get('/api/linhagro/historico-global', validarToken, async (req, res) => {
    try {
        const { dtInicio, dtFim, nmVendedor, status, tipoAtividade } = req.query;
        
        // Tratamento de datas
        const dtInicioSafe = limparData(dtInicio, '2020-01-01');
        const dtFimSafe = limparData(dtFim, new Date().toISOString().split('T')[0]);

        const vendedorSafe = sanitizar(nmVendedor);
        const statusSafe = (status && status !== 'null') ? Number(status) : 'NULL';
        const tipoSafe = (tipoAtividade && tipoAtividade !== 'null') ? Number(tipoAtividade) : 'NULL';
        const vendedorSQL = (vendedorSafe && vendedorSafe !== '') ? `CAST(${Number(vendedorSafe)} AS int)` : 'NULL';

        const sql = `
            DECLARE @DataInicio datetime = '${dtInicioSafe}';
            DECLARE @DataFim datetime = '${dtFimSafe} 23:59:59';
            DECLARE @Status int = ${statusSafe};
            DECLARE @TipoAtv int = ${tipoSafe};
            DECLARE @IdVendedorFiltro int = ${vendedorSQL};

            SELECT 
                a.idVendedor,
                a.nmVendedor,
                YEAR(a.dtInicial) AS Ano, 
                MONTH(a.dtInicial) AS Mes, 
                COUNT(*) AS TotalAtividades
            FROM DWAW2.dbo.atividades a
            WHERE a.idVendedor NOT IN (${IDS_BLOQUEADOS_SQL})
            AND a.dtInicial >= @DataInicio
            AND a.dtInicial <= @DataFim
            AND (@Status IS NULL OR a.idStatus = @Status)
            AND (@TipoAtv IS NULL OR a.idTipoAtividade = @TipoAtv)
            AND (@IdVendedorFiltro IS NULL OR a.idVendedor = @IdVendedorFiltro)
            GROUP BY a.idVendedor, a.nmVendedor, YEAR(a.dtInicial), MONTH(a.dtInicial)
            ORDER BY a.nmVendedor, YEAR(a.dtInicial), MONTH(a.dtInicial)
        `;

        const dados = await query(sql);
        const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        
        const dadosFormatados = dados.map(item => ({
            idVendedor: item.idVendedor,
            nmVendedor: item.nmVendedor,
            ano: item.Ano,
            mes: item.Mes,
            nome_mes: mesesNomes[item.Mes - 1],
            rotulo: `${mesesNomes[item.Mes - 1]}/${item.Ano}`,
            total: item.TotalAtividades
        }));

        res.json({ 
            sucesso: true, 
            endpoint: 'historico-global', 
            filtros: { nmVendedor: vendedorSafe || 'Todos', dtInicio: dtInicioSafe, dtFim: dtFimSafe },
            dados: dadosFormatados 
        });

    } catch (err) {
        console.error('Erro Histórico Global Linhagro:', err);
        res.status(500).json({ sucesso: false, erro: 'Erro ao gerar histórico global Linhagro.' });
    }
});


// ==============================
// 5. ADMIN (USUÁRIOS)
// ==============================


app.post('/api/linhagro/admin/usuarios', validarToken, verificarAdmin, async (req, res) => {
    try {
        const { usuario, senha, email, perfil } = req.body;
        
        if(!usuario || !senha || !email) return res.status(400).json({erro: 'Usuário, Senha e Email são obrigatórios'});
        
        const dominiosPermitidos = ['@linhagro.com.br', '@lithoplant.com.br'];
        const emailValido = dominiosPermitidos.some(d => email.toLowerCase().endsWith(d));
        if (!emailValido) {
            return res.status(400).json({ erro: 'Email inválido! Use @linhagro.com.br ou @lithoplant.com.br' });
        }
        
        const usuarioSafe = sanitizar(usuario);
        const emailSafe = sanitizar(email);
        
        const resultado = await usuarios.criarUsuario(usuarioSafe, senha, emailSafe, perfil || 'consultor');
        res.status(resultado.sucesso ? 201 : 400).json(resultado);
    } catch(err) { 
        console.error(err);
        res.status(500).json({erro: 'Erro ao criar usuário.'}); 
    }
});


app.get('/api/linhagro/admin/usuarios', validarToken, verificarAdmin, async (req, res) => {
    try { 
        const lista = await usuarios.listarUsuarios(); 
        res.json({sucesso:true, usuarios: lista}); 
    } catch(err) { res.status(500).json({erro: 'Erro ao listar usuários.'}); }
});


app.put('/api/linhagro/admin/usuarios/:usuario/desativar', validarToken, verificarAdmin, async (req, res) => {
    try { 
        const usuarioSafe = sanitizar(req.params.usuario);
        const resDes = await usuarios.desativarUsuario(usuarioSafe); 
        res.json(resDes); 
    } catch(err) { res.status(500).json({erro: 'Erro ao desativar usuário.'}); }
});


// ==============================
// 6. START
// ==============================


const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=== API LINHAGRO v1.0 ===\nRodando em http://0.0.0.0:${PORT}\nAcesse: http://SEU_IP:${PORT}\n`);
});


module.exports = app;