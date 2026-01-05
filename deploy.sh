#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== BBTalk Docker Deployment ===${NC}"

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    exit 1
fi

# Determine docker compose command
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

# Parse arguments
ACTION=${1:-up}

case $ACTION in
    build)
        echo -e "${YELLOW}Building images...${NC}"
        $COMPOSE_CMD build --no-cache
        echo -e "${GREEN}Build completed!${NC}"
        ;;
    up)
        echo -e "${YELLOW}Starting services...${NC}"
        $COMPOSE_CMD up -d --build
        echo -e "${GREEN}Services started!${NC}"
        echo -e "Frontend: http://localhost:8080/bbtalk/"
        echo -e "Backend API: http://localhost:8000/api/"
        ;;
    down)
        echo -e "${YELLOW}Stopping services...${NC}"
        $COMPOSE_CMD down
        echo -e "${GREEN}Services stopped!${NC}"
        ;;
    restart)
        echo -e "${YELLOW}Restarting services...${NC}"
        $COMPOSE_CMD down
        $COMPOSE_CMD up -d --build
        echo -e "${GREEN}Services restarted!${NC}"
        ;;
    logs)
        $COMPOSE_CMD logs -f
        ;;
    status)
        $COMPOSE_CMD ps
        ;;
    clean)
        echo -e "${YELLOW}Cleaning up...${NC}"
        $COMPOSE_CMD down -v --rmi local
        echo -e "${GREEN}Cleanup completed!${NC}"
        ;;
    *)
        echo "Usage: $0 {build|up|down|restart|logs|status|clean}"
        echo ""
        echo "Commands:"
        echo "  build   - Build Docker images"
        echo "  up      - Start services (default)"
        echo "  down    - Stop services"
        echo "  restart - Restart services"
        echo "  logs    - View logs"
        echo "  status  - Show service status"
        echo "  clean   - Remove containers, volumes, and images"
        exit 1
        ;;
esac
