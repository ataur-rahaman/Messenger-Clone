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
const backToChatBtn = document.getElementById('back-to-chat-btn'); // New: Back to chat button

const sidebar = document.getElementById('sidebar');

// New DOM Elements for Reply
const replyPreview = document.getElementById('reply-preview');
const repliedMessageTextSpan = document.getElementById('replied-message-text');
const clearReplyBtn = document.getElementById('clear-reply-btn');


let currentUser = null;
let currentChatId = 'general';
let currentChatName = 'General Chat';
let messageListener = null; // Listener for child_added
let messageChangedListener = null; // New: Listener for child_changed
let typingListener = null;

let typingTimeout;
const TYPING_INDICATOR_TIMEOUT = 1500;

let currentlyVisibleDeleteBtn = null;
let currentlyVisibleEmojiPicker = null; // New: To track visible emoji picker for mobile tap

let currentRepliedMessage = null; // To store the message being replied to


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
        if (messageChangedListener) { // New: Clear child_changed listener
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
        // Clear any active reply
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
    currentRepliedMessage = null; // Clear reply state on chat switch
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
        const existingMessageElement = messagesContainer.querySelector(`.message .delete-message-btn[data-message-id="${changedMessage.id}"]`)?.closest('.message');
        if (existingMessageElement) {
            // Re-render the message to update reactions/replies
            existingMessageElement.remove();
            displayMessage(changedMessage);
            scrollToBottom(); // In case content size changes
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
        currentRepliedMessage = null; // Clear replied message state
        replyPreview.classList.add('hidden'); // Hide reply preview
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

    const isSentByCurrentUser = currentUser && message.senderId === currentUser.uid;
    messageElement.classList.add(isSentByCurrentUser ? 'sent' : 'received');

    const date = new Date(message.timestamp);
    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const avatarSrc = message.senderPhotoURL || 'https://via.placeholder.com/40';
    const messageAvatar = `<img src="${avatarSrc}" alt="${message.senderDisplayName}" class="message-avatar">`;

    const senderInfo = isSentByCurrentUser ? '' : `<span class="sender-display-name">${message.senderDisplayName}</span><br>`;

    const deleteButton = isSentByCurrentUser ? `<button class="delete-message-btn" data-message-id="${message.id}"><i class="fas fa-trash-alt"></i></button>` : '';

    // New: Reply preview for the message being displayed
    let repliedToHTML = '';
    if (message.repliedTo) {
        repliedToHTML = `
            <div class="replied-to-message">
                <span class="replied-to-sender">${message.repliedTo.senderDisplayName}:</span>
                <span class="replied-to-text">${message.repliedTo.text}</span>
            </div>
        `;
    }

    messageElement.innerHTML = `
        ${isSentByCurrentUser ? '' : messageAvatar}
        <div class="message-content-wrapper">
            <div class="message-content">
                ${repliedToHTML} ${message.text}
                ${deleteButton}
                <div class="message-actions">
                    <button class="reply-btn" data-message-id="${message.id}" data-sender-display-name="${message.senderDisplayName}" data-message-text="${message.text}">
                        <i class="fas fa-reply"></i>
                    </button>
                    <div class="emoji-picker hidden">
                        <span class="emoji-option" data-emoji="👍" data-message-id="${message.id}">👍</span>
                        <span class="emoji-option" data-emoji="❤️" data-message-id="${message.id}">❤️</span>
                        <span class="emoji-option" data-emoji="😂" data-message-id="${message.id}">😂</span>
                        <span class="emoji-option" data-emoji="😢" data-message-id="${message.id}">😢</span>
                    </div>
                </div>
            </div>
            <div class="message-info">
                ${senderInfo}
                ${timeString}
            </div>
        </div>
        ${isSentByCurrentUser ? messageAvatar : ''}
        <div class="message-reactions hidden"></div> `;

    messagesContainer.appendChild(messageElement);

    // Attach event listeners for delete button (existing logic)
    if (isSentByCurrentUser) {
        const deleteBtn = messageElement.querySelector('.delete-message-btn');
        if (deleteBtn) {
            messageElement.addEventListener('click', (event) => {
                if (event.target === deleteBtn || deleteBtn.contains(event.target)) {
                    return;
                }

                if (currentlyVisibleDeleteBtn && currentlyVisibleDeleteBtn !== deleteBtn) {
                    currentlyVisibleDeleteBtn.classList.remove('visible-on-tap');
                }

                if (window.innerWidth <= 768) {
                    deleteBtn.classList.toggle('visible-on-tap');
                    if (deleteBtn.classList.contains('visible-on-tap')) {
                        currentlyVisibleDeleteBtn = deleteBtn;
                    } else {
                        currentlyVisibleDeleteBtn = null;
                    }
                }
            });

            deleteBtn.addEventListener('click', () => {
                const messageIdToDelete = deleteBtn.dataset.messageId;
                if (confirm('Are you sure you want to delete this message?')) {
                    deleteMessage(currentChatId, messageIdToDelete);
                }
            });
        }
    }


    // New: Handle reply button click
    const replyBtn = messageElement.querySelector('.reply-btn');
    if (replyBtn) {
        replyBtn.addEventListener('click', () => {
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

            // Hide any currently visible emoji picker on reply
            if (currentlyVisibleEmojiPicker) {
                currentlyVisibleEmojiPicker.classList.add('hidden');
                currentlyVisibleEmojiPicker = null;
            }
        });
    }

    // New: Handle emoji picker visibility on message hover/tap
    const messageContent = messageElement.querySelector('.message-content');
    const messageActions = messageElement.querySelector('.message-actions');
    const emojiPicker = messageElement.querySelector('.emoji-picker');

    if (messageContent && messageActions && emojiPicker) {
        // Desktop hover behavior
        messageContent.addEventListener('mouseenter', () => {
            if (window.innerWidth > 768) {
                messageActions.classList.remove('hidden');
                messageActions.style.opacity = '1';
                messageActions.style.pointerEvents = 'auto';
            }
        });
        messageContent.addEventListener('mouseleave', (e) => {
            // Check if mouse is still over message actions or emoji picker
            if (window.innerWidth > 768 && !messageActions.contains(e.relatedTarget) && !emojiPicker.contains(e.relatedTarget)) {
                messageActions.classList.add('hidden');
                messageActions.style.opacity = '0';
                messageActions.style.pointerEvents = 'none';
            }
        });

        // Mobile tap behavior for message actions (including reply and emoji picker)
        messageContent.addEventListener('click', (event) => {
            if (window.innerWidth <= 768) {
                // Prevent toggling if click is on reply or delete button already
                if (event.target.closest('.reply-btn') || event.target.closest('.delete-message-btn') || event.target.closest('.emoji-option')) {
                    return;
                }

                // Hide previously visible emoji picker/actions if different message is tapped
                if (currentlyVisibleEmojiPicker && currentlyVisibleEmojiPicker !== emojiPicker) {
                    currentlyVisibleEmojiPicker.closest('.message-actions').classList.add('hidden');
                    currentlyVisibleEmojiPicker = null;
                }

                messageActions.classList.toggle('hidden');
                if (!messageActions.classList.contains('hidden')) {
                    currentlyVisibleEmojiPicker = emojiPicker; // Track the currently visible one
                } else {
                    currentlyVisibleEmojiPicker = null;
                }
            }
        });


        // Add event listeners for emoji options
        emojiPicker.querySelectorAll('.emoji-option').forEach(emojiOption => {
            emojiOption.addEventListener('click', () => {
                const msgId = emojiOption.dataset.messageId;
                const emoji = emojiOption.dataset.emoji;
                addReaction(currentChatId, msgId, emoji);
                if (window.innerWidth <= 768) {
                    messageActions.classList.add('hidden'); // Hide actions after selection on mobile
                    currentlyVisibleEmojiPicker = null;
                }
            });
        });
    }


    // New: Render reactions
    const reactionsContainer = messageElement.querySelector('.message-reactions');
    if (reactionsContainer && message.reactions) {
        reactionsContainer.innerHTML = ''; // Clear existing reactions
        const uniqueEmojis = {}; // To count reactions per emoji
        Object.values(message.reactions).forEach(reaction => {
            uniqueEmojis[reaction.emoji] = (uniqueEmojis[reaction.emoji] || 0) + 1;
        });

        for (const emoji in uniqueEmojis) {
            const reactionSpan = document.createElement('span');
            reactionSpan.classList.add('reaction-bubble');
            reactionSpan.textContent = `${emoji} ${uniqueEmojis[emoji]}`;
            reactionSpan.dataset.emoji = emoji; // Store emoji for click
            reactionSpan.dataset.messageId = message.id; // Store message ID for click

            reactionSpan.addEventListener('click', () => {
                addReaction(currentChatId, message.id, emoji); // Toggle reaction
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
            const messageElement = document.querySelector(`.message .delete-message-btn[data-message-id="${messageId}"]`);
            if (messageElement) {
                messageElement.closest('.message').remove();
            }
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

// Event listener for the back button in the sidebar
backToChatBtn.addEventListener('click', () => {
    sidebar.classList.remove('show-mobile'); // Hide sidebar
});

// New: Add event listener for clearing reply preview
clearReplyBtn.addEventListener('click', () => {
    currentRepliedMessage = null;
    replyPreview.classList.add('hidden');
    repliedMessageTextSpan.textContent = '';
});


// New: Firebase logic for reactions
function addReaction(chatId, messageId, emoji) {
    if (!currentUser) {
        alert("You must be logged in to add reactions.");
        return;
    }

    const reactionRef = database.ref(`messages/${chatId}/${messageId}/reactions/${currentUser.uid}`);
    reactionRef.once('value', (snapshot) => {
        if (snapshot.exists() && snapshot.val().emoji === emoji) {
            // User already reacted with this emoji, remove it
            reactionRef.remove()
                .then(() => console.log('Reaction removed'))
                .catch(error => console.error('Error removing reaction:', error));
        } else {
            // Add or update reaction
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
    // Logic for hiding sidebar
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

    // Logic for hiding delete icon when tapping elsewhere
    if (window.innerWidth <= 768 && currentlyVisibleDeleteBtn) {
        const isClickInsideMessageContent = event.target.closest('.message-content') !== null;
        const isClickOnDeleteButton = currentlyVisibleDeleteBtn.contains(event.target);

        if (!isClickOnDeleteButton && (!isClickInsideMessageContent || (isClickInsideMessageContent && !event.target.closest('.message-content').querySelector('.delete-message-btn.visible-on-tap')))) {
            currentlyVisibleDeleteBtn.classList.remove('visible-on-tap');
            currentlyVisibleDeleteBtn = null;
        }
    }

    // New: Logic for hiding emoji picker/message actions when tapping elsewhere on mobile
    if (window.innerWidth <= 768 && currentlyVisibleEmojiPicker) {
        const isClickInsideCurrentMessage = currentlyVisibleEmojiPicker.closest('.message-content')?.contains(event.target) || false;
        const isClickOnReplyPreview = replyPreview.contains(event.target);
        const isClickOnMessageInput = messageInput.contains(event.target);
        const isClickOnSendButton = sendButton.contains(event.target);

        // If the click is not inside the currently visible emoji picker's message, and not on the input area
        if (!isClickInsideCurrentMessage && !isClickOnReplyPreview && !isClickOnMessageInput && !isClickOnSendButton) {
            currentlyVisibleEmojiPicker.closest('.message-actions').classList.add('hidden');
            currentlyVisibleEmojiPicker = null;
        }
    }
});


// Initial UI update for general chat on page load
updateActiveChatUI();