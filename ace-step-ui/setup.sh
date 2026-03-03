#!/bin/bash
# ACE-Step UI Setup Script

set -e

echo "=================================="
echo "  ACE-Step UI Setup"
echo "=================================="

# Check if ACE-Step exists
ACESTEP_PATH="${ACESTEP_PATH:-../ACE-Step-1.5}"

if [ ! -d "$ACESTEP_PATH" ]; then
    echo "Error: ACE-Step not found at $ACESTEP_PATH"
    echo ""
    echo "Please clone ACE-Step first:"
    echo "  cd .."
    echo "  git clone https://github.com/ace-step/ACE-Step-1.5"
    echo "  cd ACE-Step-1.5"
    echo "  uv venv && uv pip install -e ."
    echo "  cd ../ace-step-ui"
    echo "  ./setup.sh"
    exit 1
fi

if [ ! -d "$ACESTEP_PATH/.venv" ]; then
    echo "Error: ACE-Step venv not found. Please set up ACE-Step first:"
    echo "  cd $ACESTEP_PATH"
    echo "  uv venv && uv pip install -e ."
    exit 1
fi

echo "Found ACE-Step at: $ACESTEP_PATH"

# Get absolute path
ACESTEP_PATH=$(cd "$ACESTEP_PATH" && pwd)

# Create .env file
echo "Creating .env file..."
cat > .env << EOF
# ACE-Step UI Configuration

# Path to ACE-Step installation
ACESTEP_PATH=$ACESTEP_PATH

# Server ports
PORT=3001
FRONTEND_PORT=3000

# Database
DATABASE_PATH=./server/data/acestep.db
EOF

# Install frontend dependencies
echo ""
echo "Installing frontend dependencies..."
npm install

# Install server dependencies
echo ""
echo "Installing server dependencies..."
cd server
npm install
cd ..

# Initialize database
echo ""
echo "Initializing database..."
cd server
npm run migrate 2>/dev/null || echo "Migration script not found, skipping..."
cd ..

echo ""
echo "=================================="
echo "  Setup Complete!"
echo "=================================="
echo ""
echo "To start the application:"
echo ""
echo "  # Terminal 1 - Start backend"
echo "  cd server && npm run dev"
echo ""
echo "  # Terminal 2 - Start frontend"
echo "  npm run dev"
echo ""
echo "Then open http://localhost:3000"
echo ""
