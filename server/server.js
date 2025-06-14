const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000; // Usar variable de entorno o puerto 3000

// Configuración de archivos JSON
const dbPath = path.join(__dirname, 'db');
const usersPath = path.join(dbPath, 'users.json');
const messagesPath = path.join(dbPath, 'messages.json');
const chatsPath = path.join(dbPath, 'chats.json');

// Crear archivos y carpetas si no existen
if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
}

// Inicializar archivos JSON si no existen
if (!fs.existsSync(usersPath)) fs.writeFileSync(usersPath, '[]');
if (!fs.existsSync(messagesPath)) fs.writeFileSync(messagesPath, '[]');
if (!fs.existsSync(chatsPath)) fs.writeFileSync(chatsPath, '[]');

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public'))); // Ruta corregida

// Configurar CORS para Socket.IO
io.origins(['*']);

// Helper functions mejoradas con manejo de errores
const readUsers = () => {
  try {
    return JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  } catch (error) {
    console.error('Error reading users:', error);
    return [];
  }
};

const writeUsers = (users) => {
  try {
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error writing users:', error);
  }
};

const readMessages = () => {
  try {
    return JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
  } catch (error) {
    console.error('Error reading messages:', error);
    return [];
  }
};

const writeMessages = (messages) => {
  try {
    fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2));
  } catch (error) {
    console.error('Error writing messages:', error);
  }
};

const readChats = () => {
  try {
    return JSON.parse(fs.readFileSync(chatsPath, 'utf8'));
  } catch (error) {
    console.error('Error reading chats:', error);
    return [];
  }
};

const writeChats = (chats) => {
  try {
    fs.writeFileSync(chatsPath, JSON.stringify(chats, null, 2));
  } catch (error) {
    console.error('Error writing chats:', error);
  }
};

// Ruta principal para servir el frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API Endpoints con mejor manejo de errores

// Registro de usuario
app.post('/register', (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Todos los campos son requeridos' });
    }

    const users = readUsers();

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
  } catch (error) {
    console.error('Error in register:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Login de usuario
app.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email y contraseña son requeridos' });
    }

    const users = readUsers();
    const user = users.find(u => u.email === email);

    if (!user) {
      return res.status(400).json({ success: false, message: 'Usuario no encontrado' });
    }

    if (password !== user.password) {
      return res.status(400).json({ success: false, message: 'Contraseña incorrecta' });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Búsqueda de usuarios
app.get('/users', (req, res) => {
  try {
    const { search, currentUserId } = req.query;
    
    if (!currentUserId) {
      return res.status(400).json({ success: false, message: 'ID de usuario requerido' });
    }

    let users = readUsers().filter(user => user.id !== currentUserId);

    if (search) {
      const searchTerm = search.toLowerCase();
      users = users.filter(user => 
        user.name.toLowerCase().includes(searchTerm) || 
        user.email.toLowerCase().includes(searchTerm)
      );
    }

    const messages = readMessages();
    users = users.map(user => {
      const chatMessages = messages.filter(msg => 
        (msg.senderId === currentUserId && msg.receiverId === user.id) ||
        (msg.senderId === user.id && msg.receiverId === currentUserId)
      ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      return {
        ...user,
        lastMessage: chatMessages[0] || null
      };
    });

    res.json(users);
  } catch (error) {
    console.error('Error in users search:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Gestión de chats
app.post('/chats', (req, res) => {
  try {
    const { user1Id, user2Id } = req.body;
    
    if (!user1Id || !user2Id) {
      return res.status(400).json({ success: false, message: 'IDs de usuarios requeridos' });
    }

    const chats = readChats();
    const chatId = [user1Id, user2Id].sort().join('-');
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
  } catch (error) {
    console.error('Error in chats:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Configurar PIN para chat
app.post('/chats/pin', (req, res) => {
  try {
    const { chatId, pin } = req.body;
    
    if (!chatId || !pin) {
      return res.status(400).json({ success: false, message: 'Chat ID y PIN requeridos' });
    }

    const chats = readChats();
    const chat = chats.find(c => c.id === chatId);
    
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat no encontrado' });
    }
    
    chat.pin = pin;
    writeChats(chats);
    
    res.json({ success: true, chat });
  } catch (error) {
    console.error('Error in chat pin:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Gestión de mensajes
app.post('/messages', (req, res) => {
  try {
    const { chatId, senderId, receiverId, text } = req.body;
    
    if (!chatId || !senderId || !receiverId || !text) {
      return res.status(400).json({ success: false, message: 'Datos incompletos' });
    }

    const messages = readMessages();
    const newMessage = {
      id: Date.now().toString(),
      chatId,
      senderId,
      receiverId,
      text,
      timestamp: new Date().toISOString()
    };
    
    messages.push(newMessage);
    writeMessages(messages);
    
    io.emit('newMessage', newMessage);
    
    res.json({ success: true, message: newMessage });
  } catch (error) {
    console.error('Error in messages:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Obtener mensajes de un chat
app.get('/messages', (req, res) => {
  try {
    const { chatId } = req.query;
    
    if (!chatId) {
      return res.status(400).json({ success: false, message: 'Chat ID requerido' });
    }

    const messages = readMessages();
    const chatMessages = messages.filter(msg => msg.chatId === chatId);
    
    res.json(chatMessages);
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Socket.IO
const userSockets = {};

io.on('connection', (socket) => {
  console.log('Nuevo cliente conectado:', socket.id);

  socket.on('register', (userId) => {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }
      
      userSockets[userId] = socket.id;
      console.log(`Usuario ${userId} registrado con socket ${socket.id}`);

      // Actualizar estado del usuario
      const users = readUsers();
      const userIndex = users.findIndex(u => u.id === userId);
      
      if (userIndex !== -1) {
        users[userIndex].isOnline = true;
        users[userIndex].lastConnection = new Date().toISOString();
        writeUsers(users);
        
        io.emit('userStatusChanged', { userId, isOnline: true });
      }
    } catch (error) {
      console.error('Error in socket register:', error);
    }
  });

  socket.on('sendMessage', (message) => {
    try {
      if (!message || !message.senderId || !message.receiverId || !message.text) {
        throw new Error('Invalid message format');
      }

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

      // Notificar al emisor
      socket.emit('newMessage', message);
    } catch (error) {
      console.error('Error in sendMessage:', error);
    }
  });

  socket.on('disconnect', () => {
    try {
      console.log('Cliente desconectado:', socket.id);
      
      // Buscar usuario desconectado
      const userId = Object.keys(userSockets).find(key => userSockets[key] === socket.id);
      if (userId) {
        delete userSockets[userId];
        
        // Actualizar estado del usuario
        const users = readUsers();
        const userIndex = users.findIndex(u => u.id === userId);
        
        if (userIndex !== -1) {
          users[userIndex].isOnline = false;
          users[userIndex].lastConnection = new Date().toISOString();
          writeUsers(users);
          
          io.emit('userStatusChanged', { userId, isOnline: false });
        }
      }
    } catch (error) {
      console.error('Error in disconnect:', error);
    }
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
});

server.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
  console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
});
