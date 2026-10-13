# Juskuy

Juskuy is a small AI smoothie-coach web app built for Indonesia. A customer answers a few health questions, and the server asks a Groq-hosted language model for a personalised smoothie recipe. The order then goes into a simple kitchen display (KDS) so staff can prepare and complete it.

- `server.py` is a plain Python HTTP server with SQLite storage (users, orders). Its API covers orders, history, analytics, recipe selection, manual orders, payment and completion.
- `public/` holds the customer front end (`index.html`, `app.js`, `style.css`) and the kitchen display (`kds.html`, `kds.js`, `kds.css`).
- `Dockerfile` runs it on Python 3.9 on port 8000.

To run it, put `GROQ_API_KEY` in a `.env` file and run `python server.py`. Never commit `.env`.

The code here was written by AI agents on behalf of H, an oceangoing master mariner, not a developer. H sets the goals and approves the results.
