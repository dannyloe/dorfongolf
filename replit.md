# Dorf on Golf - Golf Scorecard Application

## Overview

Dorf on Golf is a modern golf scorecard web application that allows users to track real-time matches with friends, visualize stats, and maintain game history. The application features user authentication via Replit Auth, match creation and management, player tracking, and hole-by-hole score entry.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state caching and synchronization
- **Styling**: Tailwind CSS with custom CSS variables for theming (emerald green & sand palette)
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Animations**: Framer Motion for page transitions and UI animations
- **Forms**: React Hook Form with Zod validation via @hookform/resolvers
- **Build Tool**: Vite with React plugin

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (ESM modules)
- **API Design**: RESTful endpoints defined in `shared/routes.ts` with Zod schemas for type-safe request/response validation
- **Authentication**: Replit Auth integration using OpenID Connect (passport.js strategy)
- **Session Management**: Express sessions stored in PostgreSQL via connect-pg-simple

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema-to-validation integration
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Drizzle Kit for database migrations (`db:push` command)

### Core Data Models
- **Users**: Authentication users with profile information (managed by Replit Auth)
- **Matches**: Golf matches with name, course, creator, and completion status
- **Players**: Participants in matches (can be registered users or guests)
- **Scores**: Hole-by-hole stroke counts for each player
- **MatchPlayerHandicaps**: Per-match course handicap overrides for individual players

### Match-Specific Course Handicap Overrides
- In expanded match view for net matches, course handicaps are displayed for each player
- Creators can click on any player's course handicap to override it for that specific match
- Overrides are highlighted with a colored border to distinguish from calculated values
- Overrides only affect the specific match, not the player's default handicap settings
- Relative handicaps are recalculated based on overridden course handicaps

### Project Structure
```
client/           # React frontend application
  src/
    components/   # UI components including shadcn/ui
    hooks/        # Custom React hooks (auth, matches, etc.)
    pages/        # Page components (Landing, Dashboard, MatchDetail)
    lib/          # Utilities and query client configuration
server/           # Express backend
  replit_integrations/auth/  # Replit Auth implementation
shared/           # Shared code between client and server
  schema.ts       # Drizzle database schema
  routes.ts       # API route definitions with Zod schemas
  models/         # Shared TypeScript models
```

### Build System
- **Development**: Vite dev server with HMR, proxied through Express
- **Production**: esbuild bundles server code, Vite builds client to `dist/public`
- **Scripts**: `dev` for development, `build` for production, `db:push` for schema sync

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection via `DATABASE_URL` environment variable
- **connect-pg-simple**: Session storage in PostgreSQL

### Authentication
- **Replit Auth**: OpenID Connect authentication provider
- **Required Environment Variables**:
  - `DATABASE_URL`: PostgreSQL connection string
  - `SESSION_SECRET`: Secret for session encryption
  - `ISSUER_URL`: Replit OIDC issuer (defaults to https://replit.com/oidc)
  - `REPL_ID`: Replit environment identifier

### AI Integration
- **Gemini AI**: Used for AI-powered scorecard scanning via Replit AI Integrations
- **Environment Variables**:
  - `AI_INTEGRATIONS_GEMINI_API_KEY`: Auto-provisioned Gemini API key
  - `AI_INTEGRATIONS_GEMINI_BASE_URL`: Gemini API base URL

### Scorecard Scanning Feature
- **Camera Button**: Located in QuickScoreEntry page header (camera icon)
- **Workflow**: 
  1. User takes a photo or uploads a scorecard image (JPEG, PNG, HEIC, WebP supported)
  2. Gemini Vision AI analyzes the image and extracts scores for each player
  3. Review modal displays extracted scores with confidence indicators (high/medium/low)
  4. User can edit any scores before confirming
  5. Confirmed scores are saved via the existing score submission system
- **Confidence Indicators**:
  - Green checkmark: High confidence
  - Yellow warning: Medium confidence
  - Red warning: Low confidence

### Key NPM Packages
- **UI**: @radix-ui/* primitives, lucide-react icons, class-variance-authority
- **Data**: drizzle-orm, @tanstack/react-query, zod
- **Forms**: react-hook-form, @hookform/resolvers
- **Animation**: framer-motion
- **AI**: @google/genai for Gemini integration
- **Utilities**: date-fns, clsx, tailwind-merge