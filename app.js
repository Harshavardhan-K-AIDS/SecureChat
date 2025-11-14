// Import all necessary Firebase functions
import {
    doc, getDoc, setDoc, addDoc, collection, query, onSnapshot,
    serverTimestamp, getDocs, writeBatch, deleteDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Global App State ---
let db, auth, userId, userName; // Firebase services and user info
let currentRoom = null;
let unsubscribeMessages = null; // Function to stop listening for messages
let unsubscribeUsers = null; // Function to stop listening for users
let isWindowFocused = true;
let unreadMessages = 0;
const originalTitle = "SecureChat"; // Feature 6
let isNavigating = false; // Fix for navigation bugs

// --- DOM Element Selection ---
const loadingSpinner = document.getElementById('loading-spinner');
const roomSelectionUI = document.getElementById('room-selection-ui');
const nameSelectionUI = document.getElementById('name-selection-ui');
const chatUI = document.getElementById('chat-ui');
const passwordVerifyUI = document.getElementById('password-verify-ui');
const roomForm = document.getElementById('room-form');
const roomInput = document.getElementById('room-input');
const roomPasswordInput = document.getElementById('room-password-input');
const roomError = document.getElementById('room-error');
const passwordVerifyForm = document.getElementById('password-verify-form');
const passwordVerifyInput = document.getElementById('password-verify-input');
const passwordError = document.getElementById('password-error');
const backToRoomsBtn = document.getElementById('back-to-rooms-btn');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const nameError = document.getElementById('name-error');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const messageList = document.getElementById('message-list');
const chatRoomDisplay = document.getElementById('chat-room-display');
const userList = document.getElementById('user-list');
const deleteChatBtn = document.getElementById('delete-chat-btn');
const leaveChatHeaderBtn = document.getElementById('leave-chat-header-btn');
const deleteModal = document.getElementById('delete-modal');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

// NEW: Sidebar elements
const sidebar = document.getElementById('sidebar');
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const userCount = document.getElementById('user-count');

/**
 * Main entry point for the application logic.
 */
export function initializeAppLogic(appDb, appAuth, appUserId) {
    db = appDb;
    auth = appAuth;
    userId = appUserId;

    setupEventListeners();
    handleHashChange();
}

// --- Event Listeners Setup ---
function setupEventListeners() {
    window.addEventListener('hashchange', handleHashChange);
    roomForm.addEventListener('submit', handleRoomFormSubmit);
    passwordVerifyForm.addEventListener('submit', handlePasswordVerifySubmit);
    nameForm.addEventListener('submit', handleNameFormSubmit);
    messageForm.addEventListener('submit', handleMessageFormSubmit);
    backToRoomsBtn.addEventListener('click', () => window.location.hash = '');
    leaveChatHeaderBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleLeaveRoom();
    });

    // NEW: Sidebar listeners
    sidebarToggleBtn.addEventListener('click', toggleSidebar);
    sidebarOverlay.addEventListener('click', toggleSidebar);

    // Delete Chat listeners
    deleteChatBtn.addEventListener('click', () => deleteModal.classList.remove('hidden'));
    cancelDeleteBtn.addEventListener('click', () => deleteModal.classList.add('hidden'));
    confirmDeleteBtn.addEventListener('click', handleDeleteChat);
    
    // Page Title Notification listeners
    window.onfocus = () => {
        isWindowFocused = true;
        unreadMessages = 0;
        document.title = originalTitle;
    };
    window.onblur = () => {
        isWindowFocused = false;
    };
}

// --- Navigation and UI Flow ---

async function handleHashChange() {
    if (isNavigating) {
        isNavigating = false;
        return;
    }

    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeUsers) unsubscribeUsers();
    
    messageList.innerHTML = ''; 
    userList.innerHTML = '';
    
    const hash = window.location.hash.substring(1);
    
    if (hash) {
        currentRoom = hash;
        chatRoomDisplay.textContent = `Room: ${currentRoom}`;
        showLoading(true);
        
        try {
            const roomDocRef = doc(db, `chat-rooms/${currentRoom}`);
            const roomSnap = await getDoc(roomDocRef);
            
            showLoading(false);
            if (roomSnap.exists()) {
                showUI('password');
            } else {
                window.location.hash = '';
            }
        } catch (error) {
            console.error("Error checking room:", error);
            showLoading(false);
            window.location.hash = '';
        }
    } else {
        currentRoom = null;
        chatRoomDisplay.textContent = '';
        showUI('room');
        passwordVerifyInput.value = '';
        roomPasswordInput.value = '';
        roomInput.value = '';
        nameInput.value = '';
    }
}

function showUI(state) {
    showLoading(false);
    roomSelectionUI.classList.add('hidden');
    nameSelectionUI.classList.add('hidden');
    chatUI.classList.add('hidden');
    passwordVerifyUI.classList.add('hidden');
    deleteChatBtn.classList.add('hidden');
    leaveChatHeaderBtn.classList.add('hidden');
    sidebarToggleBtn.classList.add('hidden'); // NEW: Hide toggle by default

    // Close sidebar if user navigates away from chat
    if (state !== 'chat' && !sidebar.classList.contains('-translate-x-full')) {
        toggleSidebar();
    }

    if (currentRoom) {
        chatRoomDisplay.textContent = `Room: ${currentRoom}`;
    } else {
        chatRoomDisplay.textContent = '';
    }

    if (state === 'room') {
        roomSelectionUI.classList.remove('hidden');
        chatRoomDisplay.textContent = '';
    } else if (state === 'password') {
        passwordVerifyUI.classList.remove('hidden');
    } else if (state === 'name') {
        nameSelectionUI.classList.remove('hidden');
    } else if (state === 'chat') {
        chatUI.classList.remove('hidden');
        deleteChatBtn.classList.remove('hidden');
        leaveChatHeaderBtn.classList.remove('hidden');
        sidebarToggleBtn.classList.remove('hidden'); // NEW: Show toggle
        scrollToBottom();
    }
}

function showLoading(isLoading) {
    if (isLoading) {
        loadingSpinner.classList.remove('hidden');
    } else {
        loadingSpinner.classList.add('hidden');
    }
}

// NEW: Sidebar toggle function
function toggleSidebar() {
    sidebar.classList.toggle('-translate-x-full');
    sidebarOverlay.classList.toggle('hidden');
}

// --- Form Handlers ---

async function handleRoomFormSubmit(e) {
    e.preventDefault();
    roomError.classList.add('hidden');
    const roomName = roomInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    const password = roomPasswordInput.value.trim();

    if (!roomName || !password) {
        roomError.textContent = "Room name and password are required.";
        roomError.classList.remove('hidden');
        return;
    }
    showLoading(true);
    
    try {
        const passwordHash = await hashPassword(password);
        const roomDocRef = doc(db, `chat-rooms/${roomName}`);
        const roomSnap = await getDoc(roomDocRef);

        if (roomSnap.exists()) {
            const storedHash = roomSnap.data().passwordHash;
            if (storedHash === passwordHash) {
                goToNameSelection(roomName);
            } else {
                roomError.textContent = "Invalid password for this room.";
                roomError.classList.remove('hidden');
            }
        } else {
            await setDoc(roomDocRef, {
                passwordHash: passwordHash,
                createdAt: serverTimestamp()
            });
            goToNameSelection(roomName);
        }
    } catch (error) {
        console.error("Error creating/joining room:", error);
        roomError.textContent = "An error occurred. Please try again.";
        roomError.classList.remove('hidden');
    } finally {
        showLoading(false);
    }
}

async function handlePasswordVerifySubmit(e) {
    e.preventDefault();
    passwordError.classList.add('hidden');
    const password = passwordVerifyInput.value.trim();
    if (!password || !currentRoom) return;
    
    showLoading(true);
    
    try {
        const passwordHash = await hashPassword(password);
        const roomDocRef = doc(db, `chat-rooms/${currentRoom}`);
        const roomSnap = await getDoc(roomDocRef);
        
        if (roomSnap.exists() && roomSnap.data().passwordHash === passwordHash) {
            showUI('name');
        } else {
            passwordError.textContent = "Invalid password. Please try again.";
            passwordError.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Error verifying password:", error);
        passwordError.textContent = "An error occurred. Please try again.";
        passwordError.classList.remove('hidden');
    } finally {
        showLoading(false);
    }
}

// "Name-stealing" logic to fix ghost users
async function handleNameFormSubmit(e) {
    e.preventDefault();
    nameError.classList.add('hidden');
    const name = nameInput.value.trim();
    if (!name) return;

    showLoading(true);

    try {
        const usersColRef = collection(db, `chat-rooms/${currentRoom}/users`);
        const querySnapshot = await getDocs(usersColRef);
        
        let ghostUserDoc = null;
        let userAlreadyExists = false;

        querySnapshot.forEach(doc => {
            if (doc.data().name.toLowerCase() === name.toLowerCase()) {
                if (doc.id !== userId) {
                    ghostUserDoc = doc;
                } else {
                    userAlreadyExists = true;
                }
            }
        });

        if (ghostUserDoc) {
            await deleteDoc(ghostUserDoc.ref);
        }

        userName = name;
        
        if (!userAlreadyExists) {
            const userDocRef = doc(db, `chat-rooms/${currentRoom}/users`, userId);
            await setDoc(userDocRef, {
                name: userName,
                joined: serverTimestamp()
            });

            await addDoc(collection(db, `chat-rooms/${currentRoom}/messages`), {
                type: "status",
                text: `${userName} has joined the room.`,
                timestamp: serverTimestamp()
            });
        }
        
        showUI('chat');
        listenForMessages();
        listenForUsers();
    } catch (error) {
        console.error("Error setting name or joining:", error);
        nameError.textContent = "An error occurred while joining.";
        nameError.classList.remove('hidden');
    } finally {
        showLoading(false);
    }
}

async function handleLeaveRoom() {
    if (!currentRoom || !userId || !userName) {
        window.location.hash = '';
        return;
    }

    try {
        await addDoc(collection(db, `chat-rooms/${currentRoom}/messages`), {
            type: "status",
            text: `${userName} has left the room.`,
            timestamp: serverTimestamp()
        });

        const userDocRef = doc(db, `chat-rooms/${currentRoom}/users`, userId);
        await deleteDoc(userDocRef);

    } catch (error) {
        console.error("Error during leave room cleanup:", error);
    } finally {
        window.location.hash = '';
        userName = null;
    }
}

async function handleMessageFormSubmit(e) {
    e.preventDefault();
    const text = messageInput.value.trim();
    
    if (text && currentRoom && userName) {
        messageInput.value = '';

        try {
            const collectionPath = `chat-rooms/${currentRoom}/messages`;
            await addDoc(collection(db, collectionPath), {
                type: "text",
                name: userName,
                text: text,
                senderId: userId,
                timestamp: serverTimestamp()
            });
        } catch (error) {
            console.error("Error sending message:", error);
            messageInput.value = text;
        }
    }
}

// --- Real-time Listeners ---

function listenForMessages() {
    if (!currentRoom) return;
    
    messageList.innerHTML = '';

    const messagesCol = collection(db, `chat-rooms/${currentRoom}/messages`);
    const q = query(messagesCol);

    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        let newMessagesCount = 0;
        let allMessages = [];
        snapshot.forEach(doc => {
            allMessages.push({ id: doc.id, ...doc.data() });
        });

        allMessages.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

        const shouldScroll = messageList.scrollTop + messageList.clientHeight >= messageList.scrollHeight - 20;

        messageList.innerHTML = '';
        allMessages.forEach(msg => {
            renderMessage(msg);
        });

        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const msg = change.doc.data();
                if (msg.timestamp && msg.senderId !== userId) {
                    const msgTime = msg.timestamp?.toDate();
                    if (msgTime && (Date.now() - msgTime.getTime() < 10000)) {
                        newMessagesCount++;
                    }
                }
            }
        });

        if (newMessagesCount > 0 && !isWindowFocused) {
            unreadMessages += newMessagesCount;
            document.title = `(${unreadMessages}) ${originalTitle}`;
        }
        
        if (shouldScroll || newMessagesCount > 0) {
            scrollToBottom();
        }

    }, (error) => {
        console.error("Error listening for messages:", error);
    });
}

function listenForUsers() {
    if (!currentRoom) return;

    const usersColRef = collection(db, `chat-rooms/${currentRoom}/users`);
    unsubscribeUsers = onSnapshot(usersColRef, (snapshot) => {
        userList.innerHTML = '';
        // NEW: Update user count
        userCount.textContent = `(${snapshot.size})`;

        snapshot.forEach(doc => {
            const user = doc.data();
            const userEl = document.createElement('li');
            userEl.classList.add('flex', 'items-center', 'gap-2', 'p-2', 'bg-gray-800', 'rounded');
            
            userEl.innerHTML = `
                <span class="h-3 w-3 bg-green-500 rounded-full flex-shrink-0"></span>
                <span class="text-gray-200 truncate" title="${user.name}">${user.name}</span>
            `;
            userList.appendChild(userEl);
        });
    }, (error) => {
        console.error("Error listening for users:", error);
    });
}


// --- Feature Functions ---

async function handleDeleteChat() {
    if (!currentRoom) return;
    
    showLoading(true);
    deleteModal.classList.add('hidden');

    try {
        const messagesCol = collection(db, `chat-rooms/${currentRoom}/messages`);
        const querySnapshot = await getDocs(messagesCol);

        if (querySnapshot.empty) {
            showLoading(false);
            return;
        }

        const batch = writeBatch(db);
        querySnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
        messageList.innerHTML = '';
    } catch (error) {
        console.error("Error deleting chat:", error);
    } finally {
        showLoading(false);
    }
}

function renderMessage(msg) {
    const isSelf = msg.senderId === userId;
    const messageWrapper = document.createElement('div');
    messageWrapper.id = msg.id;

    if (msg.type === "status") {
        messageWrapper.classList.add('text-center', 'text-sm', 'text-gray-400', 'my-2');
        messageWrapper.textContent = msg.text;
    } else {
        messageWrapper.classList.add('flex', 'w-full', isSelf ? 'justify-end' : 'justify-start');
        const messageBubble = document.createElement('div');
        messageBubble.classList.add('max-w-xs', 'md:max-w-md', 'p-3', 'rounded-lg', 'shadow', isSelf ? 'bg-blue-600' : 'bg-gray-600');
        
        const senderName = document.createElement('div');
        senderName.classList.add('font-bold', 'text-sm', 'mb-1');
        senderName.textContent = msg.name || 'Anonymous';
        messageBubble.appendChild(senderName);

        if (msg.type === "text") {
            const messageText = document.createElement('div');
            messageText.classList.add('text-white', 'break-words');
            messageText.textContent = msg.text || '';
            messageBubble.appendChild(messageText);
        }
        
        const timestamp = document.createElement('div');
        timestamp.classList.add('timestamp', 'text-xs', 'text-gray-200', 'mt-1', 'text-right');
        timestamp.textContent = formatTimestamp(msg.timestamp);
        messageBubble.appendChild(timestamp);

        messageWrapper.appendChild(messageBubble);
    }
    messageList.appendChild(messageWrapper);
}


// --- Utility Functions ---

function goToNameSelection(roomName) {
    currentRoom = roomName;
    isNavigating = true;
    window.location.hash = roomName;
    showUI('name');
}

function scrollToBottom() {
    messageList.scrollTop = messageList.scrollHeight;
}

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '...';
    try {
        const date = timestamp.toDate();
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (error) {
        return '...';
    }
}