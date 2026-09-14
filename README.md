# GlobalPay: Real-Time Payment & Settlement System

GlobalPay is a production-grade, modular financial system designed to process cross-border payments instantly while anchoring batched transactions to a blockchain for immutable proof and settlement cost optimization.

## 🚀 Key Features

* **Instant Transaction Ledger**: In-memory optimized ledger executes transfers with sub-second latency.
* **Batch Settlement**: Groups multiple transactions to drastically reduce blockchain settlement costs.
* **Settlement Proof Anchor**: Anchors transaction batch cryptographic hashes to a public blockchain layer (Solana Devnet) for immutable proof-of-existence and cost-optimized verification without executing complex on-chain smart contracts.
* **Streamlined KYC**: A 3-step simulated flow capturing essential compliance details with liveness checks.
* **Modern Frontend**: A fully responsive interface built with React and Vite featuring dynamic routing, clean CSS styles, and interactive settlement panels.
* **Modular Backend Architecture**: Clean Node.js (TypeScript) environment decoupling FX conversions, treasury, compliance, and ledger management.

## 🛠️ Technology Stack

* **Frontend**: React 18, Vite, CSS Modules
* **Backend**: Node.js, Express, TypeScript, `ts-node-dev`
* **Network Proofs**: Simulated Blockchain Settlement Engine
* **Testing**: Automated End-to-End (`bash`) test flows

## 🏁 Getting Started

### 1. Backend Setup

From the root project directory:
```bash
npm install
npm run dev
```
*(The backend will start locally on `http://localhost:3000`)*

### 2. Frontend Setup

In a separate terminal, navigate into the frontend directory:
```bash
cd frontend
npm install
npm run dev
```
*(The frontend application will launch locally via Vite on `http://localhost:5173`)*

## 🧪 Testing

- **Unit tests**: Fast unit tests run against local SQLite by default (`DB_DRIVER=sqlite`).
- **Money-path integration tests**: Integration tests that test row locking (`SELECT FOR UPDATE`), concurrency, or PostgreSQL-specific semantics require a real PostgreSQL instance (`DB_DRIVER=postgres`).
- To run tests:
  ```bash
  # Unit tests (SQLite default)
  npm test

  # Integration tests against PostgreSQL
  DB_DRIVER=postgres DATABASE_URL=postgres://user:password@localhost:5432/globalpay npm test
  ```

## 🗄️ Database Configuration

Set `DB_DRIVER` in your environment:
- `DB_DRIVER=postgres` (Default, **strictly required** in `production`). Connects using `DATABASE_URL`. If PostgreSQL is unreachable, the server fails loudly with no silent fallbacks.
- `DB_DRIVER=sqlite` (Lightweight local development / unit tests only). Never permitted when `NODE_ENV=production`.

## ⚖️ License
MIT

### Authentication

- `POST /api/signup` with `{ userId, password }` creates a user with a scrypt password hash and starts KYC in `PENDING`.
- `POST /api/login` requires the same credentials and returns a signed JWT with the configured expiry (default: 1 hour).
- Development demo users are seeded only when `NODE_ENV` `production` is not set. Their password is `SEED_USER_PASSWORD` (development fallback: `DemoPassword123!`).
- Settlement `run`, `history`, and `reconcile` endpoints require the database role `admin`.
