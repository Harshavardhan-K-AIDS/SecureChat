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
const nameError = document.getElementById('name-error'); // Feature 2
const leaveRoomBtn = document.getElementById('leave-room-btn');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const messageList = document.getElementById('message-list');
const chatRoomDisplay = document.getElementById('chat-room-display');
const userList = document.getElementById('user-list'); // Feature 3
const deleteChatBtn = document.getElementById('delete-chat-btn'); // Feature 1
const deleteModal = document.getElementById('delete-modal'); // Feature 1
const cancelDeleteBtn = document.getElementById('cancel-delete-btn'); // Feature 1
const confirmDeleteBtn = document.getElementById('confirm-delete-btn'); // Feature 1

/**
 * Main entry point for the application logic.
 * This is called from index.html after Firebase is initialized.
 */
export function initializeAppLogic(appDb, appAuth, appUserId) {
    db = appDb;
    auth = appAuth;
    userId = appUserId;

    // Start all event listeners
    setupEventListeners();

    // Initial check of the URL hash
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
    leaveRoomBtn.addEventListener('click', handleLeaveRoom);
    
    // Feature 1: Delete Chat listeners
    deleteChatBtn.addEventListener('click', () => deleteModal.classList.remove('hidden'));
    cancelDeleteBtn.addEventListener('click', () => deleteModal.classList.add('hidden'));
    confirmDeleteBtn.addEventListener('click', handleDeleteChat);
    
    // Feature 6: Page Title Notification listeners
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
    // This flag prevents the listener from running when we programmatically change the hash
    if (isNavigating) {
        isNavigating = false;
        return;
    }

    // Clean up any existing room listeners
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeUsers) unsubscribeUsers();
    
    messageList.innerHTML = ''; 
    userList.innerHTML = ''; // Feature 3
    
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
                // Room exists, ask for password
                showUI('password');
            } else {
                console.warn(`Room '${currentRoom}' does not exist. Redirecting.`);
                window.location.hash = '';
            }
        } catch (error) {
            console.error("Error checking room:", error);
            showLoading(false);
            window.location.hash = '';
        }
    } else {
        // No hash, show room selection
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
    deleteChatBtn.classList.add('hidden'); // Feature 1
    
    // Set room name display for all room-specific screens
    if (currentRoom) {
        chatRoomDisplay.textContent = `Room: ${currentRoom}`;
    } else {
        chatRoomDisplay.textContent = '';
    }

    if (state === 'room') {
        roomSelectionUI.classList.remove('hidden');
        chatRoomDisplay.textContent = ''; // No room name here
    } else if (state === 'password') {
        passwordVerifyUI.classList.remove('hidden');
    } else if (state === 'name') {
        nameSelectionUI.classList.remove('hidden');
    } else if (state === 'chat') {
        chatUI.classList.remove('hidden');
        deleteChatBtn.classList.remove('hidden'); // Feature 1
        scrollToBottom(); // Feature 4
    }
}

function showLoading(isLoading) {
    if (isLoading) {
        loadingSpinner.classList.remove('hidden');
    } else {
        loadingSpinner.classList.add('hidden');
    }
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
                // Password matches, join room (by setting hash)
                goToNameSelection(roomName);
            } else {
                roomError.textContent = "Invalid password for this room.";
                roomError.classList.remove('hidden');
            }
        } else {
            // Room doesn't exist, create it
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
            // Password is correct! Show name selection.
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

// Feature 2: Unique Name Logic
async function handleNameFormSubmit(e) {
    e.preventDefault();
    nameError.classList.add('hidden');
    const name = nameInput.value.trim();
    if (!name) return;

    showLoading(true);

    try {
        const usersColRef = collection(db, `chat-rooms/${currentRoom}/users`);
        const querySnapshot = await getDocs(usersColRef);
        
        let isNameTakenByOther = false;
        let userAlreadyExists = false;

        querySnapshot.forEach(doc => {
            if (doc.data().name.toLowerCase() === name.toLowerCase()) {
                if (doc.id !== userId) {
                    isNameTakenByOther = true;
                } else {
                    userAlreadyExists = true;
                }
            }
        });

        if (isNameTakenByOther) {
            nameError.textContent = "This name is already taken by another active user. Please choose another.";
            nameError.classList.remove('hidden');
            showLoading(false);
            return;
        }

        userName = name;
        
        // --- THIS IS THE FIX ---
        // Only add the user and "joined" message if they are
        // actually new to the room, not just re-joining.
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
        // --- END OF FIX ---
        
        showUI('chat');
        listenForMessages();
        listenForUsers(); // Feature 3
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
        // Add a "left" message
        await addDoc(collection(db, `chat-rooms/${currentRoom}/messages`), {
            type: "status",
            text: `${userName} has left the room.`,
            timestamp: serverTimestamp()
        });

        // Feature 3: Remove user from user list
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
        messageInput.value = ''; // Clear input immediately

        try {
            const collectionPath = `chat-rooms/${currentRoom}/messages`;
            await addDoc(collection(db, collectionPath), {
                type: "text",
                name: userName,
                text: text,
                senderId: userId,
                timestamp: serverTimestamp() // Real server timestamp
            });
        } catch (error) {
            console.error("Error sending message:", error);
            messageInput.value = text; // Put message back on error
        }
    }
}

// --- Real-time Listeners ---

function listenForMessages() {
    if (!currentRoom) return;
    
    // Clear the list before listening
    messageList.innerHTML = '';

    const messagesCol = collection(db, `chat-rooms/${currentRoom}/messages`);
    const q = query(messagesCol); // No orderby, will sort on client

    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        let newMessagesCount = 0;
        let messages = [];

        // Note: We use docChanges() to efficiently process only what's new or changed.
        // But for timestamp updates, we need to handle 'modified'.
        // Let's simplify and just re-render. A more complex app might diff.

        // Re-simplification: On first load, render all. On updates, just add.
        // This is complex with client-side sorting.
        
        // Let's use the stable client-side sort method.
        let allMessages = [];
        snapshot.forEach(doc => {
            allMessages.push({ id: doc.id, ...doc.data() });
        });

        // Sort all messages by timestamp
        allMessages.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

        const shouldScroll = messageList.scrollTop + messageList.clientHeight >= messageList.scrollHeight - 20;

        // Clear list and render all sorted messages
        messageList.innerHTML = '';
        allMessages.forEach(msg => {
            renderMessage(msg);
        });

        // Check for new messages to update title
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

        // Feature 6: Update page title
        if (newMessagesCount > 0 && !isWindowFocused) {
            unreadMessages += newMessagesCount;
            document.title = `(${unreadMessages}) ${originalTitle}`;
        }
        
        // Feature 4: Scroll to bottom
        if (shouldScroll || newMessagesCount > 0) {
            scrollToBottom();
        }

    }, (error) => {
        console.error("Error listening for messages:", error);
    });
}

// Feature 3: Listen for users
function listenForUsers() {
    if (!currentRoom) return;

    const usersColRef = collection(db, `chat-rooms/${currentRoom}/users`);
    unsubscribeUsers = onSnapshot(usersColRef, (snapshot) => {
        userList.innerHTML = '';
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

// Feature 1: Delete all chat messages
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
        messageList.innerHTML = ''; // Clear UI
        console.log("All messages deleted.");
    } catch (error) {
        console.error("Error deleting chat:", error);
    } finally {
        showLoading(false);
    }
}

/**
 * Renders a single message.
 * @param {object} msg - The message object.
 */
function renderMessage(msg) {
    // if (document.getElementById(msg.id)) return; // Avoid duplicates - removed for simplicity

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
        
        // Feature 5: Timestamp
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
    isNavigating = true; // Set flag to prevent hashchange listener
    window.location.hash = roomName;
    showUI('name'); // Go directly to name selection
}

// Feature 4: Scroll to bottom
function scrollToBottom() {
    messageList.scrollTop = messageList.scrollHeight;
}

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    // THE FIX: Changed 'SHA-26' to 'SHA-256'
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Feature 5: Format timestamp
function formatTimestamp(timestamp) {
    if (!timestamp) return '...'; // Show ... if server timestamp isn't here yet
    try {
        const date = timestamp.toDate();
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (error) {
        return '...';
    }
}