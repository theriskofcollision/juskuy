import http.server
import socketserver
import json
import os
import urllib.request
import sqlite3
import uuid
from urllib.parse import urlparse, parse_qs

PORT = 8000
DIRECTORY = "public"

# Load .env manually to avoid dependencies
def load_env():
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value

load_env()

# Database Setup
def init_db():
    conn = sqlite3.connect('juskuy.db')
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            recipe JSON,
            status TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''')
    conn.commit()
    conn.close()

init_db()


def generate_groq_recipe(answers):
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        print("Missing GROQ_API_KEY")
        return {"title": "API Key Missing Recipe", "ingredients": [{"name": "🍌 Check .env", "amount": "1"}]}
        
    url = "https://api.groq.com/openai/v1/chat/completions"
    
    system_prompt = """You are Juskuy, an AI smoothie coach in Indonesia.
The user will provide their answers to your health questions.
Your job is to generate exactly 3 custom, distinct smoothie recipe options based on their answers.

STRICT INVENTORY RULES:
You MUST ONLY select ingredients from the following inventory:
- Liquids: Coconut Water, Oat Milk, Mineral Water, Almond Milk, Greek Yogurt
- Fruits: Banana, Mango, Pineapple, Papaya, Strawberry, Dragon Fruit, Avocado
- Vegetables: Spinach, Kale, Celery
- Boosts: Ginger, Turmeric, Chia Seeds, Whey Protein, Maca Powder, Spirulina, Honey
Do NOT invent or use any ingredients outside of this list.

GARBAGE INPUT RULES:
If the user's answers are gibberish (e.g., keyboard mashing), offensive, or completely unrelated to health or smoothies, you must reject it.
Instead of recipes, output exactly this JSON:
{"error": "I didn't quite catch that! Could you please tell me how you are feeling or if you have any allergies?"}

OUTPUT FORMAT:
If the input is valid, you MUST output ONLY a valid JSON object matching this schema exactly, with no markdown formatting:
{
  "recipes": [
    {
      "title": "A catchy name for the smoothie",
      "description": "A fun, short tagline describing the flavor and benefits.",
      "macros": {
        "calories": 250,
        "protein": "10g"
      },
      "price_idr": 45000,
      "ingredients": [
        {"name": "Ingredient Name with Emoji", "amount": "Amount (e.g., 50g, 1 piece)"}
      ]
    }
  ]
}
Make sure to provide exactly 3 options in the "recipes" array. Each option should be unique in flavor profile."""

    prompt = f"User answers: {answers}"
    
    data = {
        "model": "llama-3.1-8b-instant",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.7
    }
    
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'))
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', f'Bearer {api_key}')
    req.add_header('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    
    try:
        response = urllib.request.urlopen(req)
        response_data = json.loads(response.read().decode('utf-8'))
        content = response_data['choices'][0]['message']['content']
        return json.loads(content)
    except Exception as e:
        print("Groq API Error:", e)
        return {
            "title": "Fallback Boost",
            "ingredients": [{"name": "🍌 Banana", "amount": "1"}]
        }

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed_path = urlparse(self.path)
        if parsed_path.path == '/api/orders':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            conn = sqlite3.connect('juskuy.db')
            c = conn.cursor()
            c.execute("SELECT id, recipe, status, created_at FROM orders WHERE status IN ('paid', 'preparing')")
            rows = c.fetchall()
            conn.close()
            pending_orders = [{"id": r[0], "recipe": json.loads(r[1]), "status": r[2], "created_at": r[3]} for r in rows]
            self.wfile.write(json.dumps({"orders": pending_orders}).encode())
            
        elif parsed_path.path == '/api/history':
            query = parse_qs(parsed_path.query)
            token = query.get('token', [None])[0]
            if not token:
                self.send_response(400)
                self.end_headers()
                return
            conn = sqlite3.connect('juskuy.db')
            c = conn.cursor()
            c.execute("SELECT id, recipe, status, created_at FROM orders WHERE user_id = ? ORDER BY id DESC", (token,))
            rows = c.fetchall()
            conn.close()
            history = [{"id": r[0], "recipe": json.loads(r[1]), "status": r[2], "created_at": r[3]} for r in rows]
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"history": history}).encode())
            
        elif parsed_path.path == '/api/analytics':
            conn = sqlite3.connect('juskuy.db')
            c = conn.cursor()
            c.execute("SELECT recipe FROM orders WHERE status = 'ready'")
            rows = c.fetchall()
            conn.close()
            
            total_orders = len(rows)
            total_revenue = 0
            recipes = {}
            for r in rows:
                if not r[0]: continue
                rec = json.loads(r[0])
                total_revenue += rec.get('price_idr', 0)
                raw_title = rec.get('title', 'Unknown')
                # Normalize title
                t = raw_title.lower().replace("smoothie", "").replace("juice", "").replace("blend", "").strip().title()
                recipes[t] = recipes.get(t, 0) + 1
                
            popular = sorted([{"title": k, "count": v} for k, v in recipes.items()], key=lambda x: x["count"], reverse=True)
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "total_orders": total_orders,
                "total_revenue": total_revenue,
                "popular_recipes": popular
            }).encode())

        else:
            super().do_GET()

    def do_POST(self):
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/api/user':
            new_id = str(uuid.uuid4())
            conn = sqlite3.connect('juskuy.db')
            c = conn.cursor()
            c.execute("INSERT INTO users (id) VALUES (?)", (new_id,))
            conn.commit()
            conn.close()
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"token": new_id}).encode())
            
        elif parsed_path.path == '/api/order':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            answers = data.get("answers", [])
            recipe_data = generate_groq_recipe(answers)
            
            if "error" in recipe_data:
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "recipe": recipe_data}).encode())
                return
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "recipes": recipe_data.get("recipes", [])}).encode())
            
        elif parsed_path.path == '/api/select':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            selected_recipe = data.get("recipe")
            token = data.get("token")
            
            conn = sqlite3.connect('juskuy.db')
            c = conn.cursor()
            c.execute("INSERT INTO orders (user_id, recipe, status) VALUES (?, ?, ?)", 
                      (token, json.dumps(selected_recipe), "pending_payment"))
            order_id = c.lastrowid
            conn.commit()
            conn.close()
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "order_id": order_id, "recipe": selected_recipe}).encode())
            
        elif parsed_path.path == '/api/manual_order':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            selected_recipe = data.get("recipe")
            
            conn = sqlite3.connect('juskuy.db')
            c = conn.cursor()
            # Manual POS orders skip the 'pending_payment' status because payment is handled physically at the counter
            c.execute("INSERT INTO orders (user_id, recipe, status) VALUES (?, ?, ?)", 
                      ('walk-in', json.dumps(selected_recipe), "preparing"))
            order_id = c.lastrowid
            conn.commit()
            conn.close()
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "order_id": order_id}).encode())
            
        elif parsed_path.path == '/api/pay':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            order_id_to_pay = data.get("order_id")
            
            conn = sqlite3.connect('juskuy.db')
            c = conn.cursor()
            c.execute("UPDATE orders SET status = 'paid' WHERE id = ?", (order_id_to_pay,))
            conn.commit()
            conn.close()
                    
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode())
            
        elif parsed_path.path == '/api/complete':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            order_id_to_complete = data.get("order_id")
            
            conn = sqlite3.connect('juskuy.db')
            c = conn.cursor()
            c.execute("UPDATE orders SET status = 'ready' WHERE id = ?", (order_id_to_complete,))
            conn.commit()
            conn.close()
                    
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode())
            
        else:
            self.send_response(404)
            self.end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving Juskuy at http://localhost:{PORT}")
    httpd.serve_forever()
