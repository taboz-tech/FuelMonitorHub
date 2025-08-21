# Docker Deployment Guide for Fuel Sensor Monitoring Portal

## Overview
This guide explains how to deploy the Fuel Sensor Monitoring Portal using Docker with your Docker version 28.2.1 setup.

## Prerequisites
- Docker Engine 28.2.1 (Community Edition)
- Docker Compose
- Access to external PostgreSQL database at 41.191.232.15:5437

## Quick Start

### 1. Deploy with Docker Compose
```bash
# Build and start all services (Docker 28.2.1+ syntax)
docker compose up -d --build

# Check service status
docker compose ps

# View logs
docker compose logs -f
```

### 2. Alternative: Use Deployment Script
```bash
# Run the automated deployment script
./scripts/docker-deploy.sh
```

## Service Architecture

### Frontend Container
- **Port**: 80
- **Technology**: React + Vite + Nginx
- **Purpose**: Serves the web interface
- **Health Check**: HTTP GET to port 80

### API Container  
- **Port**: 5000
- **Technology**: Node.js + Express + TypeScript
- **Purpose**: Backend API with database connections
- **Health Check**: HTTP GET to `/api/health`

## Environment Configuration

The deployment uses the following environment variables (configured in docker-compose.yml):

```yaml
# SSH Tunnel for Database
SSH_HOST: 41.191.232.15
SSH_USERNAME: sa
SSH_PASSWORD: s3rv3r5mx$
REMOTE_BIND_HOST: 127.0.0.1
REMOTE_BIND_PORT: 5437

# Database Configuration
DB_NAME: sensorsdb
DB_USER: sa
DB_PASSWORD: s3rv3r5mxdb

# API Security
JWT_SECRET: your-super-secret-jwt-key-change-in-production
```

## Access Points

Once deployed, access the application at:

- **Web Interface**: http://localhost
- **API Endpoint**: http://localhost:5000
- **Health Check**: http://localhost:5000/api/health

## Default Login Credentials

- **Username**: admin
- **Password**: secret

## Docker Commands Reference

### Basic Operations
```bash
# Start services
docker compose up -d

# Stop services  
docker compose down

# Rebuild and restart
docker compose up -d --build

# View logs
docker compose logs api
docker compose logs frontend

# Check running containers
docker compose ps
```

### Troubleshooting Commands
```bash
# Check container health
docker-compose ps

# View all logs
docker-compose logs

# Restart specific service
docker-compose restart api

# Access container shell
docker-compose exec api sh
docker-compose exec frontend sh

# Check resource usage
docker stats
```

## Monitoring and Logs

### Application Logs
- API logs include database connections, authentication, and errors
- Frontend logs show Nginx access and error information

### Health Checks
- API: `curl http://localhost:5000/api/health`
- Frontend: `curl http://localhost`

### Database Connection
The API automatically creates SSH tunnel to external database and handles reconnections.

## Troubleshooting

### Common Issues

1. **Port Conflicts**
   ```bash
   # Check if ports 80 or 5000 are in use
   netstat -tulpn | grep :80
   netstat -tulpn | grep :5000
   ```

2. **Database Connection Issues**
   ```bash
   # Check API logs for SSH tunnel status
   docker-compose logs api | grep -i ssh
   docker-compose logs api | grep -i database
   ```

3. **Build Failures**
   ```bash
   # Clean build with no cache
   docker-compose build --no-cache
   ```

### Cleanup Commands
```bash
# Remove all containers and images
docker-compose down --rmi all --volumes --remove-orphans

# Prune unused Docker resources
docker system prune -a
```

## Security Considerations

- SSH credentials are embedded in docker-compose.yml for database access
- Change JWT_SECRET in production
- API runs as non-root user (nodejs:nodejs)
- Frontend served through Nginx with security headers

## Scaling and Production

For production deployment:
1. Use Docker Swarm or Kubernetes
2. Implement load balancing for multiple API instances
3. Set up proper SSL/TLS certificates
4. Use Docker secrets for sensitive data
5. Implement proper logging and monitoring

## Backup and Recovery

The application connects to external database, so backup procedures should focus on:
- Docker image registry for application code
- Environment configuration files
- External database backup procedures (handled separately)

## Support

For deployment issues:
1. Check container logs: `docker-compose logs`
2. Verify health endpoints
3. Ensure external database connectivity
4. Review environment variables in docker-compose.yml