const bcrypt = require('bcryptjs');

const senha = 'NovaSenha@123'; // coloque aqui a nova senha que você quer

bcrypt.hash(senha, 10).then(hash => {
  console.log('Senha em texto  :', senha);
  console.log('Hash gerado     :', hash);
}).catch(err => {
  console.error(err);
});
