# Fuel Sensor Monitoring Portal - Deployment Guide

## Docker Deployment Options

### 🚀 Quick Production Deployment

**Prerequisites:**
- Docker Engine 20.10+
- Docker Compose 2.0+
- 2GB RAM minimum
- 5GB disk space

**Quick Start:**
```bash
# Make scripts executable
chmod +x scripts/docker-start.sh

# Run production deployment
./scripts/docker-start.sh
```

**Access your application:**
- **Frontend**: http://localhost (main interface)
- **API**: http://localhost:5000 (backend services)
- **Login**: Username `admin`, Password `secret`

### 🛠️ Development Deployment

For development with hot reload and debugging:
```bash
# Make scripts executable
chmod +x scripts/docker-dev.sh

# Run development deployment  
./scripts/docker-dev.sh
```

### 📋 Manual Docker Commands

**Production:**
```bash
# Build and start all services
docker-compose build
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Development:**
```bash
# Build and start development services
docker-compose -f docker-compose.dev.yml build
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f
```

## Service Architecture

### Frontend Container
- **Technology**: React + Vite + Nginx
- **Port**: 80
- **Features**: 
  - Static file serving
  - API request proxying
  - Client-side routing support
  - Gzip compression

### API Container  
- **Technology**: Node.js + Express + TypeScript
- **Port**: 5000
- **Features**:
  - JWT authentication
  - Role-based access control
  - PostgreSQL integration
  - Automated daily data capture
  - Health check endpoint

### Database Container
- **Technology**: PostgreSQL 15
- **Port**: 5432  
- **Features**:
  - Persistent data storage
  - Automatic table initialization
  - Health monitoring
  - Sample data creation

## Configuration

### Environment Variables

Create a `.env` file for custom configuration:

```env
# Database Configuration
POSTGRES_DB=fuel_monitoring
POSTGRES_USER=fuelmonitor  
POSTGRES_PASSWORD=your_secure_password

# API Configuration
JWT_SECRET=your_jwt_secret_key
NODE_ENV=production

# External Database (Optional)
# DATABASE_URL=postgresql://user:pass@host:5432/db
```

### Volume Persistence

Data is automatically persisted using Docker volumes:
- `postgres_data`: Database files and configurations
- Survives container restarts and updates

## Monitoring & Management

### Health Checks
```bash
# Check all service status
docker-compose ps

# Test API health endpoint
curl http://localhost:5000/api/health

# Check database connection
docker-compose exec database pg_isready -U fuelmonitor
```

### Log Management
```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f api
docker-compose logs -f frontend  
docker-compose logs -f database

# View last 100 lines
docker-compose logs --tail=100 api
```

### Database Operations
```bash
# Connect to database
docker-compose exec database psql -U fuelmonitor -d fuel_monitoring

# Create backup
docker-compose exec database pg_dump -U fuelmonitor fuel_monitoring > backup.sql

# Restore backup
docker-compose exec -T database psql -U fuelmonitor fuel_monitoring < backup.sql
```

## Updates & Maintenance

### Application Updates
```bash
# Rebuild with latest code
docker-compose build --no-cache
docker-compose up -d

# Update specific service
docker-compose build api --no-cache
docker-compose up -d api
```

### Database Schema Updates
```bash
# Run database migrations
docker-compose exec api npm run db:push
```

## Troubleshooting

### Common Issues

**Port Conflicts:**
```bash
# Check what's using ports
sudo lsof -i :80
sudo lsof -i :5000
sudo lsof -i :5432

# Kill processes if needed
sudo kill -9 <PID>
```

**Database Connection Issues:**
```bash
# Check database health
docker-compose exec database pg_isready -U fuelmonitor

# View database logs
docker-compose logs database

# Restart database service
docker-compose restart database
```

**API Issues:**
```bash
# Check API health
curl -f http://localhost:5000/api/health

# View API logs
docker-compose logs api

# Restart API service
docker-compose restart api
```

**Frontend Issues:**
```bash
# Check nginx configuration
docker-compose exec frontend nginx -t

# View frontend logs
docker-compose logs frontend

# Restart frontend service
docker-compose restart frontend
```

### Resource Monitoring
```bash
# Check container resource usage
docker stats

# Check disk usage
docker system df

# Clean up unused resources
docker system prune
```

## Production Considerations

### Security
- Change default passwords before production deployment
- Use strong JWT secrets (32+ characters)
- Configure SSL/TLS certificates for HTTPS
- Set up firewall rules to limit access
- Regular security updates for base images

### Performance
- Configure resource limits in docker-compose.yml
- Set up log rotation
- Monitor database performance
- Configure backup strategies
- Use external load balancer for high availability

### External Database Integration

To use an external PostgreSQL database:

1. Update docker-compose.yml to remove database service
2. Set DATABASE_URL environment variable:
   ```env
   DATABASE_URL=postgresql://user:password@external-host:5432/database
   ```
3. Ensure network connectivity to external database
4. Configure proper security groups/firewall rules

## Support

If you encounter issues:
1. Check service logs: `docker-compose logs -f`
2. Verify environment variables are set correctly
3. Test database connectivity
4. Confirm all ports are available
5. Check system resources (RAM, disk space)

For additional help, refer to the main project documentation or check the application health endpoints.