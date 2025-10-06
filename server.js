const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
<<<<<<< HEAD
const multer = require('multer');
=======
>>>>>>> cf0ae7569a9f41fa9d772274e92efb97abc72fa5

const app = express();
const PORT = process.env.PORT || 3000;

<<<<<<< HEAD
// ✅ CORS
=======
// CORS liberado para qualquer origem
>>>>>>> cf0ae7569a9f41fa9d772274e92efb97abc72fa5
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

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

<<<<<<< HEAD
// ================== UPLOAD DE AVATAR ==================
=======
// ================== UPLOAD DE AVATAR POR BASE64 ==================
>>>>>>> cf0ae7569a9f41fa9d772274e92efb97abc72fa5
const avatarsDir = path.join(__dirname, 'public', 'avatars');
if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true });
}

<<<<<<< HEAD
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, avatarsDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, req.body.usuario_id + ext);
    }
});
const upload = multer({ storage: storage });

app.post('/api/upload-avatar', upload.single('avatar'), (req, res) => {
    const usuario_id = req.body.usuario_id;
    if (!usuario_id || !req.file) {
        return res.status(400).json({ status: 'erro', mensagem: 'ID do usuário e arquivo são obrigatórios.' });
    }
    // Para produção/render, usar URL absoluta:
    const avatarUrl = `${req.protocol}://${req.get('host')}/avatars/${req.file.filename}`;
    db.run(`UPDATE ranking SET avatar = ? WHERE id = ?`, [avatarUrl, usuario_id], function (err) {
        if (err) {
            return res.status(500).json({ status: 'erro', mensagem: 'Erro ao atualizar avatar.' });
        }
        res.json({ status: 'sucesso', avatarUrl: avatarUrl });
=======
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
>>>>>>> cf0ae7569a9f41fa9d772274e92efb97abc72fa5
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

// Top 3
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

// Cadastro de colaborador (MATRICULA agora)
app.post('/api/cadastrar', (req, res) => {
    const { nome, matricula, senha } = req.body;
    if (!nome || !matricula || !senha) {
        return res.status(400).json({ status: 'erro', mensagem: 'Nome, matrícula e senha são obrigatórios.' });
    }
    db.get(`SELECT id FROM ranking WHERE matricula = ?`, [matricula], (err, row) => {
        if (err) return res.status(500).json({ status: 'erro', mensagem: 'Erro ao verificar a matrícula.' });
        if (row) return res.status(409).json({ status: 'erro', mensagem: 'Esta matrícula já está cadastrada.' });

        const id = crypto.randomUUID();
<<<<<<< HEAD
        const avatar = "https://via.placeholder.com/80";  

        db.run(`INSERT INTO ranking (id, nome, email, senha, avatar, bip) VALUES (?, ?, ?, ?, ?, ?)`, 
            [id, nome, email, senha, avatar, 0],
=======
        const avatar = "https://via.placeholder.com/80";
        db.run(`INSERT INTO ranking (id, nome, matricula, senha, avatar, bip, tipoUsuario) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, nome, matricula, senha, avatar, 0, "colaborador"],
>>>>>>> cf0ae7569a9f41fa9d772274e92efb97abc72fa5
            function (err) {
                if (err) {
                    return res.status(500).json({ status: 'erro', mensagem: 'Erro interno ao cadastrar o usuário.' });
                }
                res.status(201).json({ status: 'sucesso', mensagem: 'Usuário cadastrado com sucesso!', usuario_id: id });
            }
        );
    });
});

// Cadastro de gestor (PainelAdmin)
app.post('/api/cadastrar-gestor', (req, res) => {
    const { nome, matricula, senha } = req.body;
    if (!nome || !matricula || !senha) {
        return res.status(400).json({ status: 'erro', mensagem: 'Nome, matrícula e senha são obrigatórios.' });
    }
    db.get(`SELECT id FROM ranking WHERE matricula = ?`, [matricula], (err, row) => {
        if (err) return res.status(500).json({ status: 'erro', mensagem: 'Erro ao verificar matrícula.' });
        if (row) return res.status(409).json({ status: 'erro', mensagem: 'Essa matrícula já está cadastrada.' });

        const id = crypto.randomUUID();
        const avatar = "https://via.placeholder.com/80";
        db.run(
            `INSERT INTO ranking (id, nome, matricula, senha, avatar, bip, tipoUsuario) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, nome, matricula, senha, avatar, 0, "gestor"],
            function (err) {
                if (err) {
                    return res.status(500).json({ status: 'erro', mensagem: 'Erro ao cadastrar gestor.' });
                }
                res.status(201).json({ status: 'sucesso', mensagem: 'Gestor cadastrado com sucesso!', usuario_id: id });
            }
        );
    });
});

// Login (MATRICULA agora)
app.post('/api/login', (req, res) => {
    const { matricula, senha } = req.body;
    if (!matricula || !senha) {
        return res.status(400).json({ status: 'erro', mensagem: 'Matrícula e senha são obrigatórios.' });
    }
    db.get(`SELECT id, nome, avatar, bip, tipoUsuario FROM ranking WHERE matricula = ? AND senha = ?`, [matricula, senha], (err, usuario) => {
        if (err) return res.status(500).json({ status: 'erro', mensagem: 'Erro interno do servidor.' });
        if (!usuario) return res.status(401).json({ status: 'erro', mensagem: 'Matrícula ou senha incorretos.' });

        res.status(200).json({
            status: 'sucesso',
            mensagem: 'Login realizado com sucesso!',
            usuario: usuario
        });
    });
});

<<<<<<< HEAD
// 🔹 Buscar usuário logado por ID
=======
// Buscar usuário logado por ID
>>>>>>> cf0ae7569a9f41fa9d772274e92efb97abc72fa5
app.get('/api/usuario-logado/:id', (req, res) => {
    const usuario_id = req.params.id;
    db.get(`SELECT id, nome, avatar, bip, tipoUsuario FROM ranking WHERE id = ?`, [usuario_id], (err, usuario) => {
        if (err) return res.status(500).json({ status: 'erro', mensagem: 'Erro ao buscar usuário.' });
        if (!usuario) return res.status(404).json({ status: 'erro', mensagem: 'Usuário não encontrado.' });
        res.json({ status: 'sucesso', usuario });
    });
});

<<<<<<< HEAD
// 🔹 Registrar ponto (+5 moedas)
=======
// Registrar ponto (+5 moedas)
>>>>>>> cf0ae7569a9f41fa9d772274e92efb97abc72fa5
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

// 🔹 Histórico de pontos
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

<<<<<<< HEAD
// 🔹 Buscar apenas moedas do usuário
app.get('/api/moedas/:id', (req, res) => {
    const usuario_id = req.params.id;

=======
// Buscar apenas moedas do usuário
app.get('/api/moedas/:id', (req, res) => {
    const usuario_id = req.params.id;
>>>>>>> cf0ae7569a9f41fa9d772274e92efb97abc72fa5
    db.get(`SELECT bip FROM ranking WHERE id = ?`, [usuario_id], (err, row) => {
        if (err) {
            return res.status(500).json({ status: 'erro', mensagem: 'Erro ao buscar moedas.' });
        }
        if (!row) {
            return res.status(404).json({ status: 'erro', mensagem: 'Usuário não encontrado.' });
        }
<<<<<<< HEAD

=======
>>>>>>> cf0ae7569a9f41fa9d772274e92efb97abc72fa5
        res.json({ status: 'sucesso', moedas: row.bip });
    });
});

<<<<<<< HEAD
// 🔹 Resetar ranking (manual)
app.post('/api/reset-ranking', (req, res) => {
    db.run(`UPDATE ranking SET bip = 0`, [], function(err) {
=======
// Resetar ranking (manual)
app.post('/api/reset-ranking', (req, res) => {
    db.run(`UPDATE ranking SET bip = 0`, [], function (err) {
>>>>>>> cf0ae7569a9f41fa9d772274e92efb97abc72fa5
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
<<<<<<< HEAD







=======
>>>>>>> cf0ae7569a9f41fa9d772274e92efb97abc72fa5
