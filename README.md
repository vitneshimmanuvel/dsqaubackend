# D Square Backend Server

Backend API server for the D Square Construction CRM application.

## Tech Stack

- **Node.js** with Express
- **Prisma ORM** with PostgreSQL (Neon)
- **JWT Authentication**

## Endpoints

- `/api/auth` - Authentication (login, register, profile)
- `/api/projects` - Project management
- `/api/customers` - Customer management
- `/api/materials` - Material orders
- `/api/workforce` - Worker logs
- `/api/transactions` - Financial transactions
- `/api/payments` - Payment milestones
- `/api/vendors` - Vendor management
- `/api/notifications` - User notifications
- `/api/upload` - File uploads

## Environment Variables

Set these in your Vercel dashboard:

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT tokens

## Deploy to Vercel

1. Push to GitHub
2. Import project in Vercel
3. Set environment variables
4. Deploy!
