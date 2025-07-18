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
// REMOVED: const storage = firebase.storage();

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
// REMOVED: Profile picture upload related DOM elements
// const profilePicInput = document.getElementById('profile-pic-input');
// const uploadProfilePicBtn = document.getElementById('upload-profile-pic-btn');
// const uploadStatus = document.getElementById('upload-status');

const conversationList = document.getElementById('conversation-list');
const usersList = document.getElementById('users-list');
const currentChatNameHeader = document.getElementById('current-chat-name');
const typingIndicator = document.getElementById('typing-indicator');
const typingUsernameSpan = document.getElementById('typing-username');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');

const deleteChatBtn = document.getElementById('delete-chat-btn'); // New: Delete Chat Button

let currentUser = null;
let currentChatId = 'general';
let currentChatName = 'General Chat';
let messageListener = null;
let typingListener = null;

let typingTimeout;
const TYPING_INDICATOR_TIMEOUT = 1500; // Increased to 1.5 seconds for better feel

// --- Helper Functions ---
function generateChatId(uid1, uid2) {
    const uids = [uid1, uid2].sort();
    return uids.join('_');
}

function getDisplayName(email) {
    return email ? email.split('@')[0] : 'Unknown User';
}

// Function to get appropriate avatar URL (Google Photo or Placeholder)
function getUserPhotoURL(user) {
    // If user object has photoURL (typically from Google Auth), use it.
    // Otherwise, use a generic placeholder.
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

    // Control visibility of delete chat button
    if (currentChatId === 'general') {
        deleteChatBtn.classList.add('hidden');
    } else {
        deleteChatBtn.classList.remove('hidden');
    }
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Debounce function for typing indicator
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
        currentUserEmailSpan.textContent = user.email; // Initial display, might be updated from DB
        authContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');

        const userRef = database.ref('users/' + user.uid);
        userRef.on('value', (snapshot) => { // Listen for real-time updates of current user's profile
            const userData = snapshot.val();
            if (userData) {
                // Update current user object with data from DB
                currentUser.displayName = userData.displayName || getDisplayName(currentUser.email);
                currentUser.photoURL = userData.photoURL || 'https://via.placeholder.com/40'; // Use stored photoURL or default
                
                // Update UI with latest profile info
                currentUserEmailSpan.textContent = currentUser.displayName;
                userAvatar.src = currentUser.photoURL;
            } else {
                // New user / First login - set initial data based on auth provider
                const initialPhotoURL = user.photoURL || 'https://via.placeholder.com/40';
                const initialDisplayName = user.displayName || getDisplayName(user.email);

                userRef.set({
                    email: user.email,
                    displayName: initialDisplayName,
                    photoURL: initialPhotoURL,
                    uid: user.uid
                });
                // Set current user object immediately for UI
                currentUser.displayName = initialDisplayName;
                currentUser.photoURL = initialPhotoURL;
                currentUserEmailSpan.textContent = currentUser.displayName;
                userAvatar.src = currentUser.photoURL;
            }
        });

        loadUsers(); // Load users for private chat
        switchChat(currentChatId, currentChatName); // Load messages for default/last chat
    } else {
        currentUser = null;
        authContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
        messagesContainer.innerHTML = '';
        usersList.innerHTML = '';
        conversationList.innerHTML = '<li class="active-chat" data-chat-id="general" data-chat-name="General Chat">General Chat</li>';
        userAvatar.src = 'https://via.placeholder.com/40'; // Reset avatar

        // Detach all Firebase listeners on logout
        if (messageListener) {
            database.ref('messages/' + currentChatId).off('child_added', messageListener);
            messageListener = null;
        }
        if (typingListener) {
            database.ref('typingIndicators/' + currentChatId).off('value', typingListener);
            typingListener = null;
        }
        database.ref('users').off(); // Detach user list listener
        // Ensure to detach the specific 'value' listener for the current user's profile
        if (user && user.uid) { // Check currentUser here as it might be null if logout happens without prior login
            database.ref('users/' + user.uid).off();
        }

        // Clear any pending typing status in database on logout for the user that was logged out
        // Use a temporary user object if current is already null from `auth.onAuthStateChanged`
        if (user && currentChatId) {
             database.ref('typingIndicators/' + currentChatId + '/' + user.uid).remove();
        }
    }
});

// Event listeners for login/register/google login
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
            // For Email/Password users, set a default placeholder avatar
            database.ref('users/' + user.uid).set({
                email: user.email,
                displayName: user.email.split('@')[0],
                photoURL: 'https://via.placeholder.com/40', // Placeholder for email/password users
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
            // For Google users, use their provided photoURL, or a placeholder if none
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

// REMOVED: All profile picture upload related code.
// profilePicInput.addEventListener('change', ...);
// uploadProfilePicBtn.addEventListener('click', ...);


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
        usersList.innerHTML = ''; // Clear for fresh render
        snapshot.forEach((childSnapshot) => {
            const user = childSnapshot.val();
            if (currentUser && user.uid === currentUser.uid) {
                return; // Don't list the current user in the friends list
            }

            const userElement = document.createElement('li');
            userElement.dataset.uid = user.uid;
            userElement.dataset.displayName = user.displayName;
            userElement.dataset.chatId = generateChatId(currentUser.uid, user.uid);
            userElement.dataset.chatName = user.displayName;
            
            // Use the photoURL stored in the database for friends' avatars
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

    // 1. Detach old listeners
    if (messageListener) {
        database.ref('messages/' + currentChatId).off('child_added', messageListener);
        messageListener = null;
    }
    if (typingListener) {
        database.ref('typingIndicators/' + currentChatId).off('value', typingListener);
        typingListener = null;
    }
    // Also remove any pending typing status of the current user from the OLD chat
    database.ref('typingIndicators/' + currentChatId + '/' + currentUser.uid).remove();


    // 2. Update current chat variables
    currentChatId = newChatId;
    currentChatName = newChatName;
    messagesContainer.innerHTML = '';
    typingIndicator.classList.add('hidden'); // Hide typing indicator initially

    // 3. Update UI
    updateActiveChatUI();

    // 4. Attach new listeners for the new chat
    const messagesRef = database.ref('messages/' + currentChatId).orderByChild('timestamp');
    messageListener = messagesRef.on('child_added', (snapshot) => {
        const message = snapshot.val();
        displayMessage(message);
        scrollToBottom();
    });

    // Attach typing indicator listener for the new chat
    const typingRef = database.ref('typingIndicators/' + currentChatId);
    typingListener = typingRef.on('value', (snapshot) => {
        const typingUsers = snapshot.val();
        const typers = [];
        if (typingUsers) {
            // Fetch display names for all typing UIDs from the 'users' node
            const promises = Object.keys(typingUsers).map(uid => {
                if (uid !== currentUser.uid) {
                    return database.ref('users/' + uid).once('value')
                        .then(userSnap => {
                            if (userSnap.exists()) {
                                return userSnap.val().displayName;
                            }
                            return 'Someone'; // Fallback if user data not found
                        });
                }
                return null; // Don't process current user
            }).filter(Boolean); // Remove nulls

            Promise.all(promises).then(displayNames => {
                const filteredDisplayNames = displayNames.filter(name => name !== 'Someone'); // Only show specific names
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
    typingRef.onDisconnect().remove(); // Ensure it's removed if user closes browser

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        typingRef.remove();
    }, TYPING_INDICATOR_TIMEOUT);
});

// Clear typing status on message send (for both button click and enter key)
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
        e.preventDefault(); // Prevent default enter behavior (like new line)
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
    const messageId = newMessageRef.key; // Get the unique ID generated by push()

    newMessageRef.set({
        id: messageId, // Store the ID within the message object
        text: messageText,
        senderId: currentUser.uid,
        senderEmail: currentUser.email,
        senderDisplayName: currentUser.displayName || getDisplayName(currentUser.email),
        senderPhotoURL: currentUser.photoURL, // Now this will be Google's photoURL or a placeholder
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

    // Use the senderPhotoURL from the message, which comes from their user profile
    const avatarSrc = message.senderPhotoURL || 'https://via.placeholder.com/40';
    const messageAvatar = `<img src="${avatarSrc}" alt="${message.senderDisplayName}" class="message-avatar">`;

    const senderInfo = isSentByCurrentUser ? '' : `<span class="sender-display-name">${message.senderDisplayName}</span><br>`;

    // Add a delete button for sent messages
    const deleteButton = isSentByCurrentUser ? `<button class="delete-message-btn" data-message-id="${message.id}"><i class="fas fa-trash-alt"></i></button>` : '';

    messageElement.innerHTML = `
        ${isSentByCurrentUser ? '' : messageAvatar}
        <div class="message-content-wrapper">
            <div class="message-content">
                ${message.text}
                ${deleteButton} </div>
            <div class="message-info">
                ${senderInfo}
                ${timeString}
            </div>
        </div>
        ${isSentByCurrentUser ? messageAvatar : ''}
    `;

    messagesContainer.appendChild(messageElement);

    // Attach event listener to the delete button
    if (isSentByCurrentUser) {
        const btn = messageElement.querySelector('.delete-message-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                const messageIdToDelete = btn.dataset.messageId;
                if (confirm('Are you sure you want to delete this message?')) {
                    deleteMessage(currentChatId, messageIdToDelete);
                }
            });
        }
    }
}


// New function to delete a message
function deleteMessage(chatId, messageId) {
    if (!currentUser) {
        alert("You must be logged in to delete messages.");
        return;
    }

    const messageRef = database.ref('messages/' + chatId + '/' + messageId);
    messageRef.remove()
        .then(() => {
            console.log(`Message ${messageId} deleted from chat ${chatId}`);
            // Remove the message from the UI immediately after successful deletion
            // Find the button and then its closest ancestor with class 'message' to remove it
            const messageElement = document.querySelector(`.message .delete-message-btn[data-message-id="${messageId}"]`);
            if (messageElement) {
                messageElement.closest('.message').remove();
            }
        })
        .catch((error) => {
            console.error("Error deleting message:", error);
            alert("Failed to delete message.");
        });
}

// New Event Listener for Delete Chat Button
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

// New function to delete an entire chat
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
            
            // After deleting, switch back to the General Chat
            switchChat('general', 'General Chat');
        })
        .catch((error) => {
            console.error("Error deleting chat:", error);
            alert("Failed to delete chat.");
        });
}

// Initial UI update for general chat on page load
updateActiveChatUI();