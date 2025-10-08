# CSV to JSON & PostgreSQL Automation

A lightweight Node.js + Express application that automatically parses CSV files, converts them into structured JSON objects, and uploads the data into a PostgreSQL database — all with minimal setup.

---

## 🚀 Features

* 🧠 **Custom CSV Parser** — written from scratch, supports:

  * quoted fields (e.g. `"A, B"`),
  * escaped quotes (`""` inside text),
  * nested keys (e.g. `address.city` → `{ address: { city: "..." } }`).
* ⚙️ **Database Integration** — creates a PostgreSQL database and table automatically (if missing).
* 📊 **Age Group Analytics** — calculates and prints user age distribution directly in the console.
* 🔍 **Robust Error Handling** — skips invalid or incomplete rows and logs detailed reasons.
* 📦 **Clean REST API Endpoints** for importing, listing, and generating reports.

---

## 🛠️ Tech Stack

| Layer    | Technology                                     |
| -------- | ---------------------------------------------- |
| Backend  | Node.js (Express)                              |
| Database | PostgreSQL                                     |
| Language | JavaScript (ES6 Modules)                       |
| Others   | dotenv, pg (Postgres driver), custom CSV logic |

---

## 📂 Endpoints Overview

| Endpoint  | Method | Description                                    |
| --------- | ------ | ---------------------------------------------- |
| `/`       | GET    | Root — confirms API is running                 |
| `/upload` | GET    | Reads and uploads the CSV file into PostgreSQL |
| `/users`  | GET    | Returns a JSON list of users (max 100 rows)    |
| `/report` | GET    | Prints age distribution report to console      |
| `/health` | GET    | Health check endpoint                          |

---

## ⚙️ Setup & Run Locally

### 1️⃣ Clone this repository

```bash
git clone https://github.com/<your-username>/csv-to-json-api.git
cd csv-to-json-api
```

### 2️⃣ Install dependencies

```bash
npm init -y
npm install express pg dotenv
```

### 3️⃣ Configure environment

Copy `.env.example` → `.env` and update credentials.

```bash
cp .env.example .env
```

Example:

```env
PG_HOST=localhost
PG_USER=postgres
PG_PASSWORD=yourpassword
PG_PORT=5432
PG_DATABASE=namedb
CSV_FILE_PATH=./data/users.csv
PORT=portnumber
```

### 4️⃣ Run the app

```bash
node app.js
```

---

## 🧠 Example Console Output

After uploading the sample CSV:

```
═══════════════════════════════════════════
          📊 AGE-GROUP % DISTRIBUTION       
═══════════════════════════════════════════
  AGE GROUP       |    PERCENTAGE (%)       
───────────────────────────────────────────
  < 20            |     20%
  20 to 40        |     45%
  40 to 60        |     25%
  > 60            |     10%
═══════════════════════════════════════════
```

---

## 🧩 Example CSV Format

```
name.firstName,name.lastName,age,address.line1,address.city,address.state,gender
Rohit,Prasad,35,"A-563, Rakshak Society",Pune,Maharashtra,male
Ananya,Deshmukh,28,Flat 204,Thane,Maharashtra,female
```

🧾 **Nested keys** like `address.city` automatically become:

```json
"address": {
  "line1": "A-563, Rakshak Society",
  "city": "Pune",
  "state": "Maharashtra"
}
```

---

## 🧰 Developer Notes

* The app **auto-creates the database** and the `users` table if they don’t exist.
* It validates and skips incomplete rows (e.g. missing name or invalid age).
* The CSV parser and DB logic are written **from scratch** for learning and clarity.
* For large CSVs, you can easily upgrade this to a streaming parser with batch inserts.

---

## 🧑‍💻 Example Use Cases

* Automating CSV data imports for analytics dashboards.
* Quick proof-of-concept API for CSV-based datasets.
* Local ETL (Extract-Transform-Load) tasks for structured data.

---

## 💡 Future Enhancements

* Add CSV upload via web form.
* Integrate visualization for the age distribution.

---

## 🪶 Author

**Bhakthi Shetty**
B.Tech in Information Technology | Passionate about backend development, AI/ML, and data-driven applications.

---

Would you like me to add a **short `LICENSE` file (MIT)** too, so it looks complete on GitHub?
I can make it clean with your name in it.
