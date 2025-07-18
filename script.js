// Your Firebase web app's configuration
const firebaseConfig = {
  apiKey: "AIzaSyBWNIsFW0QKknbDHqhfWG7GU_GYKV-wAXM",
  authDomain: "messenger-clone-9421f.firebaseapp.com",
  databaseURL: "https://messenger-clone-9421f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "messenger-clone-9421f",
  storageBucket: "messenger-clone-9421f.firebasestorage.app",
  messagingSenderId: "296040648748",
  appId: "1:296040648748:web:589afe85ec371386fd0189"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const database = firebase.database();

// DOM Elements
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const googleLoginBtn = document.getElementById('google-login-btn');
const authStatus = document.getElementById('auth-status');

const currentUserEmailSpan = document.getElementById('current-user-email');
const logoutBtn = document.getElementById('logout-btn');

const userAvatar = document.getElementById('user-avatar');

const conversationList = document.getElementById('conversation-list');
const usersList = document.getElementById('users-list');
const currentChatNameHeader = document.getElementById('current-chat-name');
const typingIndicator = document.getElementById('typing-indicator');
const typingUsernameSpan = document.getElementById('typing-username');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');

const deleteChatBtn = document.getElementById('delete-chat-btn');
const menuToggleBtn = document.getElementById('menu-toggle-btn');

const sidebar = document.getElementById('sidebar');

let currentUser = null;
let currentChatId = 'general';
let currentChatName = 'General Chat';
let messageListener = null;
let typingListener = null;

let typingTimeout;
const TYPING_INDICATOR_TIMEOUT = 1500;

let currentlyVisibleDeleteBtn = null; // New: To keep track of the currently visible delete button

// NEW: Function to set CSS variable for accurate VH on mobile
function setVhProperty() {
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

// Set on initial load
setVhProperty();
// Re-set on resize (especially important for mobile when address bar hides/shows)
window.addEventListener('resize', setVhProperty);
window.addEventListener('orientationchange', setVhProperty);


// --- Helper Functions ---
function generateChatId(uid1, uid2) {
    const uids = [uid1, uid2].sort();
    return uids.join('_');
}

function getDisplayName(email) {
    return email ? email.split('@')[0] : 'Unknown User';
}

function getUserPhotoURL(user) {
    return user.photoURL || 'https://via.placeholder.com/40';
}

function updateActiveChatUI() {
    document.querySelectorAll('#conversation-list li, #users-list li').forEach(item => {
        item.classList.remove('active-chat');
    });

    const activeItem = document.querySelector(`[data-chat-id="${currentChatId}"]`);
    if (activeItem) {
        activeItem.classList.add('active-chat');
    }
    currentChatNameHeader.textContent = currentChatName;

    if (currentChatId === 'general') {
        deleteChatBtn.classList.add('hidden');
    } else {
        deleteChatBtn.classList.remove('hidden');
    }

    if (window.innerWidth <= 768) {
        sidebar.classList.remove('show-mobile');
    }
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

// --- Authentication ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        currentUserEmailSpan.textContent = user.email;
        authContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');

        const userRef = database.ref('users/' + user.uid);
        userRef.on('value', (snapshot) => {
            const userData = snapshot.val();
            if (userData) {
                currentUser.displayName = userData.displayName || getDisplayName(currentUser.email);
                currentUser.photoURL = userData.photoURL || 'https://via.placeholder.com/40';
                
                currentUserEmailSpan.textContent = currentUser.displayName;
                userAvatar.src = currentUser.photoURL;
            } else {
                const initialPhotoURL = user.photoURL || 'https://via.placeholder.com/40';
                const initialDisplayName = user.displayName || getDisplayName(user.email);

                userRef.set({
                    email: user.email,
                    displayName: initialDisplayName,
                    photoURL: initialPhotoURL,
                    uid: user.uid
                });
                currentUser.displayName = initialDisplayName;
                currentUser.photoURL = initialPhotoURL;
                currentUserEmailSpan.textContent = currentUser.displayName;
                userAvatar.src = currentUser.photoURL;
            }
        });

        loadUsers();
        switchChat(currentChatId, currentChatName);
    } else {
        currentUser = null;
        authContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
        messagesContainer.innerHTML = '';
        usersList.innerHTML = '';
        conversationList.innerHTML = '<li class="active-chat" data-chat-id="general" data-chat-name="General Chat">General Chat</li>';
        userAvatar.src = 'https://via.placeholder.com/40';

        if (messageListener) {
            database.ref('messages/' + currentChatId).off('child_added', messageListener);
            messageListener = null;
        }
        if (typingListener) {
            database.ref('typingIndicators/' + currentChatId).off('value', typingListener);
            typingListener = null;
        }
        database.ref('users').off();
        if (user && user.uid) {
            database.ref('users/' + user.uid).off();
        }

        if (user && currentChatId) {
             database.ref('typingIndicators/' + currentChatId + '/' + user.uid).remove();
        }
    }
});

loginBtn.addEventListener('click', () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            authStatus.textContent = "Logged in successfully!";
            authStatus.style.color = "green";
        })
        .catch((error) => {
            authStatus.textContent = `Login failed: ${error.message}`;
            authStatus.style.color = "red";
        });
});

registerBtn.addEventListener('click', () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            database.ref('users/' + user.uid).set({
                email: user.email,
                displayName: user.email.split('@')[0],
                photoURL: 'https://via.placeholder.com/40',
                uid: user.uid
            });
            authStatus.textContent = "Registered successfully! You can now log in.";
            authStatus.style.color = "green";
        })
        .catch((error) => {
            authStatus.textContent = `Registration failed: ${error.message}`;
            authStatus.style.color = "red";
        });
});

googleLoginBtn.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then((result) => {
            const user = result.user;
            database.ref('users/' + user.uid).set({
                email: user.email,
                displayName: user.displayName || getDisplayName(user.email),
                photoURL: user.photoURL || 'https://via.placeholder.com/40',
                uid: user.uid
            });
            authStatus.textContent = `Logged in as ${user.email} (Google)`;
            authStatus.style.color = "green";
        })
        .catch((error) => {
            authStatus.textContent = `Google login failed: ${error.message}`;
            authStatus.style.color = "red";
            console.error("Google Login Error:", error);
        });
});

logoutBtn.addEventListener('click', () => {
    auth.signOut()
        .then(() => {
            authStatus.textContent = "Logged out.";
            authStatus.style.color = "green";
        })
        .catch((error) => {
            console.error("Logout error:", error);
            authStatus.textContent = `Logout failed: ${error.message}`;
            authStatus.style.color = "red";
        });
});


// --- User List and Chat Switching ---
conversationList.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-chat-id]');
    if (li) {
        const chatId = li.dataset.chatId;
        const chatName = li.dataset.chatName;
        switchChat(chatId, chatName);
    }
});

function loadUsers() {
    const usersRef = database.ref('users');
    usersList.innerHTML = '';
    usersRef.on('value', (snapshot) => {
        usersList.innerHTML = '';
        snapshot.forEach((childSnapshot) => {
            const user = childSnapshot.val();
            if (currentUser && user.uid === currentUser.uid) {
                return;
            }

            const userElement = document.createElement('li');
            userElement.dataset.uid = user.uid;
            userElement.dataset.displayName = user.displayName;
            userElement.dataset.chatId = generateChatId(currentUser.uid, user.uid);
            userElement.dataset.chatName = user.displayName;
            
            const friendAvatarUrl = user.photoURL || 'https://via.placeholder.com/30';

            userElement.innerHTML = `
                <img src="${friendAvatarUrl}" alt="${user.displayName}" class="user-list-item-avatar">
                <span>${user.displayName}</span>
            `;

            userElement.addEventListener('click', () => {
                const privateChatId = userElement.dataset.chatId;
                const privateChatName = userElement.dataset.chatName;
                switchChat(privateChatId, privateChatName);
            });

            usersList.appendChild(userElement);
        });
        updateActiveChatUI();
    });
}

function switchChat(newChatId, newChatName) {
    if (!currentUser) {
        currentChatId = newChatId;
        currentChatName = newChatName;
        updateActiveChatUI();
        return;
    }

    if (currentChatId === newChatId && messageListener) {
        updateActiveChatUI();
        return;
    }

    if (messageListener) {
        database.ref('messages/' + currentChatId).off('child_added', messageListener);
        messageListener = null;
    }
    if (typingListener) {
        database.ref('typingIndicators/' + currentChatId).off('value', typingListener);
        typingListener = null;
    }
    database.ref('typingIndicators/' + currentChatId + '/' + currentUser.uid).remove();


    currentChatId = newChatId;
    currentChatName = newChatName;
    messagesContainer.innerHTML = '';
    typingIndicator.classList.add('hidden');

    updateActiveChatUI();

    const messagesRef = database.ref('messages/' + currentChatId).orderByChild('timestamp');
    messageListener = messagesRef.on('child_added', (snapshot) => {
        const message = snapshot.val();
        displayMessage(message);
        scrollToBottom();
    });

    const typingRef = database.ref('typingIndicators/' + currentChatId);
    typingListener = typingRef.on('value', (snapshot) => {
        const typingUsers = snapshot.val();
        const typers = [];
        if (typingUsers) {
            const promises = Object.keys(typingUsers).map(uid => {
                if (uid !== currentUser.uid) {
                    return database.ref('users/' + uid).once('value')
                        .then(userSnap => {
                            if (userSnap.exists()) {
                                return userSnap.val().displayName;
                            }
                            return 'Someone';
                        });
                }
                return null;
            }).filter(Boolean);

            Promise.all(promises).then(displayNames => {
                const filteredDisplayNames = displayNames.filter(name => name !== 'Someone');
                if (filteredDisplayNames.length > 0) {
                    typingUsernameSpan.textContent = filteredDisplayNames.join(', ');
                    typingIndicator.classList.remove('hidden');
                } else {
                    typingIndicator.classList.add('hidden');
                }
            });
        } else {
            typingIndicator.classList.add('hidden');
        }
    });
}

// --- Typing Indicator Logic ---
messageInput.addEventListener('input', () => {
    if (!currentUser) return;

    const typingRef = database.ref('typingIndicators/' + currentChatId + '/' + currentUser.uid);
    typingRef.set(true);
    typingRef.onDisconnect().remove();

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        typingRef.remove();
    }, TYPING_INDICATOR_TIMEOUT);
});

const clearTypingStatusAndSendMessage = () => {
    clearTimeout(typingTimeout);
    if (currentUser) {
        database.ref('typingIndicators/' + currentChatId + '/' + currentUser.uid).remove();
    }
    sendMessage();
};

sendButton.addEventListener('click', clearTypingStatusAndSendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        clearTypingStatusAndSendMessage();
    }
});

function sendMessage() {
    if (!currentUser) {
        alert("You must be logged in to send messages.");
        return;
    }

    const messageText = messageInput.value.trim();
    if (messageText === '') {
        return;
    }

    const newMessageRef = database.ref('messages/' + currentChatId).push();
    const messageId = newMessageRef.key;

    newMessageRef.set({
        id: messageId,
        text: messageText,
        senderId: currentUser.uid,
        senderEmail: currentUser.email,
        senderDisplayName: currentUser.displayName || getDisplayName(currentUser.email),
        senderPhotoURL: currentUser.photoURL,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    })
    .then(() => {
        messageInput.value = '';
    })
    .catch((error) => {
        console.error("Error sending message:", error);
        alert("Failed to send message.");
    });
}

function displayMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');

    const isSentByCurrentUser = currentUser && message.senderId === currentUser.uid;
    messageElement.classList.add(isSentByCurrentUser ? 'sent' : 'received');

    const date = new Date(message.timestamp);
    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const avatarSrc = message.senderPhotoURL || 'https://via.placeholder.com/40';
    const messageAvatar = `<img src="${avatarSrc}" alt="${message.senderDisplayName}" class="message-avatar">`;

    const senderInfo = isSentByCurrentUser ? '' : `<span class="sender-display-name">${message.senderDisplayName}</span><br>`;

    const deleteButton = isSentByCurrentUser ? `<button class="delete-message-btn" data-message-id="${message.id}"><i class="fas fa-trash-alt"></i></button>` : '';

    messageElement.innerHTML = `
        ${isSentByCurrentUser ? '' : messageAvatar}
        <div class="message-content-wrapper">
            <div class="message-content">
                ${message.text}
                ${deleteButton}
            </div>
            <div class="message-info">
                ${senderInfo}
                ${timeString}
            </div>
        </div>
        ${isSentByCurrentUser ? messageAvatar : ''}
    `;

    messagesContainer.appendChild(messageElement);

    if (isSentByCurrentUser) {
        const deleteBtn = messageElement.querySelector('.delete-message-btn');
        if (deleteBtn) {
            // New: Add click listener to the entire message element to toggle delete button visibility
            messageElement.addEventListener('click', (event) => {
                // Prevent clicking the delete button from immediately hiding itself
                if (event.target === deleteBtn || deleteBtn.contains(event.target)) {
                    return;
                }

                // Hide any previously visible delete button
                if (currentlyVisibleDeleteBtn && currentlyVisibleDeleteBtn !== deleteBtn) {
                    currentlyVisibleDeleteBtn.classList.remove('visible-on-tap');
                }

                // Toggle visibility of the current message's delete button only on mobile
                if (window.innerWidth <= 768) { // Assuming 768px is your mobile breakpoint
                    deleteBtn.classList.toggle('visible-on-tap');
                    if (deleteBtn.classList.contains('visible-on-tap')) {
                        currentlyVisibleDeleteBtn = deleteBtn;
                    } else {
                        currentlyVisibleDeleteBtn = null;
                    }
                }
            });

            // Original: Add click listener to the delete button itself for deletion
            deleteBtn.addEventListener('click', () => {
                const messageIdToDelete = deleteBtn.dataset.messageId;
                if (confirm('Are you sure you want to delete this message?')) {
                    deleteMessage(currentChatId, messageIdToDelete);
                }
            });
        }
    }
}


function deleteMessage(chatId, messageId) {
    if (!currentUser) {
        alert("You must be logged in to delete messages.");
        return;
    }

    const messageRef = database.ref('messages/' + chatId + '/' + messageId);
    messageRef.remove()
        .then(() => {
            console.log(`Message ${messageId} deleted from chat ${chatId}`);
            const messageElement = document.querySelector(`.message .delete-message-btn[data-message-id="${messageId}"]`);
            if (messageElement) {
                messageElement.closest('.message').remove();
            }
            // Reset currently visible delete button if the deleted message was it
            if (currentlyVisibleDeleteBtn && currentlyVisibleDeleteBtn.dataset.messageId === messageId) {
                currentlyVisibleDeleteBtn = null;
            }
        })
        .catch((error) => {
            console.error("Error deleting message:", error);
            alert("Failed to delete message.");
        });
}

deleteChatBtn.addEventListener('click', () => {
    if (!currentUser) {
        alert("You must be logged in to delete chats.");
        return;
    }

    if (currentChatId === 'general') {
        alert("You cannot delete the General Chat.");
        return;
    }

    if (confirm(`Are you sure you want to delete all messages in "${currentChatName}"? This action cannot be undone.`)) {
        deleteChat(currentChatId);
    }
});

function deleteChat(chatId) {
    if (!currentUser) {
        alert("You must be logged in to delete chats.");
        return;
    }

    const chatMessagesRef = database.ref('messages/' + chatId);
    chatMessagesRef.remove()
        .then(() => {
            console.log(`Chat ${chatId} messages deleted.`);
            alert(`Chat "${currentChatName}" has been cleared.`);
            
            switchChat('general', 'General Chat');
        })
        .catch((error) => {
            console.error("Error deleting chat:", error);
            alert("Failed to delete chat.");
        });
}

menuToggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('show-mobile');
});

// Hide sidebar or delete icon if user clicks outside of them
document.addEventListener('click', (event) => {
    // Logic for hiding sidebar
    if (window.innerWidth <= 768 && sidebar.classList.contains('show-mobile')) {
        const isClickInsideSidebar = sidebar.contains(event.target);
        const isClickOnToggleBtn = menuToggleBtn.contains(event.target);
        if (!isClickInsideSidebar && !isClickOnToggleBtn) {
            sidebar.classList.remove('show-mobile');
        }
    }

    // Logic for hiding delete icon when tapping elsewhere
    if (window.innerWidth <= 768 && currentlyVisibleDeleteBtn) {
        const isClickInsideMessage = event.target.closest('.message') !== null;
        const isClickOnDeleteButton = currentlyVisibleDeleteBtn.contains(event.target);

        // If the click is not on the currently visible delete button, and it's not on a message (or it's on a different message)
        if (!isClickOnDeleteButton && (!isClickInsideMessage || (isClickInsideMessage && !event.target.closest('.message').querySelector('.delete-message-btn.visible-on-tap')))) {
            currentlyVisibleDeleteBtn.classList.remove('visible-on-tap');
            currentlyVisibleDeleteBtn = null;
        }
    }
});

// Initial UI update for general chat on page load
updateActiveChatUI();