const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS liberado
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
    if (err) console.error('Erro ao conectar ao banco:', err.message);
    else console.log('Banco de dados conectado com sucesso!');
});

// Tabelas principais
db.serialize(() => {
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

    // Tabelas da Gestão
    db.run(`
        CREATE TABLE IF NOT EXISTS campaigns (
            id TEXT PRIMARY KEY,
            tipo TEXT,
            titulo TEXT,
            perguntas TEXT,
            criadoEm TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS rewards (
            id TEXT PRIMARY KEY,
            nome TEXT,
            qtd INTEGER
        )
    `);
});

// ================== UPLOAD DE AVATAR ==================
const avatarsDir = path.join(__dirname, 'public', 'avatars');
if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

app.post('/api/upload-avatar', (req, res) => {
    const { usuario_id, avatarBase64 } = req.body;
    if (!usuario_id || !avatarBase64)
        return res.status(400).json({ status: 'erro', mensagem: 'ID e avatarBase64 são obrigatórios.' });

    const matches = avatarBase64.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches)
        return res.status(400).json({ status: 'erro', mensagem: 'Formato de imagem inválido.' });

    const ext = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = `${usuario_id}.${ext}`;
    const filePath = path.join(avatarsDir, filename);

    fs.writeFile(filePath, buffer, (err) => {
        if (err)
            return res.status(500).json({ status: 'erro', mensagem: 'Erro ao salvar imagem.' });

        const avatarUrl = `${req.protocol}://${req.get('host')}/avatars/${filename}`;
        db.run(`UPDATE ranking SET avatar = ? WHERE id = ?`, [avatarUrl, usuario_id], function (err) {
            if (err)
                return res.status(500).json({ status: 'erro', mensagem: 'Erro ao atualizar avatar.' });
            res.json({ status: 'sucesso', avatarUrl });
        });
    });
});

// ================== ROTAS DO SISTEMA ==================

// Ranking completo
app.get('/api/ranking', (req, res) => {
    db.all(`SELECT id, nome, avatar, bip, tipoUsuario, matricula FROM ranking ORDER BY bip DESC`, [], (err, rows) => {
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

// Atualizar ou inserir ranking
app.post('/api/ranking', (req, res) => {
    const { id, nome, avatar, bip } = req.body;
    if (!id || !nome)
        return res.status(400).json({ error: 'ID e Nome são obrigatórios' });

    db.run(`
        INSERT INTO ranking (id, nome, avatar, bip)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, avatar = excluded.avatar, bip = excluded.bip
    `, [id, nome, avatar, bip], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: 'sucesso', message: 'Usuário atualizado no ranking' });
    });
});

// Cadastro colaborador
app.post('/api/cadastrar', (req, res) => {
    const { nome, matricula, senha } = req.body;
    if (!nome || !matricula || !senha)
        return res.status(400).json({ status: 'erro', mensagem: 'Campos obrigatórios ausentes.' });

    db.get(`SELECT id FROM ranking WHERE matricula = ?`, [matricula], (err, row) => {
        if (err) return res.status(500).json({ status: 'erro', mensagem: 'Erro ao verificar matrícula.' });
        if (row) return res.status(409).json({ status: 'erro', mensagem: 'Matrícula já cadastrada.' });

        const id = crypto.randomUUID();
        const avatar = 'https://via.placeholder.com/80';
        db.run(
            `INSERT INTO ranking (id, nome, matricula, senha, avatar, bip, tipoUsuario) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, nome, matricula, senha, avatar, 0, 'colaborador'],
            function (err) {
                if (err) return res.status(500).json({ status: 'erro', mensagem: 'Erro ao cadastrar usuário.' });
                res.status(201).json({ status: 'sucesso', usuario_id: id });
            }
        );
    });
});

// Cadastro de gestor
app.post('/api/cadastrar-gestor', (req, res) => {
    const { nome, matricula, senha } = req.body;
    if (!nome || !matricula || !senha)
        return res.status(400).json({ status: 'erro', mensagem: 'Campos obrigatórios ausentes.' });

    db.get(`SELECT id FROM ranking WHERE matricula = ?`, [matricula], (err, row) => {
        if (err) return res.status(500).json({ status: 'erro', mensagem: 'Erro ao verificar matrícula.' });
        if (row) return res.status(409).json({ status: 'erro', mensagem: 'Matrícula já cadastrada.' });

        const id = crypto.randomUUID();
        const avatar = 'https://via.placeholder.com/80';
        db.run(
            `INSERT INTO ranking (id, nome, matricula, senha, avatar, bip, tipoUsuario) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, nome, matricula, senha, avatar, 0, 'gestor'],
            function (err) {
                if (err) return res.status(500).json({ status: 'erro', mensagem: 'Erro ao cadastrar gestor.' });
                res.status(201).json({ status: 'sucesso', usuario_id: id });
            }
        );
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { matricula, senha } = req.body;
    if (!matricula || !senha)
        return res.status(400).json({ status: 'erro', mensagem: 'Matrícula e senha são obrigatórias.' });

    db.get(`SELECT id, nome, avatar, bip, tipoUsuario FROM ranking WHERE matricula = ? AND senha = ?`, [matricula, senha], (err, usuario) => {
        if (err) return res.status(500).json({ status: 'erro', mensagem: 'Erro interno.' });
        if (!usuario) return res.status(401).json({ status: 'erro', mensagem: 'Credenciais inválidas.' });
        res.json({ status: 'sucesso', usuario });
    });
});

// Buscar usuário logado
app.get('/api/usuario-logado/:id', (req, res) => {
    db.get(`SELECT id, nome, avatar, bip, tipoUsuario FROM ranking WHERE id = ?`, [req.params.id], (err, usuario) => {
        if (err) return res.status(500).json({ status: 'erro', mensagem: 'Erro ao buscar usuário.' });
        if (!usuario) return res.status(404).json({ status: 'erro', mensagem: 'Usuário não encontrado.' });
        res.json({ status: 'sucesso', usuario });
    });
});

// Registrar ponto (+5 BIPs)
app.post('/api/ponto', (req, res) => {
    const { usuario_id } = req.body;
    if (!usuario_id) return res.status(400).json({ status: 'erro', mensagem: 'ID do usuário é obrigatório.' });

    const moedasAdicionadas = 5;
    db.serialize(() => {
        db.run(`UPDATE ranking SET bip = bip + ? WHERE id = ?`, [moedasAdicionadas, usuario_id]);
        const data = new Date().toLocaleDateString('pt-BR');
        const hora = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        db.run(`INSERT INTO pontos (usuario_id, data_ponto, hora_ponto) VALUES (?, ?, ?)`, [usuario_id, data, hora]);
    });
    res.json({ status: 'sucesso', mensagem: 'Ponto registrado!' });
});

// Histórico de pontos
app.get('/api/pontos/:id', (req, res) => {
    db.all(`SELECT data_ponto, hora_ponto FROM pontos WHERE usuario_id = ? ORDER BY id DESC LIMIT 10`, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ status: 'erro', mensagem: 'Erro ao buscar pontos.' });
        const pontos = rows.map(p => ({ data: p.data_ponto, hora: p.hora_ponto, moedas: 5 }));
        res.json({ status: 'sucesso', pontos });
    });
});

// ================== ROTAS DE GESTÃO ==================

// Criar nova campanha / quiz
app.post('/api/campaign', (req, res) => {
    const { tipo, titulo, perguntas } = req.body;
    if (!tipo || !titulo) return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });

    const id = crypto.randomUUID();
    db.run(`INSERT INTO campaigns (id, tipo, titulo, perguntas, criadoEm) VALUES (?, ?, ?, ?, ?)`,
        [id, tipo, titulo, JSON.stringify(perguntas || []), new Date().toISOString()],
        (err) => {
            if (err) return res.status(500).json({ error: 'Erro ao criar campanha.' });
            res.status(201).json({ status: 'sucesso', campaign: { id, tipo, titulo, perguntas } });
        });
});

// Listar campanhas
app.get('/api/campaigns', (req, res) => {
    db.all(`SELECT * FROM campaigns`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Erro ao listar campanhas.' });
        const parsed = rows.map(r => ({ ...r, perguntas: JSON.parse(r.perguntas || '[]') }));
        res.json(parsed);
    });
});

// Atualizar recompensas
app.post('/api/rewards', (req, res) => {
    const { rewards } = req.body;
    if (!Array.isArray(rewards)) return res.status(400).json({ error: 'Formato inválido.' });

    db.serialize(() => {
        db.run('DELETE FROM rewards');
        rewards.forEach(r => db.run(`INSERT INTO rewards (id, nome, qtd) VALUES (?, ?, ?)`, [crypto.randomUUID(), r.nome, r.qtd]));
    });
    res.json({ status: 'sucesso', rewards });
});

// Listar recompensas
app.get('/api/rewards', (req, res) => {
    db.all(`SELECT * FROM rewards`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Erro ao listar recompensas.' });
        res.json(rows);
    });
});

// Enviar notificação (simulado)
app.post('/api/notify', (req, res) => {
    const { titulo, body } = req.body;
    if (!titulo || !body) return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    console.log('NOTIFY recebido:', titulo, body);
    res.json({ status: 'sucesso', mensagem: 'Notificação simulada enviada.' });
});

// ================== START SERVER ==================
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
