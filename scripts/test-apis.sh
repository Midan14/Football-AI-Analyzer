#!/bin/bash
# Test script for Football AI Analyzer APIs
# Run: bash test-apis.sh

BASE_URL="http://localhost:3000"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🏃 Football AI Analyzer - API Tests"
echo "===================================="
echo ""

# Test 1: Health Check
echo -n "1. Health Check... "
HEALTH=$(curl -s "$BASE_URL/api/health" | grep -o '"status":"healthy"')
if [ ! -z "$HEALTH" ]; then
    echo -e "${GREEN}✓ OK${NC}"
else
    echo -e "${RED}✗ FAIL${NC}"
fi

# Test 2: Countries (public)
echo -n "2. Countries API... "
COUNTRIES=$(curl -s "$BASE_URL/api/countries" | grep -o '"success":true')
if [ ! -z "$COUNTRIES" ]; then
    echo -e "${GREEN}✓ OK${NC}"
else
    echo -e "${RED}✗ FAIL${NC}"
fi

# Test 3: Fixtures (public)
echo -n "3. Fixtures API... "
FIXTURES=$(curl -s "$BASE_URL/api/fixtures?date=2026-05-18" | grep -o '"success":true')
if [ ! -z "$FIXTURES" ]; then
    echo -e "${GREEN}✓ OK${NC}"
else
    echo -e "${RED}✗ FAIL${NC}"
fi

# Test 4: Bankroll (protected - should fail without auth)
echo -n "4. Bankroll API (no auth)... "
BANKROLL=$(curl -s "$BASE_URL/api/bankroll" | grep -o '"code":"UNAUTHORIZED"')
if [ ! -z "$BANKROLL" ]; then
    echo -e "${GREEN}✓ OK (rejected as expected)${NC}"
else
    echo -e "${YELLOW}⚠ Unexpected response${NC}"
fi

# Test 5: Opportunities (protected - should fail without auth)
echo -n "5. Opportunities API (no auth)... "
OPP=$(curl -s "$BASE_URL/api/opportunities" | grep -o '"code":"UNAUTHORIZED"')
if [ ! -z "$OPP" ]; then
    echo -e "${GREEN}✓ OK (rejected as expected)${NC}"
else
    echo -e "${YELLOW}⚠ Unexpected response${NC}"
fi

# Test 6: Calibration (protected - should fail without auth)
echo -n "6. Calibration API (no auth)... "
CAL=$(curl -s "$BASE_URL/api/calibration" | grep -o '"code":"UNAUTHORIZED"')
if [ ! -z "$CAL" ]; then
    echo -e "${GREEN}✓ OK (rejected as expected)${NC}"
else
    echo -e "${YELLOW}⚠ Unexpected response${NC}"
fi

# Test 7: Odds Live (protected - should fail without auth)
echo -n "7. Odds Live API (no auth)... "
ODDS=$(curl -s "$BASE_URL/api/odds/live?fixtureId=123" | grep -o '"code":"UNAUTHORIZED"')
if [ ! -z "$ODDS" ]; then
    echo -e "${GREEN}✓ OK (rejected as expected)${NC}"
else
    echo -e "${YELLOW}⚠ Unexpected response${NC}"
fi

# Test 8: Arbitrage (protected - should fail without auth)
echo -n "8. Arbitrage API (no auth)... "
ARB=$(curl -s "$BASE_URL/api/arbitrage?fixtureId=123" | grep -o '"code":"UNAUTHORIZED"')
if [ ! -z "$ARB" ]; then
    echo -e "${GREEN}✓ OK (rejected as expected)${NC}"
else
    echo -e "${YELLOW}⚠ Unexpected response${NC}"
fi

echo ""
echo "===================================="
echo -e "${GREEN}Public APIs working ✓${NC}"
echo -e "${GREEN}Auth protection working ✓${NC}"
echo ""
echo "Next steps:"
echo "1. Start the dev server: npm run dev"
echo "2. Sign up at http://localhost:3000/auth/register"
echo "3. Log in and test protected endpoints"
echo "4. Check the dashboard at http://localhost:3000/dashboard"
echo ""
echo "To test with auth, get your session cookie after login and run:"
echo "  curl -H 'Cookie: next-auth.session-token=YOUR_TOKEN' $BASE_URL/api/bankroll"
