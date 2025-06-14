const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = 3000;

// Configuración de archivos JSON
const dbPath = path.join(__dirname, 'db');
const usersPath = path.join(dbPath, 'users.json');
const messagesPath = path.join(dbPath, 'messages.json');
const chatsPath = path.join(dbPath, 'chats.json');

// Crear archivos si no existen
if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath);
if (!fs.existsSync(usersPath)) fs.writeFileSync(usersPath, '[]');
if (!fs.existsSync(messagesPath)) fs.writeFileSync(messagesPath, '[]');
if (!fs.existsSync(chatsPath)) fs.writeFileSync(chatsPath, '[]');

// Middleware
app.use(bodyParser.json());
app.use(express.static('../public')); // Servir archivos estáticos desde la carpeta public

// Helper functions
const readUsers = () => JSON.parse(fs.readFileSync(usersPath, 'utf8'));
const writeUsers = (users) => fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));

const readMessages = () => JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
const writeMessages = (messages) => fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2));

const readChats = () => JSON.parse(fs.readFileSync(chatsPath, 'utf8'));
const writeChats = (chats) => fs.writeFileSync(chatsPath, JSON.stringify(chats, null, 2));

// API Endpoints

// Registro de usuario
app.post('/register', (req, res) => {
    const { name, email, password } = req.body;
    const users = readUsers();

    // Validar que el email no exista
    if (users.some(user => user.email === email)) {
        return res.status(400).json({ success: false, message: 'El correo ya está registrado' });
    }

    const newUser = {
        id: Date.now().toString(),
        name,
        email,
        password,
        isOnline: false,
        lastConnection: new Date().toISOString(),
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    writeUsers(users);

    res.json({ success: true, user: newUser });
});

// Login de usuario
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const users = readUsers();
    const user = users.find(u => u.email === email);

    if (!user) {
        return res.status(400).json({ success: false, message: 'Usuario no encontrado' });
    }

    // Verificar contraseña (en una app real usaríamos hashing)
    if (password !== user.password) {
        return res.status(400).json({ success: false, message: 'Contraseña incorrecta' });
    }

    // Actualizar estado (ahora se manejará por socket)
    user.isOnline = true;
    user.lastConnection = new Date().toISOString();
    writeUsers(users);

    res.json({ success: true, user });
});

// Búsqueda de usuarios
app.get('/users', (req, res) => {
    const { search, currentUserId } = req.query;
    let users = readUsers();

    // Filtrar usuario actual
    users = users.filter(user => user.id !== currentUserId);

    // Filtrar por búsqueda
    if (search) {
        const searchTerm = search.toLowerCase();
        users = users.filter(user => 
            user.name.toLowerCase().includes(searchTerm) || 
            user.email.toLowerCase().includes(searchTerm)
        );
    }

    // Obtener el último mensaje para cada usuario
    const messages = readMessages();
    users = users.map(user => {
        // Obtener mensajes entre el usuario actual y este contacto
        const chatMessages = messages.filter(msg => 
            (msg.senderId === currentUserId && msg.receiverId === user.id) ||
            (msg.senderId === user.id && msg.receiverId === currentUserId)
        );
        
        // Ordenar por fecha descendente
        chatMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        return {
            ...user,
            lastMessage: chatMessages[0] || null
        };
    });

    res.json(users);
});

// Gestión de chats
app.post('/chats', (req, res) => {
    const { user1Id, user2Id } = req.body;
    const chats = readChats();
    
    // Crear ID único para el chat
    const chatId = [user1Id, user2Id].sort().join('-');
    
    // Buscar chat existente
    let chat = chats.find(c => c.id === chatId);
    
    if (!chat) {
        chat = {
            id: chatId,
            participants: [user1Id, user2Id],
            pin: null,
            createdAt: new Date().toISOString()
        };
        chats.push(chat);
        writeChats(chats);
    }
    
    res.json(chat);
});

// Configurar PIN para chat
app.post('/chats/pin', (req, res) => {
    const { chatId, pin } = req.body;
    const chats = readChats();
    const chat = chats.find(c => c.id === chatId);
    
    if (!chat) {
        return res.status(404).json({ success: false, message: 'Chat no encontrado' });
    }
    
    chat.pin = pin;
    writeChats(chats);
    
    res.json({ success: true, chat });
});

// Gestión de mensajes
app.post('/messages', (req, res) => {
    const newMessage = req.body;
    const messages = readMessages();
    
    // Asignar ID y timestamp
    newMessage.id = Date.now().toString();
    newMessage.timestamp = new Date().toISOString();
    
    messages.push(newMessage);
    writeMessages(messages);
    
    // Emitir evento de nuevo mensaje
    io.emit('newMessage', newMessage);
    
    res.json({ success: true, message: newMessage });
});

// Obtener mensajes de un chat
app.get('/messages', (req, res) => {
    const { chatId } = req.query;
    const messages = readMessages();
    
    const chatMessages = messages.filter(msg => msg.chatId === chatId);
    res.json(chatMessages);
});

// Socket.IO
const userSockets = {}; // Mapa de userId a socketId

io.on('connection', (socket) => {
    console.log('Nuevo cliente conectado');
    
    // Evento para registrar un usuario (cuando inicia sesión)
    socket.on('register', (userId) => {
        // Guardar la relación usuario-socket
        userSockets[userId] = socket.id;
        console.log(`Usuario ${userId} registrado para notificaciones`);
        
        // Actualizar estado del usuario a online
        const users = readUsers();
        const user = users.find(u => u.id === userId);
        if (user) {
            user.isOnline = true;
            user.lastConnection = new Date().toISOString();
            writeUsers(users);
            
            // Notificar a los contactos
            io.emit('userStatusChanged', { userId, isOnline: true });
        }
    });
    
    // Evento para enviar un mensaje
    socket.on('sendMessage', (message) => {
        // Guardar el mensaje
        const messages = readMessages();
        message.id = Date.now().toString();
        message.timestamp = new Date().toISOString();
        message.chatId = [message.senderId, message.receiverId].sort().join('-');
        messages.push(message);
        writeMessages(messages);
        
        // Notificar al receptor si está conectado
        const receiverSocketId = userSockets[message.receiverId];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('newMessage', message);
        }
        
        // También notificar al emisor para actualizar su UI
        socket.emit('newMessage', message);
    });
    
    // Manejar desconexión
    socket.on('disconnect', () => {
        console.log('Cliente desconectado');
        
        // Buscar usuario desconectado
        const userId = Object.keys(userSockets).find(key => userSockets[key] === socket.id);
        if (userId) {
            delete userSockets[userId];
            
            // Actualizar estado del usuario a offline
            const users = readUsers();
            const user = users.find(u => u.id === userId);
            if (user) {
                user.isOnline = false;
                user.lastConnection = new Date().toISOString();
                writeUsers(users);
                
                // Notificar a los contactos
                io.emit('userStatusChanged', { userId, isOnline: false });
            }
        }
    });
});

server.listen(port, () => {
    console.log(`Servidor Express corriendo en http://localhost:${port}`);
});
