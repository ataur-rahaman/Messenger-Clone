// ========== State ========== //
let currentUser = null;
let currentChatUser = null;
let users = [];
let messages = [];
let theme = localStorage.getItem('theme') || 'light';

// Reply state
let replyToMsg = null;

// ========== DOM Elements ========== //
const sidebar = document.getElementById('sidebar');
const usersList = document.getElementById('users-list');
const chatMain = document.getElementById('chat-main');
const messagesContainer = document.getElementById('messages-container');
const chatUsername = document.getElementById('chat-username');
const chatAvatar = document.getElementById('chat-avatar');
const chatStatus = document.getElementById('chat-status');
const alertBox = document.getElementById('alert-box');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const themeToggle = document.getElementById('theme-toggle');
const currentAvatar = document.getElementById('current-avatar');
const currentUsername = document.getElementById('current-username');
const logoutBtn = document.getElementById('logout-btn');
const replyPreview = document.getElementById('reply-preview');

// ========== Helpers ========== //
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
  ));
}

function showAlert(msg) {
  alertBox.textContent = msg;
  alertBox.classList.remove('hidden');
  setTimeout(() => {
    alertBox.classList.add('hidden');
  }, 3500);
}

function clearAlert() {
  alertBox.classList.add('hidden');
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function showReplyPreview(msg) {
  replyPreview.innerHTML = `
    <span>
      <strong>Replying to:</strong> ${escapeHTML(msg.text).slice(0, 64)}
    </span>
    <span class="close-reply" title="Cancel reply">✖</span>
  `;
  replyPreview.classList.remove('hidden');
  replyToMsg = msg;
  // Close handler
  replyPreview.querySelector('.close-reply').onclick = () => {
    replyPreview.classList.add('hidden');
    replyToMsg = null;
  };
}
function clearReplyPreview() {
  replyPreview.classList.add('hidden');
  replyToMsg = null;
}

// ========== Theme ========== //
function setTheme(t) {
  theme = t;
  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
    themeToggle.textContent = '☀️';
  } else {
    document.body.classList.remove('dark-mode');
    themeToggle.textContent = '🌙';
  }
  localStorage.setItem('theme', theme);
}

themeToggle.onclick = () => setTheme(theme === 'light' ? 'dark' : 'light');
setTheme(theme); // Initialize

// ========== Main Auth Check & App Initialization ========== //
firebase.auth().onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    initializeMessengerApp();
  } else {
    document.getElementById('app').style.display = "none";
    window.location.href = "login.html";
  }
});

// ========== Messenger App Logic ========== //
function initializeMessengerApp() {
  // --- Ensure user exists in database ---
  function ensureUserProfileInDatabase() {
    const userRef = firebase.database().ref('users/' + currentUser.uid);
    userRef.once('value', (snapshot) => {
      if (!snapshot.exists()) {
        userRef.set({
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : ''),
          photoURL: currentUser.photoURL || ''
        });
      }
    });
  }

  ensureUserProfileInDatabase();

  // Show app UI if it was hidden
  document.getElementById('app').style.display = "";

  // --- Profile ---
  function loadProfile() {
    currentUsername.textContent = currentUser.displayName || "You";
    currentAvatar.src = currentUser.photoURL || 'assets/default-avatar.png';
    // Fallback for missing avatars
    currentAvatar.onerror = () => {
      currentAvatar.src = 'assets/default-avatar.png';
    };
  }

  // --- Load Users ---
  function loadUsers() {
    firebase.database().ref('users').on('value', snap => {
      users = [];
      usersList.innerHTML = '';
      snap.forEach(child => {
        const user = child.val();
        user.uid = child.key;
        if (user.uid !== currentUser.uid) users.push(user);
      });
      renderUsersList();
    }, err => {
      showAlert('Failed to load users: ' + err.message);
    });
  }

  function renderUsersList() {
    usersList.innerHTML = '';
    if (users.length === 0) {
      usersList.innerHTML = '<div style="padding: 1em; color: #aaa;">No other users found</div>';
      return;
    }
    users.forEach(user => {
      const item = document.createElement('div');
      item.className = 'user-item';
      item.dataset.uid = user.uid;
      item.innerHTML = `
        <img src="${user.photoURL || 'assets/default-avatar.png'}" class="user-avatar" onerror="this.src='assets/default-avatar.png'">
        <span class="user-name">${escapeHTML(user.displayName || user.email || 'Unknown')}</span>
      `;
      if (currentChatUser && user.uid === currentChatUser.uid) item.classList.add('active');
      item.onclick = () => selectChatUser(user);
      usersList.appendChild(item);
    });
  }

  // --- Select Chat User & Load Messages ---
  function selectChatUser(user) {
    if (currentChatUser && user.uid === currentChatUser.uid) return; // Already selected
    currentChatUser = user;
    chatUsername.textContent = user.displayName || user.email || "User";
    chatAvatar.src = user.photoURL || 'assets/default-avatar.png';
    // Fallback for missing avatars
    chatAvatar.onerror = () => {
      chatAvatar.src = 'assets/default-avatar.png';
    };
    chatStatus.textContent = "Online"; // Or implement real status
    clearAlert();
    renderUsersList();
    loadMessages();
    clearReplyPreview();
  }

  // --- Message Loading ---
  function chatIdFor(u1, u2) {
    return [u1.uid, u2.uid].sort().join('_');
  }

  let messageListenerRef = null;

  function loadMessages() {
    if (!currentChatUser) return;
    messagesContainer.innerHTML = '';
    messages = [];
    const chatId = chatIdFor(currentUser, currentChatUser);

    // Remove old listener if any
    if (messageListenerRef) messageListenerRef.off();
    messageListenerRef = firebase.database().ref(`chats/${chatId}/messages`);
    messageListenerRef.on('value', snap => {
      messages = [];
      snap.forEach(child => {
        let msg = child.val();
        msg.id = child.key;
        messages.push(msg);
      });
      renderMessages();
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
  }

  // --- Render Messages ---
  function renderMessages() {
    messagesContainer.innerHTML = '';
    messages.forEach(msg => {
      const div = document.createElement('div');
      div.className = 'message ' + (msg.from === currentUser.uid ? 'sent' : 'received');
      // Show reply quote if any
      let replyQuote = '';
      if (msg.replyTo && msg.replyText) {
        replyQuote = `<div class="reply-quote">${escapeHTML(msg.replyText)}</div>`;
      }
      // Show reaction bar if any
      let reactionBar = '';
      if (msg.reaction && msg.reaction.emoji) {
        reactionBar = `<div class="reaction-bar"><span>${escapeHTML(msg.reaction.emoji)}</span></div>`;
      }

      div.innerHTML = `
        ${replyQuote}
        <span class="msg-text">${escapeHTML(msg.text)}</span>
        <span class="timestamp">${formatTime(msg.timestamp)}</span>
        <div class="msg-actions">
          <button class="reaction-btn" title="React">😊</button>
          <button class="reply-btn" title="Reply">↩️</button>
          ${msg.from === currentUser.uid ? `<button class="delete-btn" title="Delete">🗑️</button>` : ''}
        </div>
        ${reactionBar}
      `;
      // Events for actions
      div.querySelector('.reaction-btn').onclick = () => {
        showEmojiPicker(msg);
      };
      div.querySelector('.reply-btn').onclick = () => {
        showReplyPreview(msg);
      };
      if (msg.from === currentUser.uid) {
        div.querySelector('.delete-btn').onclick = () => deleteMessage(msg);
      }
      messagesContainer.appendChild(div);
    });
  }

  // --- Emoji Picker (Improved Positioning) ---
  function showEmojiPicker(msg) {
    // Remove existing pickers
    document.querySelectorAll('.emoji-picker-popup').forEach(e => e.remove());
    // Picker UI
    const picker = document.createElement('div');
    picker.className = 'emoji-picker-popup';
    picker.style.position = 'absolute';
    picker.style.zIndex = 99;
    picker.style.background = '#fff';
    picker.style.border = '1.5px solid #a3bffa';
    picker.style.borderRadius = '1em';
    picker.style.padding = '7px 9px';
    picker.style.boxShadow = '0 2px 8px rgba(30,90,180,0.13)';
    picker.style.display = 'flex';
    picker.style.gap = '8px';

    const emojis = ['👍','😂','❤️','😮','😢','😡','😊'];
    emojis.forEach(e => {
      const btn = document.createElement('button');
      btn.textContent = e;
      btn.style.fontSize = '1.15em';
      btn.style.background = 'none';
      btn.style.border = 'none';
      btn.style.cursor = 'pointer';
      btn.onclick = ev => {
        ev.stopPropagation();
        setReaction(msg, e);
        picker.remove();
      };
      picker.appendChild(btn);
    });

    // Option to remove reaction
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✖';
    removeBtn.title = 'Remove reaction';
    removeBtn.style.fontSize = '1.15em';
    removeBtn.style.background = 'none';
    removeBtn.style.border = 'none';
    removeBtn.style.cursor = 'pointer';
    removeBtn.style.color = '#d64a4a';
    removeBtn.onclick = ev => {
      ev.stopPropagation();
      setReaction(msg, null);
      picker.remove();
    };
    picker.appendChild(removeBtn);

    // Place near the clicked button
    document.body.appendChild(picker);

    // Find message element and button position
    const allMessages = Array.from(messagesContainer.children);
    const idx = messages.findIndex(m => m.id === msg.id);
    const msgElem = allMessages[idx];
    const actionsElem = msgElem.querySelector('.msg-actions');
    const rect = actionsElem.getBoundingClientRect();
    const pickerRect = { width: 245, height: 40 }; // estimated width/height, update if your picker is larger

    // Compute placement so the picker never goes off screen
    let top = window.scrollY + rect.bottom + 6;
    let left = window.scrollX + rect.left;

    // If picker would overflow right, shift left
    if (left + pickerRect.width > window.innerWidth - 10) {
      left = window.innerWidth - pickerRect.width - 10;
    }
    // If picker would overflow bottom, show above
    if (top + pickerRect.height > window.innerHeight - 10) {
      top = window.scrollY + rect.top - pickerRect.height - 6;
    }
    picker.style.top = `${top}px`;
    picker.style.left = `${left}px`;

    // Close picker if clicked elsewhere
    setTimeout(() => {
      document.addEventListener('click', function onDocClick(e) {
        picker.remove();
        document.removeEventListener('click', onDocClick);
      });
    }, 20);
  }

  // Set or remove reaction
  function setReaction(msg, emoji) {
    const chatId = chatIdFor(currentUser, currentChatUser);
    const msgRef = firebase.database().ref(`chats/${chatId}/messages/${msg.id}/reaction`);
    if (emoji) {
      msgRef.set({emoji});
    } else {
      msgRef.remove();
    }
  }

  // --- Send Message ---
  messageForm.onsubmit = e => {
    e.preventDefault();
    if (!currentChatUser) return showAlert("Select a user to chat with.");
    let text = messageInput.value.trim();
    if (!text) return showAlert("Type something...");
    if (text.length > 1000) return showAlert("Message too long!");

    const chatId = chatIdFor(currentUser, currentChatUser);
    const chatRef = firebase.database().ref(`chats/${chatId}`);

    // Ensure chat participants exist (first time chatting)
    chatRef.child('participants').once('value').then(partSnap => {
      if (!partSnap.exists()) {
        chatRef.child('participants').set({
          [currentUser.uid]: true,
          [currentChatUser.uid]: true
        });
      }
      sendMsgNow();
    });

    function sendMsgNow() {
      const msg = {
        text,
        from: currentUser.uid,
        timestamp: Date.now()
      };
      // If replying
      if (replyToMsg) {
        msg.replyTo = replyToMsg.id;
        msg.replyText = replyToMsg.text ? replyToMsg.text.slice(0, 120) : '';
      }
      messageInput.value = '';
      clearReplyPreview();
      chatRef.child('messages').push(msg, err => {
        if (err) showAlert("Failed to send. Try again.");
      });
    }
  };

  // --- Delete Message ---
  function deleteMessage(msg) {
    const chatId = chatIdFor(currentUser, currentChatUser);
    if (confirm("Delete this message for everyone?")) {
      firebase.database().ref(`chats/${chatId}/messages/${msg.id}`).remove(err => {
        if (err) showAlert("Failed to delete.");
      });
    }
  }

  // --- Error Box on load ---
  clearAlert();

  // --- Focus input on chat switch ---
  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  if (messageInput) messageInput.onfocus = scrollToBottom;

  // --- Logout ---
  logoutBtn.onclick = () => {
    firebase.auth().signOut();
  };

  // --- Initial load ---
  loadProfile();
  loadUsers();
}
