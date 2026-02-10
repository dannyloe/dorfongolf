# Golf Betting - Golf Scorecard Application

## Overview
Golf Betting is a modern web application designed to enhance the golf experience. It allows users to track real-time golf matches with friends, visualize statistics, and maintain a comprehensive game history. The application aims to provide a centralized platform for golf enthusiasts to manage their games, scores, and interactions, including advanced features like Ryder Cup event management, manual bet entry, and AI-powered scorecard scanning. The project's ambition is to become the go-to digital scorecard and betting management tool for amateur golf leagues and friendly matches.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **Styling**: Tailwind CSS with custom theming, shadcn/ui component library
- **Animations**: Framer Motion
- **Forms**: React Hook Form with Zod validation
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript
- **API Design**: RESTful endpoints with Zod schemas for validation
- **Authentication**: Replit Auth using OpenID Connect
- **Session Management**: Express sessions stored in PostgreSQL

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod
- **Schema**: Defined in `shared/schema.ts`
- **Migrations**: Drizzle Kit

### Core Features & Design Patterns
- **Player Name Architecture**: Centralized `presetPlayers` table for authoritative player names, with `presetPlayerId` foreign keys used across all related tables for consistency and rename cascading.
- **Player Replacement**: Functionality to replace players in Ryder Cup events, transferring all associated data using `presetPlayerId` for integrity.
- **Manual Bet Entry**: Allows users to record bets outside of tracked matches, with server-side validation ensuring amounts sum to zero.
- **Event Match Results Storage**: Pre-calculated bet results are stored in `eventMatchResults` table for consistency and efficiency, with API endpoints for retrieval and storage.
- **Match-Specific Course Handicap Overrides**: Users can override calculated course handicaps for individual players within a match, affecting only that match.
- **Multi-Tenancy Group System**: Full group membership system where users create/join groups via invite codes with admin approval. Groups organize events, players, and members. Tables: `groups`, `groupMemberships`, `groupJoinRequests`, `groupPlayers`. 18 API endpoints under `/api/groups/*` handle CRUD, membership management, join requests, and player associations. Role-based authorization (admin vs member) for sensitive operations. Dashboard and Ryder Cup list feature toggleable group filter badges for multi-group event filtering with events organized by group section. Groups management page at `/groups` with create/join workflows and admin panel (members, players, requests tabs). Admins can add members by selecting existing players or creating new ones with optional SMS invitations via Twilio. Admins can share group invite codes via native device sharing (Web Share API with clipboard fallback). Players are in the group immediately regardless of whether they sign up for the app.
- **Event Groups**: Matches and Ryder Cup events can be associated with groups via `groupId` foreign key, with inline editing capabilities.
- **Match Roles and Permissions**: A three-tier permission system (Creator, Organizer, Viewer, Player) with backend enforcement, allowing granular control over match data.
- **Ledger Filtering**: Comprehensive filtering options for date range, event, group, and course to analyze financial and game data.
- **Scorecard Scanning**: AI-powered feature to scan physical scorecards using Gemini Vision AI, extract scores, and allow user review before saving.
- **Ryder Cup Match Auto-Results**: Automatic calculation and recording of match results, including clinch detection and margin formatting, when scores are entered sequentially.
- **Start on Back 9 Mode**: Support for golf rounds starting on the back 9 (holes 10-18 then 1-9) with intelligent hole mapping and transformation utilities to ensure all calculations and displays are correct across bet types.

### Project Structure
- `client/`: React frontend.
- `server/`: Express backend, including Replit Auth integration.
- `shared/`: Shared code like Drizzle schema and API route definitions.

### Build System
- **Development**: Vite dev server with Express proxy.
- **Production**: esbuild for server, Vite for client.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.

### Authentication
- **Replit Auth**: OpenID Connect provider.

### AI Integration
- **Gemini AI**: For AI-powered scorecard scanning.

### SMS Integration
- **Twilio**: For phone verification, match notifications, and in-app messaging.