# MoneyWise-Pro

A comprehensive financial management system built as a monorepo with a modern web interface and robust API.

## 🏗️ Project Structure

This is a monorepo managed with **pnpm workspaces** and **Turbo** for efficient build orchestration.

```
.
├── apps/
│   ├── web/          # Frontend application (Vite + React + TypeScript)
│   └── api/          # Backend API server
├── packages/
│   └── shared/       # Shared utilities and types
├── supabase/         # Supabase configuration and migrations
└── scripts/          # Build and deployment scripts
```

## 🚀 Tech Stack

### Frontend (Web App)
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router v7
- **State Management**: React hooks
- **Icons**: Lucide React
- **HTTP Client**: Axios

### Backend (API)
- **Database**: PostgreSQL (Supabase)
- **Authentication**: Supabase Auth
- **ORM/Client**: Supabase JS Client

### Development Tools
- **Package Manager**: pnpm 9.15.0
- **Monorepo Tool**: Turbo
- **Linting**: ESLint
- **Formatting**: Prettier
- **TypeScript**: v5.7.2

## 📦 Prerequisites

- **Node.js**: v18 or higher
- **pnpm**: v9.15.0 (Install with `npm install -g pnpm@9.15.0`)

## 🛠️ Setup Instructions

1. **Clone the repository**
   ```bash
   git clone https://github.com/twalumbu-prog/MoneyWise-Pro.git
   cd MoneyWise-Pro
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   
   For the web app (`apps/web/.env`):
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_API_URL=your_api_url
   ```
   
   For the API (`apps/api/.env`):
   ```env
   DATABASE_URL=your_database_url
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

4. **Run the development servers**
   ```bash
   # Run all apps in development mode
   pnpm dev
   
   # Or run specific apps
   pnpm --filter web dev
   pnpm --filter api dev
   ```

## 🏃‍♂️ Available Scripts

From the root directory:

- `pnpm dev` - Start all apps in development mode
- `pnpm build` - Build all apps for production
- `pnpm lint` - Run ESLint across all apps
- `pnpm format` - Format code with Prettier

## 🌐 Deployment

### Vercel Deployment (Web App)

The web application is deployed on Vercel:

1. Import the repository in Vercel
2. Configure the project:
   - **Root Directory**: `apps/web`
   - **Build Command**: `pnpm build`
   - **Output Directory**: `dist`
   - **Install Command**: `pnpm install`
3. Set environment variables in Vercel dashboard
4. Deploy!

### API Deployment

The API can be deployed to any Node.js hosting platform. Ensure proper environment variables are set.

## 📝 Development Workflow

1. Create a new branch for your feature: `git checkout -b feature/your-feature`
2. Make your changes
3. Run linting and formatting: `pnpm lint && pnpm format`
4. Commit your changes: `git commit -m "Description of changes"`
5. Push to GitHub: `git push origin feature/your-feature`
6. Create a Pull Request

## 🗄️ Database

This project uses Supabase (PostgreSQL) for data persistence. Database migrations are managed in the `supabase/` directory.

To apply migrations locally:
```bash
# Initialize Supabase locally (if not done)
npx supabase init

# Link to your Supabase project
npx supabase link --project-ref your-project-ref

# Push migrations
npx supabase db push
```

## 📄 License

This project is private and proprietary.

## 🤝 Contributing

This is a private project. For questions or contributions, please contact the project maintainers.

---

Built with ❤️ using modern web technologies
