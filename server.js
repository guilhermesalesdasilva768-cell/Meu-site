const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Novas dependências para sessão e hashing
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS liberado para qualquer origem (em produção restrinja)
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Configuração de sessão (em produção troque secret e use store como Redis)
app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET || 'troque_essa_chave_em_producao',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 3600 * 1000 // 8 horas
  }
}));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rota explícita para dashboard
app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ================== BANCO DE DADOS ==================
const db = new sqlite3.Database('./ranking.db', (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco:', err.message);
    } else {
        console.log('Banco de dados conectado com sucesso!');
    }
});

// Cria a tabela ranking com campo tipoUsuario e MATRICULA!
db.run(`
    CREATE TABLE IF NOT EXISTS ranking (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        matricula TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        avatar TEXT,
        bip INTEGER DEFAULT 0,
        tipoUsuario TEXT DEFAULT 'colaborador'
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS pontos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id TEXT NOT NULL,
        data_ponto TEXT NOT NULL,
        hora_ponto TEXT NOT NULL,
        FOREIGN KEY (usuario_id) REFERENCES ranking(id)
    )
`);

// ================== UPLOAD DE AVATAR POR BASE64 ==================
const avatarsDir = path.join(__dirname, 'public', 'avatars');
if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true });
}

app.post('/api/upload-avatar', (req, res) => {
    const { usuario_id, avatarBase64 } = req.body;
    if (!usuario_id || !avatarBase64) {
        return res.status(400).json({ status: 'erro', mensagem: 'ID do usuário e avatarBase64 são obrigatórios.' });
    }
    const matches = avatarBase64.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches) {
        return res.status(400).json({ status: 'erro', mensagem: 'Formato do avatar inválido.' });
    }
    const ext = matches[1];
    const data = matches[2];
    const buffer = Buffer.from(data, 'base64');
    const filename = `${usuario_id}.${ext}`;
    const filePath = path.join(avatarsDir, filename);

    fs.writeFile(filePath, buffer, (err) => {
        if (err) {
            return res.status(500).json({ status: 'erro', mensagem: 'Erro ao salvar imagem.' });
        }
        const avatarUrl = `${req.protocol}://${req.get('host')}/avatars/${filename}`;
        db.run(`UPDATE ranking SET avatar = ? WHERE id = ?`, [avatarUrl, usuario_id], function (err) {
            if (err) {
                return res.status(500).json({ status: 'erro', mensagem: 'Erro ao atualizar avatar.' });
            }
            res.json({ status: 'sucesso', avatarUrl: avatarUrl });
        });
    });
});

// ================== AUTENTICAÇÃO / MIDDLEWARES ==================

// Middleware que verifica se sessão existe
function authenticateSession(req, res, next) {
  if (req.session && req.session.user && req.session.user.id) return next();
  return res.status(401).json({ status: 'erro', mensagem: 'Não autenticado' });
}

// Middleware que exige que usuário seja gestor/admin
function requireGestor(req, res, next) {
  if (!req.session || !req.session.user || !req.session.user.id) return res.status(401).json({ status: 'erro', mensagem: 'Não autenticado' });
  const userId = req.session.user.id;
  db.get(`SELECT tipoUsuario FROM ranking WHERE id = ?`, [userId], (err, row) => {
    if (err) {
      console.error('Erro ao verificar tipoUsuario:', err);
      return res.status(500).json({ status: 'erro', mensagem: 'Erro interno' });
    }
    if (!row || (row.tipoUsuario !== 'gestor' && row.tipoUsuario !== 'admin')) {
      return res.status(403).json({ status: 'erro', mensagem: 'Acesso negado' });
    }
    next();
  });
}

// Rota para o frontend checar quem está logado
app.get('/api/me', authenticateSession, (req, res) => {
  const id = req.session.user.id;
  db.get(`SELECT id, nome, avatar, bip, tipoUsuario FROM ranking WHERE id = ?`, [id], (err, usuario) => {
    if (err) return res.status(500).json({ status: 'erro', mensagem: 'Erro ao buscar usuário' });
    if (!usuario) return res.status(404).json({ status: 'erro', mensagem: 'Usuário não encontrado' });
    res.json({ status: 'sucesso', usuario });
  });
});

// ================== ROTAS API ==================

// Ranking completo
app.get('/api/ranking', (req, res) => {
    db.all(`SELECT id, nome, avatar, bip FROM ranking ORDER BY bip DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Top 3 (mantido)
app.get('/api/ranking/top3', (req, res) => {
    db.all(`SELECT id, nome, avatar, bip FROM ranking ORDER BY bip DESC LIMIT 3`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Atualizar ou inserir no ranking
app.post('/api/ranking', (req, res) => {
    const { id, nome, avatar, bip } = req.body;
    if (!id || !nome) {
        return res.status(400).json({ error: 'ID e Nome são obrigatórios' });
    }
    db.run(`
        INSERT INTO ranking (id, nome, avatar, bip)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            nome = excluded.nome,
            avatar = excluded.avatar,
            bip = excluded.bip
    `, [id, nome, avatar, bip], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: 'sucesso', message: 'Usuário atualizado no ranking' });
    });
});

// Cadastro de colaborador (MATRICULA agora) - com hash bcrypt
app.post('/api/cadastrar', async (req, res) => {
    const { nome, matricula, senha } = req.body;
    if (!nome || !matricula || !senha) {
        return res.status(400).json({ status: 'erro', mensagem: 'Nome, matrícula e senha são obrigatórios.' });
    }
    db.get(`SELECT id FROM ranking WHERE matricula = ?`, [matricula], async (err, row) => {
        if (err) {
            console.error("Erro ao verificar matrícula:", err);
            return res.status(500).json({ status: 'erro', mensagem: 'Erro ao verificar a matrícula.' });
        }
        if (row) return res.status(409).json({ status: 'erro', mensagem: 'Esta matrícula já está cadastrada.' });

        // Hash da senha
        try {
          const hash = await bcrypt.hash(senha, 12);
          const id = crypto.randomUUID();
          const avatar = "https://via.placeholder.com/80";
          db.run(`INSERT INTO ranking (id, nome, matricula, senha, avatar, bip, tipoUsuario) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, nome, matricula, hash, avatar, 0, "colaborador"],
            function (err) {
                if (err) {
                    console.error("Erro ao cadastrar usuário:", err);
                    return res.status(500).json({ status: 'erro', mensagem: 'Erro interno ao cadastrar o usuário.' });
                }
                res.status(201).json({ status: 'sucesso', mensagem: 'Usuário cadastrado com sucesso!', usuario_id: id });
            }
          );
        } catch (e) {
          console.error('Erro ao hashear senha:', e);
          return res.status(500).json({ status: 'erro', mensagem: 'Erro interno' });
        }
    });
});

// Cadastro de gestor (PainelAdmin) - protegido: apenas gestores/admins podem criar
app.post('/api/cadastrar-gestor', authenticateSession, requireGestor, async (req, res) => {
    const { nome, matricula, senha } = req.body;
    if (!nome || !matricula) {
        return res.status(400).json({ status: 'erro', mensagem: 'Nome e matrícula são obrigatórios.' });
    }
    db.get(`SELECT id FROM ranking WHERE matricula = ?`, [matricula], async (err, row) => {
        if (err) return res.status(500).json({ status: 'erro', mensagem: 'Erro ao verificar matrícula.' });
        if (row) return res.status(409).json({ status: 'erro', mensagem: 'Essa matrícula já está cadastrada.' });

        try {
            const hash = senha ? await bcrypt.hash(senha, 12) : '';
            const id = crypto.randomUUID();
            const avatar = "https://via.placeholder.com/80";
            db.run(
                `INSERT INTO ranking (id, nome, matricula, senha, avatar, bip, tipoUsuario) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [id, nome, matricula, hash, avatar, 0, "gestor"],
                function (err) {
                    if (err) {
                        return res.status(500).json({ status: 'erro', mensagem: 'Erro ao cadastrar gestor.' });
                    }
                    res.status(201).json({ status: 'sucesso', mensagem: 'Gestor cadastrado com sucesso!', usuario_id: id });
                }
            );
        } catch (e) {
            console.error(e);
            res.status(500).json({ status: 'erro', mensagem: 'Erro interno ao cadastrar gestor.' });
        }
    });
});

// Login (MATRICULA agora) - cria sessão
app.post('/api/login', (req, res) => {
    const { matricula, senha } = req.body;
    if (!matricula || !senha) {
        return res.status(400).json({ status: 'erro', mensagem: 'Matrícula e senha são obrigatórios.' });
    }
    db.get(`SELECT id, nome, avatar, bip, tipoUsuario, senha FROM ranking WHERE matricula = ?`, [matricula], async (err, usuario) => {
        if (err) {
            console.error('Erro no login:', err);
            return res.status(500).json({ status: 'erro', mensagem: 'Erro interno do servidor.' });
        }
        if (!usuario) return res.status(401).json({ status: 'erro', mensagem: 'Matrícula ou senha incorretos.' });

        try {
          const match = await bcrypt.compare(senha, usuario.senha || '');
          if (!match) return res.status(401).json({ status: 'erro', mensagem: 'Matrícula ou senha incorretos.' });
        } catch (e) {
          console.error('Erro ao comparar senha:', e);
          return res.status(500).json({ status: 'erro', mensagem: 'Erro interno' });
        }

        // cria sessão
        req.session.user = { id: usuario.id, tipoUsuario: usuario.tipoUsuario };
        // não retornar a senha
        delete usuario.senha;

        res.status(200).json({
            status: 'sucesso',
            mensagem: 'Login realizado com sucesso!',
            usuario: usuario
        });
    });
});

// Logout (encerra sessão)
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ status: 'erro', mensagem: 'Erro ao encerrar sessão.' });
    }
    res.clearCookie('sid');
    res.json({ status: 'sucesso', mensagem: 'Logout realizado.' });
  });
});

// Buscar usuário logado por ID (mantido)
app.get('/api/usuario-logado/:id', (req, res) => {
    const usuario_id = req.params.id;
    db.get(`SELECT id, nome, avatar, bip, tipoUsuario FROM ranking WHERE id = ?`, [usuario_id], (err, usuario) => {
        if (err) return res.status(500).json({ status: 'erro', mensagem: 'Erro ao buscar usuário.' });
        if (!usuario) return res.status(404).json({ status: 'erro', mensagem: 'Usuário não encontrado.' });
        res.json({ status: 'sucesso', usuario });
    });
});

// Rotas de gestão para o painel admin (protegidas)
app.get('/api/gestao/gestores', authenticateSession, requireGestor, (req, res) => {
  db.all(`SELECT id, nome, matricula, tipoUsuario FROM ranking WHERE tipoUsuario IN ('gestor','admin') ORDER BY nome`, [], (err, rows) => {
    if (err) return res.status(500).json({ status: 'erro', mensagem: 'Erro ao buscar gestores' });
    res.json(rows);
  });
});

app.delete('/api/gestao/gestores/:id', authenticateSession, requireGestor, (req, res) => {
  const id = req.params.id;
  db.run(`DELETE FROM ranking WHERE id = ? AND tipoUsuario IN ('gestor','admin')`, [id], function(err) {
    if (err) return res.status(500).json({ status: 'erro', mensagem: 'Erro ao remover gestor.'});
    if (this.changes === 0) return res.status(404).json({ status: 'erro', mensagem: 'Gestor não encontrado.'});
    res.json({ status: 'sucesso', mensagem: 'Gestor removido.'});
  });
});

// Registrar ponto (+5 moedas)
app.post('/api/ponto', (req, res) => {
    const { usuario_id } = req.body;
    if (!usuario_id) {
        return res.status(400).json({ status: 'erro', mensagem: 'ID do usuário é obrigatório.' });
    }
    const moedasAdicionadas = 5;

    db.serialize(() => {
        db.run(`UPDATE ranking SET bip = bip + ? WHERE id = ?`,
            [moedasAdicionadas, usuario_id],
            function (err) {
                if (err) {
                    return res.status(500).json({ status: 'erro', mensagem: 'Erro ao atualizar BIP.' });
                }
                const dataAtual = new Date().toLocaleDateString('pt-BR');
                const horaAtual = new Date().toLocaleTimeString('pt-BR', { hour12: false });
                db.run(`INSERT INTO pontos (usuario_id, data_ponto, hora_ponto) VALUES (?, ?, ?)`,
                    [usuario_id, dataAtual, horaAtual],
                    function (err) {
                        if (err) {
                            return res.status(500).json({ status: 'erro', mensagem: 'Erro ao registrar ponto.' });
                        }
                        db.get(`SELECT bip FROM ranking WHERE id = ?`, [usuario_id], (err, row) => {
                            if (err || !row) {
                                return res.status(500).json({ status: 'erro', mensagem: 'Erro ao buscar o novo total de BIP.' });
                            }
                            res.status(200).json({
                                status: 'sucesso',
                                mensagem: 'Ponto registrado com sucesso!',
                                moedas: row.bip
                            });
                        });
                    }
                );
            }
        );
    });
});

// Histórico de pontos
app.get('/api/pontos/:id', (req, res) => {
    const usuario_id = req.params.id;
    const moedasAdicionadas = 5;

    db.all(`SELECT data_ponto, hora_ponto FROM pontos WHERE usuario_id = ? ORDER BY data_ponto DESC, hora_ponto DESC`,
        [usuario_id],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ status: 'erro', mensagem: 'Erro ao buscar histórico de pontos.' });
            }
            const pontosComMoedas = rows.map(ponto => ({
                data: ponto.data_ponto,
                hora: ponto.hora_ponto,
                moedas: moedasAdicionadas
            }));
            res.status(200).json({ status: 'sucesso', pontos: pontosComMoedas });
        }
    );
});

// Buscar apenas moedas do usuário
app.get('/api/moedas/:id', (req, res) => {
    const usuario_id = req.params.id;
    db.get(`SELECT bip FROM ranking WHERE id = ?`, [usuario_id], (err, row) => {
        if (err) {
            return res.status(500).json({ status: 'erro', mensagem: 'Erro ao buscar moedas.' });
        }
        if (!row) {
            return res.status(404).json({ status: 'erro', mensagem: 'Usuário não encontrado.' });
        }
        res.json({ status: 'sucesso', moedas: row.bip });
    });
});

// Resetar ranking (manual)
app.post('/api/reset-ranking', (req, res) => {
    db.run(`UPDATE ranking SET bip = 0`, [], function (err) {
        if (err) {
            return res.status(500).json({ status: 'erro', mensagem: 'Erro ao resetar ranking.' });
        }
        res.json({ status: 'sucesso', mensagem: 'Ranking resetado com sucesso!' });
    });
});

// ================== START SERVER ==================
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
