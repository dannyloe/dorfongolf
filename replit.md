# Golf Betting - Golf Scorecard Application

## Overview

Golf Betting is a modern golf scorecard web application that allows users to track real-time matches with friends, visualize stats, and maintain game history. The application features user authentication via Replit Auth, match creation and management, player tracking, and hole-by-hole score entry.

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

### Player Name Architecture
- **Single Source of Truth**: The `presetPlayers` table is the authoritative source for player names
- **ID References**: All tables store both the name AND a `presetPlayerId` foreign key:
  - `players.presetPlayerId` - Links regular match players to preset players
  - `ryderCupTeamMembers.presetPlayerId` - Links team members to preset players
  - `ryderCupSkins.winnerPresetPlayerId` - Links skin winners to preset players
  - `ryderCupClosestToHole.winnerPresetPlayerId` - Links CTH winners to preset players
  - `ryderCupTransactions.payerPresetPlayerId` - Links transaction payers to preset players
  - `ryderCupTransactionSplits.presetPlayerId` - Links expense splits to preset players
- **Rename Flow**: When `renamePresetPlayer()` is called:
  1. Updates the name in `presetPlayers` table
  2. Cascades updates via `presetPlayerId` to all linked records
  3. Also updates by name matching for legacy records without IDs
- **Auto-Population**: Storage methods (`addPlayer`, `recordRyderCupSkin`, `recordClosestToHoleWinner`) automatically look up and set the `presetPlayerId` when creating new records
- **Migration**: Run these in production to populate IDs for existing records:
  - `migrations/backfill_preset_player_ids.sql` - For players, team members, skins, CTH
  - `migrations/backfill_transaction_preset_player_ids.sql` - For transactions and expense splits

### Player Replacement in Ryder Cup Events
- **Feature**: Organizers can replace one golfer with another within an event, transferring all event data
- **API**: `POST /api/ryder-cup/:id/replace-player` with `{ oldPresetPlayerId, newPresetPlayerId }`
- **Uses presetPlayerId as primary key**: All lookups and updates use the preset player ID, with name-based fallbacks for legacy data
- **Validation**:
  - Cannot replace a player with themselves
  - Old player must be a member of a team in the event
  - New player must not already be a member of any team in the event
- **Tables Updated**:
  - `ryderCupTeamMembers` - Team membership transferred
  - `ryderCupPairingSides` - Tee time pairings updated (player1Name/player2Name)
  - `ryderCupSkins` - Skins wins transferred
  - `ryderCupClosestToHole` - CTH wins transferred
  - `ryderCupTransactions` - Expense payer records updated
  - `ryderCupTransactionSplits` - Expense allocations updated
  - `players` - Side match players updated
- **UI**: Replace button (refresh icon) in Teams tab for each player; opens dialog to select replacement from roster

### Manual Bet Entry
- **Feature**: Users can record bets that occurred outside of tracked matches (e.g., bets at other courses)
- **Tables**:
  - `manualBets` - Stores bet metadata (description, creator, timestamp)
  - `manualBetEntries` - Stores individual player amounts for each bet
- **API Endpoints**:
  - `GET /api/manual-bets` - List all manual bets with entries
  - `POST /api/manual-bets` - Create a new manual bet
  - `DELETE /api/manual-bets/:id` - Delete a manual bet
- **Validation (Server-side)**:
  - Amounts must sum to zero (what one loses, another gains)
  - Minimum 2 players required
  - No duplicate players in the same bet
- **Data Format**: Amounts stored in cents (like other transaction amounts)
- **Ledger Integration**: Manual bets are combined with match results in the ledger, using presetPlayerId for consistent player identification
- **UI Location**: "Add Bet" button in Ledger page filters; recorded bets shown in dedicated "Manual Bets" section

### Event Match Results Storage (Stored/Cached Results)
- **Purpose**: Store pre-calculated bet results in the database for consistency between views
- **Tables**:
  - `eventMatchResults` - Stores calculated player amounts per event match
- **Schema Fields**:
  - `eventMatchId` - Reference to the event match
  - `playerId` - Reference to the player
  - `playerName` - Display name for the player
  - `amount` - Amount in cents (positive = won, negative = lost)
  - `betType` - Type of bet (e.g., "Front 9", "Back 9", "Overall", "Skins", "Match Play")
  - `isComplete` - Whether the result is finalized
  - `isAutoPress` - Whether this is an auto-press bet result
  - `teamName` - Team name if applicable
  - `teamIndex` - Team index (0 or 1)
  - `updatedAt` - Timestamp of last update
- **API Endpoints**:
  - `GET /api/event-matches/:id/results` - Retrieve stored results for an event match
  - `POST /api/event-matches/:id/results` - Save calculated results (amounts in cents)
  - `DELETE /api/event-matches/:id/results` - Delete stored results
- **Validation**: Server validates that submitted player IDs belong to the event match
- **Client Utilities**: `calculateEventMatchResults()` and `calculateAllEventMatchResults()` in matchplay.ts for calculating results in storage format
- **Data Flow**: Client calculates results → POST to server → Server validates and stores → Future reads use stored results

### Match-Specific Course Handicap Overrides
- In expanded match view for net matches, course handicaps are displayed for each player
- Creators can click on any player's course handicap to override it for that specific match
- Overrides are highlighted with a colored border to distinguish from calculated values
- Overrides only affect the specific match, not the player's default handicap settings
- Relative handicaps are recalculated based on overridden course handicaps

### Event Groups
- **Groups Table**: Stored in `groups` table with name field
- **Match Association**: Matches have optional `groupId` foreign key to groups table
- **Group Management**: Groups can be selected or created when creating/editing events
- **Use Cases**: Organize events into leagues, tournament series, or custom categories (e.g., "Sunday League", "Tournament Series")
- **Inline Editing**: Groups can be edited inline in MatchDetail header alongside name/course/date

### Match Roles and Permissions
- **Three-Tier Permission System**:
  - **Creator**: Full control (delete match, add players, edit details, toggle handicapped, delete bets, manage roles)
  - **Organizer**: Can edit scores, bets, course handicap overrides, press bets, player handicaps/tees, toggle net scoring
  - **Viewer**: Read-only access to all match data
  - **Player**: Can edit their own scores only
- **Role Management**: Only creators can add/remove organizers and viewers via collapsible panel in MatchDetail
- **Self-Join**: Users can add themselves to matches without needing creator permission
- **Backend Enforcement**: All permissions enforced in server/routes.ts with proper checks

### Ledger Filtering
- **Date Range**: Quick filters (30 days, 90 days, This Year, All Time) plus custom date range picker
- **Event Filter**: Filter by specific event
- **Group Filter**: Filter by event group to see stats for a specific league/series
- **Course Filter**: Filter by course to see performance at specific courses
- **Clear Filters**: Button appears when any filter is active to reset all filters

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

### Ryder Cup Match Auto-Results
- **Auto-Calculation**: Match results are automatically calculated and recorded when scores are entered
- **Sequential Completion**: Holes must be completed in order (1, 2, 3...) for auto-calculation to trigger
- **Clinch Detection**: Match is decided when one team's lead exceeds the remaining holes
- **Margin Format**: 
  - Early finish: "X&Y" (e.g., "3&2" means 3 up with 2 to play)
  - Full 18 holes: "X up" (e.g., "2 up")
  - Ties: No margin recorded, points split
- **Team Points**: Automatically updated when result is recorded

### SMS Integration (Twilio)
- **Provider**: Twilio via Replit Connectors
- **Environment Variables**:
  - `TWILIO_ACCOUNT_SID`: Twilio account SID
  - `TWILIO_AUTH_TOKEN`: Twilio auth token
  - `TWILIO_PHONE_NUMBER`: Twilio phone number for sending SMS
- **Features**:
  - **Phone Verification**: Optional 6-digit SMS codes with 10-minute expiration (users can verify phone in Profile)
  - **Match Notifications**: SMS when added to matches (if enabled)
  - **Notification Preferences**: User-configurable settings for match invitations, score updates, bet results, match reminders
  - **In-App Messaging**: Match-scoped chat messages between players
- **Security**:
  - Rate limiting: 60 seconds between SMS sends, max 5 verification attempts per session
  - Authentication required for verification and messaging endpoints
  - Match participant checks for viewing/sending match messages
- **Schema Tables**: `verification_codes`, `notification_preferences`, `messages`
- **Service Module**: `server/twilio.ts`

### Key NPM Packages
- **UI**: @radix-ui/* primitives, lucide-react icons, class-variance-authority
- **Data**: drizzle-orm, @tanstack/react-query, zod
- **Forms**: react-hook-form, @hookform/resolvers
- **Animation**: framer-motion
- **AI**: @google/genai for Gemini integration
- **SMS**: twilio for Twilio SMS integration
- **Utilities**: date-fns, clsx, tailwind-merge