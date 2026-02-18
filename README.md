# NovaPay 💳

A professional mock payment gateway for development and testing purposes.

## Features

- Frontend checkout UI
- Mock backend API
- Returns:
  - Amount
  - Last 4 digits
  - Confirmation Code
- Simulated processing delay

## Run Locally

### Backend

cd backend
npm install
npm start

Server runs at:
http://localhost:3000

### Frontend

Open:
frontend/index.html

## API Endpoint

POST /api/pay

Example Response:

{
  "status": "success",
  "amount": 120,
  "last4": "3456",
  "confirmationCode": "NP-A8X92KLM"
}
