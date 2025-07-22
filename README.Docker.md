# Docker Deployment Guide

This guide covers how to deploy the Fuel Sensor Monitoring Portal using Docker containers.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- At least 2GB RAM
- 5GB disk space

## Quick Start

### Production Deployment

1. **Start all services:**
   ```bash
   docker-compose up -d
   ```

2. **Check service status:**
   ```bash
   docker-compose ps
   ```

3. **Access the application:**
   - Frontend: http://localhost
   - API: http://localhost:5000
   - Database: localhost:5432

4. **Default login credentials:**
   - Username: `admin`
   - Password: `secret`

### Development Setup

For development with hot reload:

```bash
docker-compose -f docker-compose.dev.yml up -d
```

## Services Overview

### Frontend Service
- **Port:** 80
- **Technology:** React + Vite + Nginx
- **Features:** Static file serving, API proxying, client-side routing

### API Service
- **Port:** 5000
- **Technology:** Node.js + Express + TypeScript
- **Features:** JWT authentication, PostgreSQL integration, automated scheduling

### Database Service
- **Port:** 5432
- **Technology:** PostgreSQL 15
- **Features:** Persistent data storage, health checks, automatic initialization

## Configuration

### Environment Variables

Create a `.env` file for production customization:

```env
# Database Configuration
POSTGRES_DB=fuel_monitoring
POSTGRES_USER=fuelmonitor
POSTGRES_PASSWORD=your_secure_password_here

# API Configuration
JWT_SECRET=your_super_secret_jwt_key_here
NODE_ENV=production

# External Database (Optional)
# DATABASE_URL=postgresql://user:password@external-host:5432/database
```

### Volume Persistence

Data is persisted using Docker volumes:
- `postgres_data`: Database files
- Automatic backups can be configured

## Management Commands

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f frontend
docker-compose logs -f database
```

### Database Operations
```bash
# Connect to database
docker-compose exec database psql -U fuelmonitor -d fuel_monitoring

# Backup database
docker-compose exec database pg_dump -U fuelmonitor fuel_monitoring > backup.sql

# Restore database
docker-compose exec -T database psql -U fuelmonitor fuel_monitoring < backup.sql
```

### Application Updates
```bash
# Rebuild and restart services
docker-compose build --no-cache
docker-compose up -d

# Update specific service
docker-compose build api
docker-compose up -d api
```

### Scaling (Optional)
```bash
# Scale API service
docker-compose up -d --scale api=3

# Load balancer configuration required for multiple API instances
```

## Production Considerations

### Security
- Change default passwords in production
- Use strong JWT secrets
- Configure firewall rules
- Enable SSL/TLS certificates
- Regular security updates

### Monitoring
- Set up health checks
- Configure log aggregation
- Monitor resource usage
- Database performance monitoring

### Backup Strategy
- Automated database backups
- Volume snapshots
- Configuration backup
- Disaster recovery plan

## Troubleshooting

### Common Issues

1. **Port conflicts:**
   ```bash
   # Check what's using the port
   sudo lsof -i :80
   sudo lsof -i :5000
   ```

2. **Database connection issues:**
   ```bash
   # Check database health
   docker-compose exec database pg_isready -U fuelmonitor
   ```

3. **Permission issues:**
   ```bash
   # Fix volume permissions
   sudo chown -R $USER:$USER ./volumes
   ```

4. **Memory issues:**
   ```bash
   # Check resource usage
   docker stats
   ```

### Debug Mode

Enable debug mode for troubleshooting:
```bash
# Set debug environment
export DEBUG=*
docker-compose up
```

## External Database Integration

To use an external PostgreSQL database instead of the containerized one:

1. Update `docker-compose.yml`:
   ```yaml
   services:
     api:
       environment:
         DATABASE_URL: postgresql://user:password@external-host:5432/database
   ```

2. Remove the database service from the compose file

3. Ensure network connectivity to external database

## Performance Optimization

### Production Optimizations
- Use multi-stage builds for smaller images
- Configure nginx caching
- Database connection pooling
- Resource limits and reservations

### Example resource limits:
```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## Support

For issues with Docker deployment:
1. Check application logs
2. Verify environment variables
3. Test database connectivity
4. Confirm port availability
5. Check Docker and system resources