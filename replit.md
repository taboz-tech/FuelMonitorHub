# Fuel Sensor Monitoring Portal

## Overview

A comprehensive web-based portal for monitoring fuel sensor data across multiple sites, featuring role-based access control, configurable data views, and a modern full-stack architecture. The application provides real-time monitoring of fuel levels, generator states, and ZESA power status across distributed sensor installations.

## User Preferences

```
Preferred communication style: Simple, everyday language.
```

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite for build tooling
- **Styling**: Tailwind CSS with shadcn/ui component library for consistent design
- **State Management**: TanStack Query for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Authentication**: JWT-based authentication with bcrypt password hashing
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Scheduling**: Node-cron for automated daily data capture tasks

### Database Architecture
- **Primary Database**: PostgreSQL (external server at 41.191.232.15:5437)
- **Connection Method**: SSH tunnel for secure remote access
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Connection Pooling**: Node.js pg client for database connections

## Key Components

### Authentication System
- JWT token-based authentication with 24-hour expiration
- Role-based access control (admin, manager, supervisor)
- Middleware protection for API endpoints
- Automatic token refresh and session management

### User Management
- Multi-role user system with hierarchical permissions
- User-site assignment functionality for access control
- Active/inactive user status management
- Profile management with last login tracking

### Site Management
- Site configuration with device ID mapping
- Fuel capacity and threshold settings per site
- Location-based organization
- Active/inactive site status management

### Data Collection System
- Automated daily reading capture scheduled at 23:55
- Real-time sensor data integration from existing sensor_readings table
- Historical data storage in daily_closing_readings table
- Support for multiple sensor types (fuel level, temperature, generator state, ZESA state)

### Dashboard and Monitoring
- Real-time site status overview
- Fuel level monitoring with visual indicators
- Alert system for low fuel conditions
- Activity logging and recent events tracking
- Admin view mode switching for different data perspectives

## Data Flow

### Authentication Flow
1. User submits credentials via login form
2. Server validates credentials against users table
3. JWT token generated and returned to client
4. Client stores token in localStorage
5. Subsequent requests include Authorization header
6. Server middleware validates token on protected routes

### Data Monitoring Flow
1. External sensors write data to sensor_readings table
2. Scheduled task captures daily snapshots at 23:55
3. Dashboard queries both real-time and historical data
4. Client receives aggregated site data with current status
5. UI displays fuel levels, generator status, and alerts
6. Admin users can switch between different view modes

### User Access Control Flow
1. Authentication middleware validates user token
2. Role-based middleware checks user permissions
3. Site assignment checking for non-admin users
4. Data filtering based on user access rights
5. UI components conditionally render based on permissions

## External Dependencies

### Database Connection
- **SSH Tunnel**: Secure connection to remote PostgreSQL server
- **Credentials**: SSH and database authentication via environment variables
- **Connection Management**: Automatic reconnection and error handling

### UI Component Library
- **shadcn/ui**: Modern React components built on Radix UI primitives
- **Radix UI**: Accessible, unstyled UI components
- **Tailwind CSS**: Utility-first CSS framework for styling

### Development Tools
- **Replit Integration**: Development environment optimizations
- **Vite**: Fast build tool with HMR for development
- **TypeScript**: Type safety across the entire application
- **ESLint/Prettier**: Code quality and formatting tools

## Deployment Strategy

### Development Environment
- **Local Development**: Vite dev server on port 3000 (client) and Express on port 8000 (server)
- **Hot Module Replacement**: Automatic refresh during development
- **Environment Variables**: Local .env file for configuration

### Production Build
- **Client Build**: Vite builds React app to static files
- **Server Build**: ESBuild bundles Node.js server application
- **Asset Optimization**: CSS and JavaScript minification
- **Environment Configuration**: Production environment variables

### Database Management
- **Schema Migrations**: Drizzle Kit for database schema changes
- **Connection Pooling**: Optimized database connection management
- **Backup Strategy**: Regular backups of critical data tables
- **Monitoring**: Database performance and connection monitoring

### Security Considerations
- **SSH Tunnel**: Encrypted connection to remote database
- **JWT Secrets**: Secure token signing and validation
- **Password Hashing**: bcrypt for secure password storage
- **Input Validation**: Zod schemas for request validation
- **CORS Configuration**: Controlled cross-origin access