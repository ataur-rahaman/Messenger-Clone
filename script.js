const firebaseConfig = {
  apiKey: "AIzaSyBWNIsFW0QKknbDHqhfWG7GU_GYKV-wAXM",
  authDomain: "messenger-clone-9421f.firebaseapp.com",
  databaseURL: "https://messenger-clone-9421f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "messenger-clone-9421f",
  storageBucket: "messenger-clone-9421f.firebasestorage.app",
  messagingSenderId: "296040648748",
  appId: "1:296040648748:web:589afe85ec3713866fd0189" // Updated app ID based on the previous response
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
const backToChatBtn = document.getElementById('back-to-chat-btn');

const sidebar = document.getElementById('sidebar');

const replyPreview = document.getElementById('reply-preview');
const repliedMessageTextSpan = document.getElementById('replied-message-text');
const clearReplyBtn = document.getElementById('clear-reply-btn');


let currentUser = null;
let currentChatId = 'general';
let currentChatName = 'General Chat';
let messageListener = null;
let messageChangedListener = null;
let typingListener = null;

let typingTimeout;
const TYPING_INDICATOR_TIMEOUT = 1500;

// To track currently visible action menus (for mobile tap logic)
let currentlyVisibleMessageActions = null;
let currentlyVisibleEmojiPickerForMessage = null; // To track visible emoji picker (independent of actions visibility for desktop)


// Function to set CSS variable for accurate VH on mobile
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
        sidebar.classList.remove('show-mobile'); // Hide sidebar on chat switch
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
        if (messageChangedListener) {
            database.ref('messages/' + currentChatId).off('child_changed', messageChangedListener);
            messageChangedListener = null;
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
        currentRepliedMessage = null;
        replyPreview.classList.add('hidden');
        repliedMessageTextSpan.textContent = '';
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

    if (currentChatId === newChatId && messageListener && messageChangedListener) {
        updateActiveChatUI();
        return;
    }

    // Detach existing listeners
    if (messageListener) {
        database.ref('messages/' + currentChatId).off('child_added', messageListener);
        messageListener = null;
    }
    if (messageChangedListener) {
        database.ref('messages/' + currentChatId).off('child_changed', messageChangedListener);
        messageChangedListener = null;
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
    currentRepliedMessage = null;
    replyPreview.classList.add('hidden');
    repliedMessageTextSpan.textContent = '';


    updateActiveChatUI();

    const messagesRef = database.ref('messages/' + currentChatId).orderByChild('timestamp');

    // Listener for new messages
    messageListener = messagesRef.on('child_added', (snapshot) => {
        const message = snapshot.val();
        displayMessage(message);
        scrollToBottom();
    });

    // Listener for changes to existing messages (e.g., reactions added/removed)
    messageChangedListener = messagesRef.on('child_changed', (snapshot) => {
        const changedMessage = snapshot.val();
        const existingMessageElement = messagesContainer.querySelector(`.message[data-message-id="${changedMessage.id}"]`); // Select based on data-message-id
        if (existingMessageElement) {
            existingMessageElement.remove(); // Remove old
            displayMessage(changedMessage); // Add updated
            scrollToBottom();
        }
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

    const messageData = {
        id: messageId,
        text: messageText,
        senderId: currentUser.uid,
        senderEmail: currentUser.email,
        senderDisplayName: currentUser.displayName || getDisplayName(currentUser.email),
        senderPhotoURL: currentUser.photoURL,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };

    if (currentRepliedMessage) {
        messageData.repliedTo = {
            id: currentRepliedMessage.id,
            senderDisplayName: currentRepliedMessage.senderDisplayName,
            text: currentRepliedMessage.text
        };
    }

    newMessageRef.set(messageData)
    .then(() => {
        messageInput.value = '';
        currentRepliedMessage = null;
        replyPreview.classList.add('hidden');
        repliedMessageTextSpan.textContent = '';
    })
    .catch((error) => {
        console.error("Error sending message:", error);
        alert("Failed to send message.");
    });
}

function displayMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.dataset.messageId = message.id; // Add message ID to the main message element

    const isSentByCurrentUser = currentUser && message.senderId === currentUser.uid;
    messageElement.classList.add(isSentByCurrentUser ? 'sent' : 'received');

    const date = new Date(message.timestamp);
    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const avatarSrc = message.senderPhotoURL || 'https://via.placeholder.com/40';
    const messageAvatar = `<img src="${avatarSrc}" alt="${message.senderDisplayName}" class="message-avatar">`;

    const senderInfo = isSentByCurrentUser ? '' : `<span class="sender-display-name">${message.senderDisplayName}</span><br>`;

    let repliedToHTML = '';
    if (message.repliedTo) {
        repliedToHTML = `
            <div class="replied-to-message">
                <span class="replied-to-sender">${message.repliedTo.senderDisplayName}:</span>
                <span class="replied-to-text">${message.repliedTo.text}</span>
            </div>
        `;
    }

    // Combine all action buttons into a single message-actions container
    messageElement.innerHTML = `
        ${isSentByCurrentUser ? '' : messageAvatar}
        <div class="message-content-wrapper">
            <div class="message-content">
                ${repliedToHTML} ${message.text}
            </div>
            <div class="message-info">
                ${senderInfo}
                ${timeString}
            </div>
            <div class="message-actions hidden">
                <button class="reply-btn" data-message-id="${message.id}" data-sender-display-name="${message.senderDisplayName}" data-message-text="${message.text}">
                    <i class="fas fa-reply"></i>
                </button>
                <button class="emoji-toggle-btn" data-message-id="${message.id}">
                    <i class="far fa-smile"></i>
                </button>
                ${isSentByCurrentUser ? `<button class="delete-message-btn" data-message-id="${message.id}"><i class="fas fa-trash-alt"></i></button>` : ''}
            </div>
            <div class="emoji-picker hidden" data-message-id="${message.id}">
                <span class="emoji-option" data-emoji="👍" data-message-id="${message.id}">👍</span>
                <span class="emoji-option" data-emoji="❤️" data-message-id="${message.id}">❤️</span>
                <span class="emoji-option" data-emoji="😂" data-message-id="${message.id}">😂</span>
                <span class="emoji-option" data-emoji="😢" data-message-id="${message.id}">😢</span>
            </div>
        </div>
        ${isSentByCurrentUser ? messageAvatar : ''}
        <div class="message-reactions hidden"></div> `;

    messagesContainer.appendChild(messageElement);

    const messageContent = messageElement.querySelector('.message-content');
    const messageActions = messageElement.querySelector('.message-actions');
    const emojiPicker = messageElement.querySelector('.emoji-picker');
    const replyBtn = messageElement.querySelector('.reply-btn');
    const emojiToggleBtn = messageElement.querySelector('.emoji-toggle-btn');
    const deleteBtn = messageElement.querySelector('.delete-message-btn');


    // Desktop hover behavior: Show/hide message actions
    messageElement.addEventListener('mouseenter', () => {
        if (window.innerWidth > 768) {
            messageActions.classList.remove('hidden');
        }
    });
    messageElement.addEventListener('mouseleave', (e) => {
        if (window.innerWidth > 768) {
            // Check if mouse is still over message actions or emoji picker
            if (!messageActions.contains(e.relatedTarget) && !emojiPicker.contains(e.relatedTarget)) {
                messageActions.classList.add('hidden');
                emojiPicker.classList.add('hidden'); // Also hide emoji picker on mouse leave
            }
        }
    });


    // Mobile tap behavior for message actions
    messageElement.addEventListener('click', (event) => {
        if (window.innerWidth <= 768) {
            // Check if the tap target is one of the action buttons or emoji options itself
            // If so, let that specific listener handle it and don't toggle the actions container.
            if (event.target.closest('.reply-btn') || event.target.closest('.emoji-toggle-btn') || event.target.closest('.delete-message-btn') || event.target.closest('.emoji-option')) {
                return;
            }

            // If another message's actions are visible, hide them first
            if (currentlyVisibleMessageActions && currentlyVisibleMessageActions !== messageActions) {
                currentlyVisibleMessageActions.classList.add('hidden');
                // Also hide its associated emoji picker if it was visible
                const prevEmojiPicker = currentlyVisibleMessageActions.closest('.message').querySelector('.emoji-picker');
                if (prevEmojiPicker) {
                    prevEmojiPicker.classList.add('hidden');
                }
                currentlyVisibleMessageActions = null;
                currentlyVisibleEmojiPickerForMessage = null; // Clear this too
            }

            // Toggle current message actions
            messageActions.classList.toggle('hidden');
            if (!messageActions.classList.contains('hidden')) {
                messageActions.classList.add('visible-on-tap'); // Add this class for mobile styling
                currentlyVisibleMessageActions = messageActions;
            } else {
                messageActions.classList.remove('visible-on-tap'); // Remove this class
                currentlyVisibleMessageActions = null;
                emojiPicker.classList.add('hidden'); // Also hide emoji picker if actions are hidden
                currentlyVisibleEmojiPickerForMessage = null;
            }
        }
    });

    // Handle reply button click
    if (replyBtn) {
        replyBtn.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent messageElement's click listener from firing
            const messageId = replyBtn.dataset.messageId;
            const senderDisplayName = replyBtn.dataset.senderDisplayName;
            const messageText = replyBtn.dataset.messageText;

            currentRepliedMessage = {
                id: messageId,
                senderDisplayName: senderDisplayName,
                text: messageText
            };
            repliedMessageTextSpan.textContent = `${senderDisplayName}: ${messageText}`;
            replyPreview.classList.remove('hidden');
            messageInput.focus();

            // Hide actions and emoji picker after replying
            messageActions.classList.add('hidden');
            messageActions.classList.remove('visible-on-tap'); // Ensure mobile class is removed
            emojiPicker.classList.add('hidden');
            currentlyVisibleMessageActions = null;
            currentlyVisibleEmojiPickerForMessage = null;
        });
    }

    // Handle emoji toggle button click
    if (emojiToggleBtn) {
        emojiToggleBtn.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent messageElement's click listener from firing
            emojiPicker.classList.toggle('hidden');
            if (!emojiPicker.classList.contains('hidden')) {
                currentlyVisibleEmojiPickerForMessage = emojiPicker;
            } else {
                currentlyVisibleEmojiPickerForMessage = null;
            }
        });
    }

    // Handle delete button click
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent messageElement's click listener from firing
            const messageIdToDelete = deleteBtn.dataset.messageId;
            if (confirm('Are you sure you want to delete this message? This will delete it for everyone.')) {
                deleteMessage(currentChatId, messageIdToDelete);
            }
        });
    }

    // Add event listeners for emoji options
    emojiPicker.querySelectorAll('.emoji-option').forEach(emojiOption => {
        emojiOption.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent parent clicks
            const msgId = emojiOption.dataset.messageId;
            const emoji = emojiOption.dataset.emoji;
            addReaction(currentChatId, msgId, emoji);
            emojiPicker.classList.add('hidden'); // Hide emoji picker after selection
            currentlyVisibleEmojiPickerForMessage = null;
            if (window.innerWidth <= 768) {
                messageActions.classList.add('hidden'); // Hide actions after selection on mobile
                messageActions.classList.remove('visible-on-tap'); // Ensure mobile class is removed
                currentlyVisibleMessageActions = null;
            }
        });
    });

    // Render reactions
    const reactionsContainer = messageElement.querySelector('.message-reactions');
    if (reactionsContainer && message.reactions) {
        reactionsContainer.innerHTML = '';
        const uniqueEmojis = {};
        Object.values(message.reactions).forEach(reaction => {
            uniqueEmojis[reaction.emoji] = (uniqueEmojis[reaction.emoji] || 0) + 1;
        });

        for (const emoji in uniqueEmojis) {
            const reactionSpan = document.createElement('span');
            reactionSpan.classList.add('reaction-bubble');
            reactionSpan.textContent = `${emoji} ${uniqueEmojis[emoji]}`;
            reactionSpan.dataset.emoji = emoji;
            reactionSpan.dataset.messageId = message.id;

            reactionSpan.addEventListener('click', () => {
                addReaction(currentChatId, message.id, emoji);
            });

            reactionsContainer.appendChild(reactionSpan);
        }
        if (Object.keys(uniqueEmojis).length > 0) {
            reactionsContainer.classList.remove('hidden');
        }
    } else if (reactionsContainer) {
        reactionsContainer.classList.add('hidden');
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
            // Message will be removed from UI by messageChangedListener detecting the deletion
            // If the listener doesn't trigger removal for some reason, manually remove:
            const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
            if (messageElement) {
                messageElement.remove();
            }
            currentlyVisibleMessageActions = null;
            currentlyVisibleEmojiPickerForMessage = null;
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

backToChatBtn.addEventListener('click', () => {
    sidebar.classList.remove('show-mobile');
});

clearReplyBtn.addEventListener('click', () => {
    currentRepliedMessage = null;
    replyPreview.classList.add('hidden');
    repliedMessageTextSpan.textContent = '';
});

function addReaction(chatId, messageId, emoji) {
    if (!currentUser) {
        alert("You must be logged in to add reactions.");
        return;
    }

    const reactionRef = database.ref(`messages/${chatId}/${messageId}/reactions/${currentUser.uid}`);
    reactionRef.once('value', (snapshot) => {
        if (snapshot.exists() && snapshot.val().emoji === emoji) {
            reactionRef.remove()
                .then(() => console.log('Reaction removed'))
                .catch(error => console.error('Error removing reaction:', error));
        } else {
            reactionRef.set({
                uid: currentUser.uid,
                displayName: currentUser.displayName,
                emoji: emoji,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            })
            .then(() => console.log('Reaction added/updated'))
            .catch(error => console.error('Error adding reaction:', error));
        }
    });
}

document.addEventListener('click', (event) => {
    // Logic for hiding sidebar on outside click for mobile
    if (window.innerWidth <= 768 && sidebar.classList.contains('show-mobile')) {
        const isClickInsideSidebar = sidebar.contains(event.target);
        const isClickOnToggleBtn = menuToggleBtn.contains(event.target);
        const isClickOnBackButton = backToChatBtn.contains(event.target);
        const isClickOnUserListItem = event.target.closest('#users-list li') !== null;
        const isClickOnConversationListItem = event.target.closest('#conversation-list li') !== null;

        if (!isClickInsideSidebar && !isClickOnToggleBtn && !isClickOnBackButton && !isClickOnUserListItem && !isClickOnConversationListItem) {
            sidebar.classList.remove('show-mobile');
        }
    }

    // Logic for hiding message actions/emoji picker when tapping elsewhere on mobile
    if (window.innerWidth <= 768) {
        // Only proceed if there's an active actions menu or emoji picker
        if (currentlyVisibleMessageActions || currentlyVisibleEmojiPickerForMessage) {
            const clickedMessageElement = event.target.closest('.message');
            const isClickOnReplyPreview = replyPreview.contains(event.target);
            const isClickOnMessageInput = messageInput.contains(event.target);
            const isClickOnSendButton = sendButton.contains(event.target);

            // Check if the click is outside the currently active message actions/emoji picker
            // and not within the message input area or reply preview.
            if (
                (!clickedMessageElement || (currentlyVisibleMessageActions && clickedMessageElement !== currentlyVisibleMessageActions.closest('.message'))) &&
                !isClickOnReplyPreview &&
                !isClickOnMessageInput &&
                !isClickOnSendButton
            ) {
                if (currentlyVisibleMessageActions) {
                    currentlyVisibleMessageActions.classList.add('hidden');
                    currentlyVisibleMessageActions.classList.remove('visible-on-tap'); // Ensure mobile class is removed
                    currentlyVisibleMessageActions = null;
                }
                if (currentlyVisibleEmojiPickerForMessage) {
                    currentlyVisibleEmojiPickerForMessage.classList.add('hidden');
                    currentlyVisibleEmojiPickerForMessage = null;
                }
            }
        }
    }
});

// Initial UI update for general chat on page load
updateActiveChatUI();