# SplitPatel

A modern expense-sharing application built with React, TypeScript, and Vite. SplitPatel helps users easily track and split expenses with friends, family, or colleagues.

## Features

- Create and manage expense tabs for different groups or events
- Add expenses with multiple items and assign them to different people
- Real-time balance tracking showing who owes whom
- Integration with payment platforms (PayPal, Venmo, Cash App)
- Modern, responsive UI built with Chakra UI
- Type-safe development with TypeScript
- Form validation with Zod and React Hook Form

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **UI Framework**: Chakra UI
- **Form Handling**: React Hook Form + Zod
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: (Mock implementation, ready for integration with Auth0, Firebase, etc.)
- **Payment Processing**: (Mock implementation, ready for integration with PayPal, Venmo, etc.)

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/split-patel.git
   cd split-patel
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up the database:
   - Create a PostgreSQL database
   - Copy `.env.example` to `.env` and update the database URL
   - Run database migrations:
     ```bash
     npx prisma migrate dev
     ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## Project Structure

```
src/
├── components/     # Reusable UI components
├── features/       # Feature-specific components and logic
├── hooks/         # Custom React hooks
├── lib/           # Third-party library configurations
├── services/      # Service abstractions (auth, database, payments)
├── store/         # State management
├── types/         # TypeScript type definitions
└── utils/         # Utility functions
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
