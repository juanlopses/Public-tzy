// Current user state
let currentUser = null;
let currentContact = null;
let currentChat = null;
let socket = null;

// DOM Elements
const authScreen = document.getElementById('authScreen');
const appMain = document.querySelector('.app-main');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const showRegister = document.getElementById('showRegister');
const showLogin = document.getElementById('showLogin');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userStatus = document.getElementById('userStatus');
const searchInput = document.getElementById('searchInput');
const chatsList = document.getElementById('chatsList');
const chatArea = document.getElementById('chatArea');
const chatUserAvatar = document.getElementById('chatUserAvatar');
const chatContactName = document.getElementById('chatContactName');
const chatContactStatus = document.getElementById('chatContactStatus');
const contactStatusText = document.getElementById('contactStatusText');
const contactStatusIndicator = document.getElementById('contactStatusIndicator');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const pinToggle = document.getElementById('pinToggle');
const pinModal = document.getElementById('pinModal');
const pinCancel = document.getElementById('pinCancel');
const pinConfirm = document.getElementById('pinConfirm');
const pinDigits = document.querySelectorAll('.pin-digit');

// Event Listeners
showRegister.addEventListener('click', () => {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
});

showLogin.addEventListener('click', () => {
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';
});

loginBtn.addEventListener('click', loginUser);
registerBtn.addEventListener('click', registerUser);
searchInput.addEventListener('input', searchContacts);
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});
pinToggle.addEventListener('click', togglePin);
pinCancel.addEventListener('click', () => pinModal.classList.remove('active'));
pinConfirm.addEventListener('click', setChatPin);
pinDigits.forEach((digit, index) => {
    digit.addEventListener('input', () => {
        if (digit.value && index < pinDigits.length - 1) {
            pinDigits[index + 1].focus();
        }
    });
});

// Functions
async function loginUser() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        alert('Por favor completa todos los campos');
        return;
    }
    
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const result = await response.json();
        if (result.success) {
            currentUser = result.user;
            startApp();
        } else {
            alert(result.message);
        }
    } catch (error) {
        console.error('Error logging in:', error);
        alert('Error al iniciar sesión');
    }
}

async function registerUser() {
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerConfirm').value;
    
    if (!name || !email || !password || !confirm) {
        alert('Por favor completa todos los campos');
        return;
    }
    
    if (password !== confirm) {
        alert('Las contraseñas no coinciden');
        return;
    }
    
    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        
        const result = await response.json();
        if (result.success) {
            currentUser = result.user;
            startApp();
        } else {
            alert(result.message);
        }
    } catch (error) {
        console.error('Error registering:', error);
        alert('Error al registrar usuario');
    }
}

function startApp() {
    authScreen.style.display = 'none';
    appMain.style.display = 'flex';
    
    // Update user info
    userAvatar.textContent = currentUser.name.charAt(0);
    userName.textContent = currentUser.name;
    userStatus.textContent = 'En línea';
    
    // Initialize Socket.IO
    socket = io();
    
    // Socket events
    socket.on('connect', () => {
        console.log('Conectado al servidor Socket.IO');
        // Enviar el ID del usuario para que el servidor lo registre
        socket.emit('register', currentUser.id);
    });
    
    socket.on('newMessage', (message) => {
        // Si el mensaje es para el chat abierto, mostrarlo
        if (currentChat && message.chatId === currentChat.id) {
            const isSent = message.senderId === currentUser.id;
            addMessageToChat(message, isSent);
        }
    });
    
    socket.on('userStatusChanged', ({ userId, isOnline }) => {
        // Actualizar el estado del contacto si está abierto
        if (currentContact && currentContact.id === userId) {
            contactStatusText.textContent = isOnline ? 'En línea' : formatLastConnection(currentContact.lastConnection);
            contactStatusIndicator.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
        }
        
        // Actualizar en la lista de chats
        const chatItems = document.querySelectorAll('.chat-item');
        chatItems.forEach(item => {
            if (item.dataset.contactId === userId) {
                const statusIndicator = item.querySelector('.status-indicator');
                statusIndicator.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
            }
        });
    });
    
    // Load contacts
    loadContacts();
}

async function loadContacts() {
    try {
        const response = await fetch(`/users?currentUserId=${currentUser.id}`);
        const contacts = await response.json();
        renderContacts(contacts);
    } catch (error) {
        console.error('Error loading contacts:', error);
        alert('Error al cargar contactos');
    }
}

function renderContacts(contacts) {
    chatsList.innerHTML = '';
    
    contacts.forEach(contact => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.contactId = contact.id;
        
        // Get last message
        const lastMessage = contact.lastMessage || null;
        
        chatItem.innerHTML = `
            <div class="chat-avatar">${contact.name.charAt(0)}</div>
            <div class="chat-info">
                <div class="chat-header">
                    <div class="chat-name">${contact.name}</div>
                    ${lastMessage ? `<div class="chat-time">${formatTime(lastMessage.timestamp)}</div>` : ''}
                </div>
                <div class="chat-preview">
                    ${lastMessage ? `<div class="chat-message">${lastMessage.text}</div>` : '<div class="chat-message">No hay mensajes</div>'}
                    <div class="status-indicator ${contact.isOnline ? 'online' : 'offline'}"></div>
                </div>
            </div>
        `;
        
        chatItem.addEventListener('click', () => openChat(contact));
        chatsList.appendChild(chatItem);
    });
}

async function searchContacts() {
    const query = searchInput.value.trim();
    if (query.length === 0) {
        await loadContacts();
        return;
    }
    
    try {
        const response = await fetch(`/users?search=${query}&currentUserId=${currentUser.id}`);
        const results = await response.json();
        renderContacts(results);
    } catch (error) {
        console.error('Error searching contacts:', error);
        alert('Error al buscar contactos');
    }
}

async function openChat(contact) {
    currentContact = contact;
    
    try {
        // Get or create chat
        const response = await fetch('/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                user1Id: currentUser.id, 
                user2Id: contact.id 
            })
        });
        
        currentChat = await response.json();
        
        // Update UI
        chatUserAvatar.textContent = contact.name.charAt(0);
        chatContactName.textContent = contact.name;
        contactStatusText.textContent = contact.isOnline ? 'En línea' : formatLastConnection(contact.lastConnection);
        contactStatusIndicator.className = `status-indicator ${contact.isOnline ? 'online' : 'offline'}`;
        
        // Check if chat has PIN
        pinToggle.classList.toggle('active', currentChat.pin !== null);
        
        // Load messages
        await loadMessages();
        
        // Show chat area on mobile
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.add('hidden');
            chatArea.classList.add('active');
        }
    } catch (error) {
        console.error('Error opening chat:', error);
        alert('Error al abrir el chat');
    }
}

async function loadMessages() {
    if (!currentUser || !currentContact || !currentChat) return;
    
    try {
        const response = await fetch(`/messages?chatId=${currentChat.id}`);
        const messages = await response.json();
        chatMessages.innerHTML = '';
        
        messages.forEach(message => {
            const isSent = message.senderId === currentUser.id;
            addMessageToChat(message, isSent);
        });
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
        console.error('Error loading messages:', error);
        alert('Error al cargar mensajes');
    }
}

function addMessageToChat(message, isSent) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isSent ? 'sent' : 'received'}`;
    messageElement.innerHTML = `
        ${message.text}
        <div class="message-time">${formatTime(message.timestamp)}</div>
    `;
    chatMessages.appendChild(messageElement);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentUser || !currentContact || !currentChat) return;
    
    const newMessage = {
        chatId: currentChat.id,
        senderId: currentUser.id,
        receiverId: currentContact.id,
        text
    };
    
    try {
        // Enviar el mensaje a través de Socket.IO para que sea en tiempo real
        socket.emit('sendMessage', newMessage);
        
        // También lo guardamos en la base de datos a través de la API
        await fetch('/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newMessage)
        });
        
        // Agregar el mensaje a la interfaz
        addMessageToChat({...newMessage, timestamp: new Date().toISOString()}, true);
        
        // Clear input
        messageInput.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Error al enviar mensaje');
    }
}

function togglePin() {
    pinModal.classList.add('active');
    // Clear PIN inputs
    pinDigits.forEach(digit => digit.value = '');
    pinDigits[0].focus();
}

async function setChatPin() {
    const pin = Array.from(pinDigits).map(d => d.value).join('');
    
    if (pin.length !== 4) {
        alert('El PIN debe tener 4 dígitos');
        return;
    }
    
    try {
        await fetch('/chats/pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                chatId: currentChat.id, 
                pin 
            })
        });
        
        pinToggle.classList.add('active');
        pinModal.classList.remove('active');
        alert('PIN configurado correctamente. Este chat ahora está protegido.');
    } catch (error) {
        console.error('Error setting PIN:', error);
        alert('Error al configurar PIN');
    }
}

// Utility functions
function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatLastConnection(dateString) {
    const now = new Date();
    const lastConn = new Date(dateString);
    const diffHours = Math.floor((now - lastConn) / 3600000);
    
    if (diffHours < 1) {
        return 'Visto hace menos de 1 hora';
    } else if (diffHours < 24) {
        return `Visto hace ${diffHours} horas`;
    } else {
        return `Visto el ${formatDate(dateString)}`;
    }
}
