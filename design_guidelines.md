# Golf Betting App - Design Guidelines

## Design Approach
**Hybrid: Apple HIG Foundation + Sports App Inspiration**
- Clean, data-focused interface prioritizing readability and efficiency
- Card-based architecture for events and matches
- Table-driven scorecards with clear numerical hierarchy
- Subtle golf-themed accent patterns without being gimmicky

## Typography
**System Stack:**
- Primary: Inter (clean, excellent number rendering)
- Accent: SF Pro Display (headers, tournament names)

**Scale:**
- Tournament Headers: text-4xl font-bold
- Scores/Stats (primary): text-3xl font-semibold tabular-nums
- Player Names: text-lg font-medium
- Labels/Secondary: text-sm font-normal
- Table Data: text-base tabular-nums

## Layout System
**Spacing Primitives:** Use Tailwind units of 2, 4, 6, 8, 12, 16
- Card padding: p-6
- Section spacing: py-12 or py-16
- Element gaps: gap-4 or gap-6
- Container: max-w-7xl mx-auto

## Component Library

**Navigation**
- Top bar: Tournament name, team scores, settings icon
- Bottom tabs (mobile): Dashboard, Live, Teams, Bets, Stats
- Sidebar (desktop): Persistent navigation with icons

**Dashboard Cards**
- Active Events: Large cards with team logos, current scores, match status
- Quick Stats: 2x2 grid of key metrics (total bets, active matches, team standings)
- Recent Activity: Timeline-style feed

**Scorecard Interface**
- Sticky header: Hole numbers (1-18), Par, Handicap rows
- Player rows: Name, team indicator, editable score cells
- Side totals: Front 9, Back 9, Total columns
- Match status indicators: Who's up/down, skins won

**Team Cards**
- Split-screen design: Team A vs Team B
- Roster lists with handicaps
- Cumulative points display
- Individual match records

**Bet Tracking Panel**
- Expandable accordion for each bet type
- Real-time calculations with prominent total displays
- Payout distribution table

**Data Tables**
- Zebra striping for readability
- Sortable columns (chevron icons)
- Highlight winning team/player rows
- Mobile: Stack to cards with key stats

**Stat Displays**
- Radial progress for match win percentages
- Bar charts for score comparisons
- Leaderboard lists with rank badges

## Marketing Landing Page

**Hero Section (100vh)**
- Full-bleed golf course aerial image (lush fairway, sunset lighting)
- Centered overlay content with blurred-background container:
  - "Golf Betting" wordmark (text-6xl)
  - Tagline: "Ryder Cup Events Made Simple" (text-xl)
  - Primary CTA button with backdrop-blur-md
  - Social proof: "Trusted by 50+ golf groups"

**Features Section (py-20)**
- 2x2 grid (lg:grid-cols-2)
- Feature cards with golf icons:
  - Team Management & Handicaps
  - Live Scoring & Skins Tracking
  - Multi-Day Tournament Support
  - Automated Payout Calculations
- Each card: icon, title, 2-line description

**How It Works (py-20)**
- 3-column process flow (grid-cols-1 md:grid-cols-3)
- Numbered steps with connecting lines
- Screenshots/illustrations of app interface

**Social Proof (py-16)**
- 3-column testimonial grid
- Quote cards with golfer photos
- Group names and event details

**CTA Section (py-24)**
- Split layout: Form (left) + Visual (right)
- Newsletter/waitlist signup
- Golf imagery or app preview

**Footer (py-12)**
- 3-column layout: About, Features, Contact
- Social links
- Copyright and privacy links

## Images

**Hero Image:**
- Golf course aerial or sunset fairway shot
- High-quality, professional photography
- Warm, inviting tones
- Placement: Full-width background with gradient overlay

**Feature Section:**
- App interface screenshots showing scorecard in action
- Mobile mockups displaying team standings
- Placement: Right-aligned within feature cards

**Social Proof:**
- Authentic photos of golf groups/teams
- Placement: Small circular avatars in testimonial cards

**CTA Section:**
- App dashboard preview or phone mockup
- Placement: Right column of split layout

## Interactions
- Minimal animations: Score cell transitions on edit (200ms ease)
- Tab switching: Slide transitions
- Card hover: Subtle lift (translate-y-1)
- No distracting scorecard animations - focus on data clarity