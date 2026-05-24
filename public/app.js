const chatScript = [
    {
        question: "Hi there! 🥤 Would you like a fresh Jus (Juice) or a creamy Smoothie today?",
        chips: ["Fresh Jus 🧃", "Creamy Smoothie 🥤"]
    },
    {
        question: "Awesome! Are you feeling stressed, tired, or getting ready for a workout today?",
        chips: ["Tired 😴", "Stressed 🤯", "Workout 🏋️‍♂️", "Just thirsty 💧"]
    },
    {
        question: "Got it. Any allergies or ingredients you absolutely hate? (e.g., dairy, peanuts, ginger)",
        chips: ["No allergies 👍", "No Dairy 🥛🚫", "No Ginger 🫚🚫", "Nut allergy 🥜🚫"]
    },
    {
        question: "Perfect! Calculating your custom recipe now...",
        chips: []
    }
];

let currentQuestion = 0;
let userAnswers = [];

// Initialize user session
async function initUser() {
    let token = localStorage.getItem('juskuy_token');
    if (!token) {
        try {
            const res = await fetch('/api/user', { method: 'POST' });
            const data = await res.json();
            if (data.token) {
                localStorage.setItem('juskuy_token', data.token);
            }
        } catch(e) {
            console.error("Failed to init user", e);
        }
    }
}
initUser();

let historyInterval = null;

async function showHistory() {
    document.getElementById('history-view').style.display = 'flex';
    fetchHistoryData();
    historyInterval = setInterval(fetchHistoryData, 3000);
}

function closeHistory() {
    document.getElementById('history-view').style.display = 'none';
    if(historyInterval) clearInterval(historyInterval);
}

async function fetchHistoryData() {
    const box = document.getElementById('history-box');
    if (!box.innerHTML) box.innerHTML = '<p>Loading history...</p>';
    
    let token = localStorage.getItem('juskuy_token');
    if (!token) {
        box.innerHTML = '<p>No history found.</p>';
        return;
    }
    
    try {
        const res = await fetch('/api/history?token=' + token);
        const data = await res.json();
        
        if (!data.history || data.history.length === 0) {
            box.innerHTML = '<p>You have no past orders.</p>';
            return;
        }
        box.innerHTML = '';
        data.history.forEach(order => {
            const card = document.createElement('div');
            card.className = 'recipe-card';
            card.style.border = '1px solid #ddd';
            card.style.borderRadius = '10px';
            card.style.padding = '15px';
            card.style.marginBottom = '10px';
            card.style.backgroundColor = '#f9f9f9';
            
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <strong>Your Custom Order</strong>
                    <span style="color:#666; font-size:12px;">${new Date(order.created_at).toLocaleString()}</span>
                </div>
                <strong>${order.recipe.title}</strong><br>
                <small>${order.recipe.description}</small><br>
                <em>Status: ${order.status}</em><br><br>
                ${order.recipe.ingredients.map(i => i.name).join('<br>')}
            `;
            box.appendChild(card);
        });
        
    } catch(e) {
        box.innerHTML = '<p>Failed to load history.</p>';
        console.error(e);
    }
}

function startChat() {
    document.getElementById('landing-view').classList.remove('active');
    document.getElementById('chat-view').classList.add('active');
    
    // Clear chat
    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML = '';
    currentQuestion = 0;
    userAnswers = [];
    
    // Send first question
    simulateTyping(chatScript[0].question, chatScript[0].chips, 800, () => {
        enableInput();
    });
}

function backToLanding() {
    document.getElementById('chat-view').classList.remove('active');
    document.getElementById('landing-view').classList.add('active');
}

function simulateTyping(text, chips, delay, callback) {
    const chatBox = document.getElementById('chat-box');
    const typingId = 'typing-' + Date.now();
    
    // Remove old chips
    const oldChips = document.querySelectorAll('.chips-container');
    oldChips.forEach(c => c.remove());
    
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message msg-ai msg-typing';
    typingDiv.id = typingId;
    typingDiv.innerText = 'Juskuy is typing...';
    chatBox.appendChild(typingDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    
    setTimeout(() => {
        const tDiv = document.getElementById(typingId);
        if (tDiv) tDiv.remove();
        
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message msg-ai';
        msgDiv.innerText = text;
        chatBox.appendChild(msgDiv);
        
        if (chips && chips.length > 0) {
            const chipsDiv = document.createElement('div');
            chipsDiv.className = 'chips-container';
            chips.forEach(chipText => {
                const btn = document.createElement('button');
                btn.className = 'chip';
                btn.innerText = chipText;
                btn.onclick = () => sendChip(chipText);
                chipsDiv.appendChild(btn);
            });
            chatBox.appendChild(chipsDiv);
        }
        
        chatBox.scrollTop = chatBox.scrollHeight;
        if(callback) callback();
    }, delay);
}

function sendChip(text) {
    document.getElementById('chat-input').value = text;
    handleSend();
}

function enableInput() {
    document.getElementById('chat-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('chat-input').focus();
}

function disableInput() {
    document.getElementById('chat-input').disabled = true;
    document.getElementById('send-btn').disabled = true;
}

function handleSend() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if(!text) return;
    
    // Add user message
    const chatBox = document.getElementById('chat-box');
    const userDiv = document.createElement('div');
    userDiv.className = 'message msg-user';
    userDiv.innerText = text;
    chatBox.appendChild(userDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    
    // Track answer
    userAnswers.push(text);
    
    // Clear input
    input.value = '';
    disableInput();
    
    currentQuestion++;
    
    if (currentQuestion === 1) {
        simulateTyping(chatScript[1].question, chatScript[1].chips, 1000, () => {
            enableInput();
        });
    } else if (currentQuestion === 2) {
        simulateTyping(chatScript[2].question, chatScript[2].chips, 1000, () => {
            enableInput();
        });
    } else if (currentQuestion === 3) {
        simulateTyping(chatScript[3].question, chatScript[3].chips, 1200, async () => {
            
            try {
                // Send answers to backend to generate recipes via Groq
                const response = await fetch('/api/order', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({answers: userAnswers})
                });
                
                const data = await response.json();

                if (data.recipe && data.recipe.error) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'message msg-ai';
                    errorDiv.innerText = data.recipe.error;
                    chatBox.appendChild(errorDiv);
                    
                    const retryBtn = document.createElement('button');
                    retryBtn.className = 'chip';
                    retryBtn.innerText = 'Start Over 🔄';
                    retryBtn.style.marginTop = '10px';
                    retryBtn.onclick = () => startChat();
                    
                    const btnContainer = document.createElement('div');
                    btnContainer.appendChild(retryBtn);
                    chatBox.appendChild(btnContainer);
                    chatBox.scrollTop = chatBox.scrollHeight;
                    
                    return; // Stop execution
                }

                const recipes = data.recipes;
                
                const promptDiv = document.createElement('div');
                promptDiv.className = 'message msg-ai';
                promptDiv.innerText = "Here are 3 custom options for you! Which one sounds best?";
                chatBox.appendChild(promptDiv);

                const optionsContainer = document.createElement('div');
                optionsContainer.className = 'recipes-container';
                optionsContainer.style.display = 'flex';
                optionsContainer.style.flexDirection = 'column';
                optionsContainer.style.gap = '10px';
                optionsContainer.style.marginTop = '10px';

                recipes.forEach((recipe, index) => {
                    const card = document.createElement('div');
                    card.className = 'recipe-card';
                    card.style.border = '1px solid #ddd';
                    card.style.borderRadius = '10px';
                    card.style.padding = '15px';
                    card.style.cursor = 'pointer';
                    card.style.backgroundColor = '#f9f9f9';
                    
                    // Render ONLY the ingredient names (no amounts) so customers don't nitpick pricing.
                    card.innerHTML = `
                        <strong>${recipe.title}</strong><br>
                        <small>${recipe.description}</small><br>
                        <em>Rp ${recipe.price_idr.toLocaleString('id-ID')} | ${recipe.macros.calories} kcal, ${recipe.macros.protein} protein</em><br><br>
                        ${recipe.ingredients.map(i => `${i.name}`).join('<br>')}
                    `;
                    
                    card.onclick = async () => {
                        // User selected this recipe
                        card.style.borderColor = '#007aff';
                        card.style.backgroundColor = '#e6f2ff';
                        
                        // Disable other cards
                        Array.from(optionsContainer.children).forEach(c => {
                            if (c !== card) c.style.opacity = '0.5';
                            c.onclick = null;
                        });

                        const selectMsg = document.createElement('div');
                        selectMsg.className = 'message msg-user';
                        selectMsg.innerText = `I'll take the ${recipe.title}!`;
                        chatBox.appendChild(selectMsg);
                        chatBox.scrollTop = chatBox.scrollHeight;

                        const selectRes = await fetch('/api/select', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({
                                recipe: recipe,
                                token: localStorage.getItem('juskuy_token')
                            })
                        });
                        
                        if (selectRes.ok) {
                            const selectData = await selectRes.json();
                            const orderId = selectData.order_id;
                            
                            const confirmDiv = document.createElement('div');
                            confirmDiv.className = 'message msg-ai';
                            confirmDiv.innerHTML = `✅ Excellent choice! Here is your total: <strong>Rp ${recipe.price_idr.toLocaleString('id-ID')}</strong><br><br>Scan the QR code below to finalize your order.`;
                            chatBox.appendChild(confirmDiv);
                            
                            const qrDiv = document.createElement('div');
                            qrDiv.className = 'message msg-ai';
                            qrDiv.innerHTML = `
                                <div style="text-align: center;">
                                    <div style="width: 150px; height: 150px; background: #eee; margin: 0 auto; display: flex; align-items: center; justify-content: center; font-size: 50px;">📲</div>
                                    <p style="margin: 10px 0;">QRIS / GoPay</p>
                                    <button class="chip" style="background-color: #4CAF50; color: white;" onclick="simulatePayment(this, ${orderId})">Simulate Payment</button>
                                </div>
                            `;
                            chatBox.appendChild(qrDiv);
                            chatBox.scrollTop = chatBox.scrollHeight;
                        }
                    };
                    optionsContainer.appendChild(card);
                });
                
                chatBox.appendChild(optionsContainer);
                chatBox.scrollTop = chatBox.scrollHeight;

            } catch(e) {
                console.error(e);
            }
        });
    }
}

// Enter key support
document.getElementById('chat-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') handleSend();
});

window.simulatePayment = async function(btn, orderId) {
    btn.innerText = 'Processing...';
    btn.disabled = true;
    
    try {
        const response = await fetch('/api/pay', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({order_id: orderId})
        });
        
        if (response.ok) {
            const chatBox = document.getElementById('chat-box');
            const paidDiv = document.createElement('div');
            paidDiv.className = 'message msg-ai';
            paidDiv.innerHTML = `🎉 Payment received! Your order is now being prepared by the barista. Please wait for your drink to be called!`;
            chatBox.appendChild(paidDiv);
            chatBox.scrollTop = chatBox.scrollHeight;
            btn.parentElement.parentElement.remove();
        }
    } catch(e) {
        console.error("Payment failed", e);
        btn.innerText = 'Try Again';
        btn.disabled = false;
    }
}
