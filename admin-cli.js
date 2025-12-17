// admin-cli.js - Versão Final Estável
require('dotenv').config();
const { query } = require('./db');
const bcrypt = require('bcrypt'); // Se der erro, use 'bcryptjs'
const readline = require('readline');

console.log('--- ADMIN CLI INICIADO ---');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Inicialização segura
(async () => {
    try {
        await query('SELECT 1'); // Wake up DB
        menu();
    } catch (err) {
        console.error('Falha crítica de conexão:', err.message);
        process.exit(1);
    }
})();

function menu() {
    console.log('\n=============================================');
    console.log('   GERENCIADOR DUALFORCE (DB: usuarios_api)');
    console.log('=============================================');
    console.log('1. Listar Usuários');
    console.log('2. Alterar Senha');
    console.log('3. Alterar Perfil');
    console.log('4. Ativar/Desativar');
    console.log('5. Criar Novo Usuário');
    console.log('6. Sair');
    
    rl.question('Escolha: ', async (opt) => {
        try {
            switch(opt) {
                case '1': await listar(); break;
                case '2': await alterarSenha(); break;
                case '3': await alterarPerfil(); break;
                case '4': await toggleStatus(); break;
                case '5': await criarUsuario(); break;
                case '6': 
                    console.log('Saindo...'); 
                    process.exit(0);
                    break;
                default: console.log('Opção inválida');
            }
        } catch (e) {
            console.error('Erro na operação:', e.message);
        }
        menu(); // Loop infinito
    });
}

// --- FUNÇÕES ---

async function listar() {
    // Busca os dados reais
    const res = await query("SELECT id, usuario, email, perfil, ativo, CONVERT(varchar, data_criacao, 103) as criado_em FROM usuarios_api");
    console.table(res);
}

async function criarUsuario() {
    return new Promise(resolve => {
        console.log('\n--- NOVO USUÁRIO ---');
        rl.question('Usuário: ', user => {
            rl.question('Email: ', email => {
                // Validação Simples
                if (!email.includes('@')) {
                    console.log('❌ Email inválido (falta @)'); resolve(); return;
                }
                
                rl.question('Senha: ', pass => {
                    rl.question('Perfil (admin/consultor): ', async perfil => {
                        try {
                            const hash = await bcrypt.hash(pass, 10);
                            await query(`
                                INSERT INTO usuarios_api (usuario, senha_hash, email, perfil, ativo, data_criacao, dashboards)
                                VALUES ('${user}', '${hash}', '${email}', '${perfil}', 1, GETDATE(), 'todos')
                            `);
                            console.log(`✅ Usuário ${user} criado!`);
                        } catch (e) { console.error('Erro:', e.message); }
                        resolve();
                    });
                });
            });
        });
    });
}

async function alterarSenha() {
    return new Promise(resolve => {
        rl.question('Qual usuário? ', user => {
            rl.question('Nova senha: ', async pass => {
                try {
                    const hash = await bcrypt.hash(pass, 10);
                    await query(`UPDATE usuarios_api SET senha_hash = '${hash}', data_atualizacao = GETDATE() WHERE usuario = '${user}'`);
                    console.log(`✅ Senha alterada!`);
                } catch(e) { console.error(e.message); }
                resolve();
            });
        });
    });
}

async function alterarPerfil() {
    return new Promise(resolve => {
        rl.question('Qual usuário? ', user => {
            rl.question('Novo perfil (admin/consultor): ', async perfil => {
                try {
                    await query(`UPDATE usuarios_api SET perfil = '${perfil}', data_atualizacao = GETDATE() WHERE usuario = '${user}'`);
                    console.log(`✅ Perfil alterado!`);
                } catch(e) { console.error(e.message); }
                resolve();
            });
        });
    });
}

async function toggleStatus() {
    return new Promise(resolve => {
        rl.question('Qual usuário? ', user => {
            rl.question('Ativar (1) ou Desativar (0)? ', async st => {
                try {
                    const bit = st === '1' ? 1 : 0;
                    await query(`UPDATE usuarios_api SET ativo = ${bit}, data_atualizacao = GETDATE() WHERE usuario = '${user}'`);
                    console.log(`✅ Status alterado!`);
                } catch(e) { console.error(e.message); }
                resolve();
            });
        });
    });
}
