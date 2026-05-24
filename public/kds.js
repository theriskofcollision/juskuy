async function fetchOrders() {
    try {
        const response = await fetch('/api/orders');
        const data = await response.json();
        renderOrders(data.orders);
    } catch (e) {
        console.error("Failed to fetch orders", e);
    }
}

function renderOrders(orders) {
    const container = document.getElementById('orders-container');
    
    if (orders.length === 0) {
        container.innerHTML = '<div class="empty-state">Waiting for AI orders...</div>';
        return;
    }

    let html = '';
    orders.forEach(order => {
        let ingredientsHtml = '';
        if (order.recipe.ingredients) {
            order.recipe.ingredients.forEach(ing => {
                ingredientsHtml += `<li><span>${ing.name}</span> <strong>${ing.amount}</strong></li>`;
            });
        }

        html += `
            <div class="order-card" id="order-${order.id}">
                <div class="order-header">
                    <div class="order-id">#${order.id}</div>
                    <div class="order-timer timer-display" data-created="${order.created_at}">New</div>
                </div>
                <div class="order-body">
                    <div class="recipe-title">${order.recipe.title || 'AI Custom Blend'}</div>
                    <ul class="ingredient-list">
                        ${ingredientsHtml}
                    </ul>
                </div>
                <div class="order-footer" style="display:flex; gap:10px;">
                    <button class="btn-complete" onclick="completeOrder(${order.id})" style="flex:1;">Complete</button>
                    <button onclick="printReceipt(${order.id}, '${encodeURIComponent(JSON.stringify(order))}')" style="background:#eee; border:none; border-radius:5px; cursor:pointer; font-weight:bold; padding:0 15px;">Print</button>
                </div>
            </div>
        `;
    });

    // Only update DOM if HTML changed (prevents flickering)
    if (container.innerHTML !== html) {
        container.innerHTML = html;
        updateTimers(); // update timers immediately after render
    }
}

function updateTimers() {
    const timers = document.querySelectorAll('.timer-display');
    const now = new Date();
    timers.forEach(t => {
        const createdStr = t.getAttribute('data-created');
        if(!createdStr) return;
        // createdStr is UTC string from sqlite CURRENT_TIMESTAMP e.g. "2023-10-10 12:00:00"
        // Sqlite CURRENT_TIMESTAMP is UTC
        const created = new Date(createdStr + "Z");
        const diffMs = now - created;
        const diffSecs = Math.floor(diffMs / 1000);
        
        if (diffSecs < 60) {
            t.innerText = diffSecs + 's ago';
        } else {
            const mins = Math.floor(diffSecs / 60);
            t.innerText = mins + 'm ago';
        }
    });
}
setInterval(updateTimers, 1000);

async function completeOrder(orderId) {
    try {
        await fetch('/api/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId })
        });
        // Optimistically remove from UI
        const card = document.getElementById(`order-${orderId}`);
        if(card) card.remove();
        fetchOrders();
    } catch(e) {
        alert('Failed to complete order');
    }
}

// Print Receipt
function printReceipt(orderId, orderDataStr) {
    const order = JSON.parse(decodeURIComponent(orderDataStr));
    const iframe = document.getElementById('receipt-iframe');
    const iframeDoc = iframe.contentWindow.document;
    
    let ingredientsHtml = order.recipe.ingredients.map(i => `<div>${i.amount} x ${i.name}</div>`).join('');
    
    iframeDoc.open();
    iframeDoc.write(`
        <html>
        <head><title>Receipt #${orderId}</title></head>
        <body style="font-family: monospace; width: 250px; text-align: center; margin:0; padding:10px;">
            <h2>JUSKUY</h2>
            <p>Order #${orderId}</p>
            <hr style="border:1px dashed #000;">
            <h3>${order.recipe.title}</h3>
            <div style="text-align: left; margin-bottom: 20px;">
                ${ingredientsHtml}
            </div>
            <hr style="border:1px dashed #000;">
            <p>Total: Rp ${order.recipe.price_idr.toLocaleString('id-ID')}</p>
            <p>Thank you!</p>
            <script>
                window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
    `);
    iframeDoc.close();
}

// Tabs and Analytics
let activeTab = 'orders';

function switchTab(tab) {
    activeTab = tab;
    document.getElementById('tab-orders').style.background = tab === 'orders' ? '#007aff' : '#eee';
    document.getElementById('tab-orders').style.color = tab === 'orders' ? '#fff' : '#333';
    
    document.getElementById('tab-pos').style.background = tab === 'pos' ? '#007aff' : '#eee';
    document.getElementById('tab-pos').style.color = tab === 'pos' ? '#fff' : '#333';
    
    document.getElementById('tab-analytics').style.background = tab === 'analytics' ? '#007aff' : '#eee';
    document.getElementById('tab-analytics').style.color = tab === 'analytics' ? '#fff' : '#333';
    
    document.getElementById('orders-container').style.display = tab === 'orders' ? 'grid' : 'none';
    document.getElementById('pos-container').style.display = tab === 'pos' ? 'block' : 'none';
    document.getElementById('analytics-container').style.display = tab === 'analytics' ? 'block' : 'none';
    
    if (tab === 'analytics') {
        fetchAnalytics();
    } else if (tab === 'pos') {
        renderPOS();
    }
}

async function fetchAnalytics() {
    try {
        const response = await fetch('/api/analytics');
        const data = await response.json();
        
        document.getElementById('stat-orders').innerText = data.total_orders;
        document.getElementById('stat-revenue').innerText = 'Rp ' + data.total_revenue.toLocaleString('id-ID');
        
        const list = document.getElementById('stat-recipes');
        list.innerHTML = '';
        if (data.popular_recipes.length === 0) {
            list.innerHTML = '<li>No orders completed yet.</li>';
        } else {
            data.popular_recipes.forEach(r => {
                list.innerHTML += `<li style="padding:10px 0; border-bottom:1px solid #eee; display:flex; justify-content:space-between;">
                    <span>${r.title}</span> <strong>${r.count} sold</strong>
                </li>`;
            });
        }
    } catch(e) {
        console.error('Failed to load analytics', e);
    }
}

// Initial Fetch
fetchOrders();
setInterval(fetchOrders, 3000);

// --- POS Logic ---
const POS_MENU = [
    // 10 Juices
    { title: "Apple Juice", price_idr: 35000, type: "Juice", ingredients: [{name: "Apple", amount: "2"}] },
    { title: "Orange Juice", price_idr: 35000, type: "Juice", ingredients: [{name: "Orange", amount: "2"}] },
    { title: "Watermelon Juice", price_idr: 35000, type: "Juice", ingredients: [{name: "Watermelon", amount: "1 slice"}] },
    { title: "Carrot Juice", price_idr: 35000, type: "Juice", ingredients: [{name: "Carrot", amount: "3"}] },
    { title: "Melon Juice", price_idr: 35000, type: "Juice", ingredients: [{name: "Honeydew", amount: "1 slice"}] },
    { title: "Tomato Juice", price_idr: 35000, type: "Juice", ingredients: [{name: "Tomato", amount: "3"}] },
    { title: "Pineapple Juice", price_idr: 35000, type: "Juice", ingredients: [{name: "Pineapple", amount: "1 slice"}] },
    { title: "Mango Juice", price_idr: 35000, type: "Juice", ingredients: [{name: "Mango", amount: "1"}] },
    { title: "Strawberry Juice", price_idr: 35000, type: "Juice", ingredients: [{name: "Strawberry", amount: "10"}] },
    { title: "Mixed Berry Juice", price_idr: 35000, type: "Juice", ingredients: [{name: "Mixed Berries", amount: "1 cup"}] },
    // 10 Smoothies
    { title: "Banana Smoothie", price_idr: 45000, type: "Smoothie", ingredients: [{name: "Banana", amount: "2"}, {name: "Milk", amount: "1 cup"}] },
    { title: "Strawberry Smoothie", price_idr: 45000, type: "Smoothie", ingredients: [{name: "Strawberry", amount: "1 cup"}, {name: "Milk", amount: "1 cup"}] },
    { title: "Mango Smoothie", price_idr: 45000, type: "Smoothie", ingredients: [{name: "Mango", amount: "1"}, {name: "Yogurt", amount: "1 cup"}] },
    { title: "Avocado Smoothie", price_idr: 45000, type: "Smoothie", ingredients: [{name: "Avocado", amount: "1"}, {name: "Milk", amount: "1 cup"}] },
    { title: "Dragonfruit Smoothie", price_idr: 45000, type: "Smoothie", ingredients: [{name: "Dragonfruit", amount: "1"}, {name: "Milk", amount: "1 cup"}] },
    { title: "Green Detox Smoothie", price_idr: 45000, type: "Smoothie", ingredients: [{name: "Spinach", amount: "1 cup"}, {name: "Apple", amount: "1"}] },
    { title: "Peanut Butter Smoothie", price_idr: 45000, type: "Smoothie", ingredients: [{name: "Peanut Butter", amount: "2 tbsp"}, {name: "Milk", amount: "1 cup"}] },
    { title: "Tropical Smoothie", price_idr: 45000, type: "Smoothie", ingredients: [{name: "Pineapple", amount: "1 slice"}, {name: "Mango", amount: "1"}] },
    { title: "Chocolate Banana Smoothie", price_idr: 45000, type: "Smoothie", ingredients: [{name: "Cocoa", amount: "1 tbsp"}, {name: "Banana", amount: "1"}] },
    { title: "Protein Berry Smoothie", price_idr: 45000, type: "Smoothie", ingredients: [{name: "Berries", amount: "1 cup"}, {name: "Protein Powder", amount: "1 scoop"}] }
];

function renderPOS() {
    const container = document.getElementById('pos-container');
    let html = '<div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">';
    
    const types = ['Juice', 'Smoothie'];
    types.forEach(type => {
        html += `<div style="background:#fff; padding:20px; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.05);">`;
        html += `<h3 style="margin-top:0;">${type}s</h3>`;
        html += `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:10px;">`;
        
        POS_MENU.filter(m => m.type === type).forEach((item, index) => {
            const dataStr = encodeURIComponent(JSON.stringify(item));
            html += `<button onclick="submitManualOrder('${dataStr}')" style="padding:15px 10px; background:#f0f0f0; border:1px solid #ddd; border-radius:8px; cursor:pointer; font-size:14px; font-weight:bold; transition:all 0.2s;" onmouseover="this.style.background='#e0e0e0'" onmouseout="this.style.background='#f0f0f0'">${item.title}<br><span style="font-size:12px; font-weight:normal; color:#666;">Rp ${(item.price_idr).toLocaleString('id-ID')}</span></button>`;
        });
        
        html += `</div></div>`;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

async function submitManualOrder(dataStr) {
    const recipe = JSON.parse(decodeURIComponent(dataStr));
    try {
        await fetch('/api/manual_order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipe: recipe })
        });
        // Switch back to orders and instantly fetch
        switchTab('orders');
        fetchOrders();
    } catch(e) {
        alert('Failed to submit POS order');
    }
}
