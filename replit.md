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
- **Authentication**: Local username + password auth (bcryptjs). Sessions stored in PostgreSQL via connect-pg-simple.
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
- **Multi-Tenancy Group System**: Full group membership system where users create/join groups via invite codes with admin approval. Groups organize events, players, and members. Tables: `groups`, `groupMemberships`, `groupJoinRequests`, `groupPlayers`. 18 API endpoints under `/api/groups/*` handle CRUD, membership management, join requests, and player associations. Role-based authorization (admin vs member) for sensitive operations. Dashboard and Ryder Cup list feature toggleable group filter badges for multi-group event filtering with events organized by group section. Groups management page at `/groups` with create/join workflows and admin panel (members, players, requests tabs). Admins can add members by selecting existing players or creating new ones with optional SMS invitations via Plivo. Admins can share group invite codes via native device sharing (Web Share API with clipboard fallback). Players are in the group immediately regardless of whether they sign up for the app.
- **Multi-Day Event Types**: The `ryder_cup_events` table supports multiple event types via the `eventType` column: `ryder_cup` (team vs team), `buddy_trip` (multi-day golf trip), and `tournament` (individual/group competition). Event type constants defined in `shared/schema.ts` as `EVENT_TYPES`, `EVENT_TYPE_LABELS`, and `EventType`. Non-team event types skip team creation and team-specific UI elements (team scores header, Teams tab, schedule generation). Navigation uses generic "Events" label. Routes remain at `/ryder-cup/*` for backward compatibility.
- **Side Matches in Events**: Side matches linked to events via `ryderCupEventId` are displayed in a "Side Bets" tab within the event detail page, organized by day. These matches are filtered out of the main dashboard to avoid duplication.
- **Event Groups**: Matches and events can be associated with groups via `groupId` foreign key, with inline editing capabilities.
- **Match Roles and Permissions**: A three-tier permission system (Creator, Organizer, Viewer, Player) with backend enforcement, allowing granular control over match data.
- **Ledger Filtering**: Comprehensive filtering options for date range, event, group, and course to analyze financial and game data.
- **Scorecard Scanning**: AI-powered feature to scan physical scorecards using Gemini Vision AI, extract scores, and allow user review before saving.
- **Ryder Cup Match Auto-Results**: Automatic calculation and recording of match results, including clinch detection and margin formatting, when scores are entered sequentially.
- **Start on Back 9 Mode**: Support for golf rounds starting on the back 9 (holes 10-18 then 1-9) with intelligent hole mapping and transformation utilities to ensure all calculations and displays are correct across bet types.
- **Death Match Bet Type**: Two-player teams with dual simultaneous bets: Best Ball (stroke play cumulative) and Second Ball (match play hole-by-hole). Configurable base bet amount with auto-calculated tiered press structure (1st press = 1/2 base, subsequent = 1/4 base, rounded to nearest $5). Six stored bet columns: `deathMatchBaseBet`, `deathMatchBestBallBet`, `deathMatchSecondBallBet`, `deathMatchFirstPressBet`, `deathMatchSubsequentPressBet`, `deathMatchSecondBallPressBet` (all in cents). Scoring via `calculateDeathMatchResults()` in `matchplay.ts`. Integrated into ledger and combined settlements.

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
- **Plivo**: For phone verification, match notifications, and in-app messaging.
- **Inbound MMS Scorecard Flow**: Users text a photo of their scorecard to the Plivo number with a 4-character match code in the message body (e.g. "AB3K"). The server processes the image with Gemini AI and surfaces it as a pending scan in the match detail page for the organizer to review and apply.
  - Plivo webhook URL: `POST /api/sms/inbound` (must be set in the Plivo console as the message URL for the app's phone number)
  - Required env vars: `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, `PLIVO_PHONE_NUMBER`
  - Match codes are 4 chars from the alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no ambiguous chars like 0/O/1/I)
  - Set `VITE_PLIVO_PHONE_NUMBER` environment variable to display the number in the match detail UI (fallback if /api/config is unavailable)