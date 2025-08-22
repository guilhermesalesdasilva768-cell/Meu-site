const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const db = new sqlite3.Database('./ponto_gamificacao.db'); // Alterado para um nome mais descritivo do DB

app.use(cors());
app.use(express.json());

// Criação da tabela de usuários (única para ambos os sistemas)
// Adicionado 'moedas' diretamente na tabela de usuários para simplificar a gestão de saldo
db.run(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    moedas INTEGER DEFAULT 0
  )
`);

// Criação da tabela de pontos (associada aos usuários)
db.run(`
  CREATE TABLE IF NOT EXISTS pontos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    data TEXT,
    hora TEXT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  )
`);

// Rota de Cadastro de Usuário (para ambos os sistemas)
app.post('/api/cadastrar', (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ status: 'erro', mensagem: 'Dados incompletos: nome, email e senha são obrigatórios.' });
  }

  // Verificar se o email já existe
  db.get('SELECT id FROM usuarios WHERE email = ?', [email], (err, row) => {
    if (err) {
      return res.status(500).json({ status: 'erro', mensagem: 'Erro interno ao verificar usuário.' });
    }
    if (row) {
      return res.status(409).json({ status: 'erro', mensagem: 'Este email já está cadastrado.' });
    }

    // Inserir novo usuário
    db.run(
      `INSERT INTO usuarios (nome, email, senha, moedas) VALUES (?, ?, ?, ?)`,
      [nome, email, senha, 0], // Começa com 0 moedas
      function (err) {
        if (err) {
          console.error("Erro ao cadastrar usuário:", err.message);
          return res.status(500).json({ status: 'erro', mensagem: 'Erro ao cadastrar usuário.' });
        }
        res.status(201).json({ status: 'sucesso', mensagem: 'Usuário cadastrado com sucesso!', usuario_id: this.lastID });
      }
    );
  });
});

// Rota de Login (para ambos os sistemas)
app.post('/api/login', (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ status: 'erro', mensagem: 'Email e senha são obrigatórios.' });
  }

  db.get(
    `SELECT id, nome, email, moedas FROM usuarios WHERE email = ? AND senha = ?`,
    [email, senha], // Lembre-se: Senha em texto puro não é seguro!
    (err, row) => {
      if (err) {
        console.error("Erro no login:", err.message);
        return res.status(500).json({ status: 'erro', mensagem: 'Erro interno do servidor.' });
      }
      if (!row) {
        return res.status(401).json({ status: 'erro', mensagem: 'Email ou senha inválidos.' });
      }
      // Login bem-sucedido
      res.json({ status: 'sucesso', mensagem: 'Login bem-sucedido!', usuario: { id: row.id, nome: row.nome, email: row.email, moedas: row.moedas } });
    }
  );
});

// Rota de Ponto
app.post('/api/ponto', (req, res) => {
  const { usuario_id } = req.body; // Agora usamos o ID do usuário
  if (!usuario_id) {
    return res.status(400).json({ status: 'erro', mensagem: 'ID do usuário é obrigatório para registrar o ponto.' });
  }

  const agora = new Date();
  // Formato da data e hora para compatibilidade com o frontend
  const data = agora.toLocaleDateString('pt-BR');
  const hora = agora.toLocaleTimeString('pt-BR');
  const moedasGanhas = 10; // Moedas a serem adicionadas ao bater o ponto

  db.serialize(() => {
    // 1. Inserir o registro de ponto
    db.run(
      `INSERT INTO pontos (usuario_id, data, hora) VALUES (?, ?, ?)`,
      [usuario_id, data, hora],
      function (err) {
        if (err) {
          console.error("Erro ao registrar ponto:", err.message);
          return res.status(500).json({ status: 'erro', mensagem: 'Erro ao registrar ponto.' });
        }

        // 2. Atualizar as moedas do usuário
        db.run(
          `UPDATE usuarios SET moedas = moedas + ? WHERE id = ?`,
          [moedasGanhas, usuario_id],
          function (errUpdate) {
            if (errUpdate) {
              console.error("Erro ao atualizar moedas:", errUpdate.message);
              return res.status(500).json({ status: 'erro', mensagem: 'Ponto registrado, mas erro ao adicionar moedas.' });
            }
            res.json({ status: 'sucesso', mensagem: 'Ponto registrado e moedas adicionadas!', moedasAdicionadas: moedasGanhas });
          }
        );
      }
    );
  });
});

// Rota para obter moedas do usuário (agora busca diretamente da tabela de usuários)
app.get('/api/moedas/:usuario_id', (req, res) => {
  const usuario_id = req.params.usuario_id;

  db.get(
    `SELECT moedas FROM usuarios WHERE id = ?`,
    [usuario_id],
    (err, row) => {
      if (err) {
        console.error("Erro ao buscar moedas:", err.message);
        return res.status(500).json({ status: 'erro', mensagem: 'Erro ao buscar moedas.' });
      }
      if (!row) {
        return res.status(404).json({ status: 'erro', mensagem: 'Usuário não encontrado.' });
      }
      res.json({ status: 'sucesso', moedas: row.moedas });
    }
  );
});

// Rota para listar histórico de pontos de um usuário
app.get('/api/pontos/:usuario_id', (req, res) => {
  const usuario_id = req.params.usuario_id;

  db.all(
    `SELECT data, hora FROM pontos WHERE usuario_id = ? ORDER BY id DESC`,
    [usuario_id],
    (err, rows) => {
      if (err) {
        console.error("Erro ao buscar histórico de pontos:", err.message);
        return res.status(500).json({ status: 'erro', mensagem: 'Erro ao buscar histórico de pontos.' });
      }
      res.json({ status: 'sucesso', pontos: rows });
    }
  );
});


app.listen(3000, () => {
  console.log('✅ Servidor rodando em http://localhost:3000');
});


