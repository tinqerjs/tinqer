#!/bin/bash
set -e
cd "$(dirname "$0")"

if (( $# < 1 ))
then
  echo "Usage: $0 up|down|verbose|logs|follow [service_name] [-n lines]"
  echo ""
  echo "Commands:"
  echo "  up               Start services in detached mode"
  echo "  down             Stop and remove services"
  echo "  verbose          Start services with verbose output"
  echo "  logs [service] [-n lines]  Show logs for a service (default: last 50 lines)"
  echo "  follow [service] Follow logs for a service in real-time"
  echo ""
  echo "Services:"
  echo "  postgres         PostgreSQL database"
  echo ""
  echo "Examples:"
  echo "  $0 logs postgres        # Show last 50 lines of postgres logs"
  echo "  $0 logs postgres -n 100 # Show last 100 lines of postgres logs"
  echo "  $0 follow postgres      # Follow postgres logs in real-time"
  exit 1
fi

# create data dirs
if [ ! -d pgdata ]; then
  echo creating pgdata dir...
  mkdir pgdata;
fi

COMMAND=$1

case $COMMAND in
  verbose)
    docker compose --verbose up
    ;;
  up)
    docker compose up -d
    ;;
  down)
    docker compose down
    ;;
  logs)
    if [ -z "$2" ]; then
      echo "Error: service name is required for logs command."
      echo "Usage: $0 logs <service_name> [-n lines]"
      echo "Available services: postgres"
      exit 1
    fi
    SERVICE_NAME=$2
    LINE_COUNT=50  # default
    if [ "$3" == "-n" ] && [ -n "$4" ]; then
      LINE_COUNT=$4
    fi
    docker compose logs --tail=$LINE_COUNT "$SERVICE_NAME"
    ;;
  follow)
    if [ -z "$2" ]; then
      echo "Error: service name is required for follow command."
      echo "Usage: $0 follow <service_name>"
      echo "Available services: postgres"
      exit 1
    fi
    docker compose logs -f "$2"
    ;;
  *)
    echo "Invalid command: $COMMAND"
    echo "Usage: $0 up|down|verbose|logs|follow [service_name] [-n lines]"
    exit 1
    ;;
esac
