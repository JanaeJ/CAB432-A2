# Environment Variables Setup Guide

This guide will help you set up environment variables for the CAB432 Assignment 1 project.

## Quick Setup

1. **Run the setup script:**
   ```bash
   npm run setup-env
   ```

2. **Or manually create .env file:**
   ```bash
   cp env.example .env
   ```

## Environment Variables

### Required Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port number |
| `JWT_SECRET` | `your-secret-key` | Secret key for JWT tokens |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `DEBUG` | `false` | Enable debug logging |
| `UPLOAD_PATH` | `uploads` | Directory for uploaded files |
| `PROCESSED_PATH` | `processed` | Directory for processed files |
| `BASE_URL` | `http://localhost:3000` | Base URL for API |
| `CORS_ORIGIN` | `http://localhost:3000` | CORS origin |

### Security Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_EXPIRES_IN` | `24h` | JWT token expiration time |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Maximum requests per window |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window (15 minutes) |

## Production Setup

For production deployment:

1. **Change JWT_SECRET:**
   ```bash
   # Generate a strong secret
   openssl rand -hex 32
   ```

2. **Set NODE_ENV:**
   ```bash
   NODE_ENV=production
   ```

3. **Update CORS settings:**
   ```bash
   CORS_ORIGIN=https://yourdomain.com
   ```

## Docker Environment

When using Docker, you can pass environment variables:

```bash
docker run -e PORT=8080 -e JWT_SECRET=your-secret media-processor-api
```

## Troubleshooting

- **Port already in use:** Change `PORT` in `.env`
- **JWT errors:** Ensure `JWT_SECRET` is set
- **File upload issues:** Check `UPLOAD_PATH` and `PROCESSED_PATH`

## File Structure

```
CAB_A1_Cursor/
├── .env                 # Your environment variables (create this)
├── env.example         # Example environment variables
├── scripts/
│   └── setup-env.js   # Environment setup script
└── app.js              # Main application file
```

## Next Steps

After setting up environment variables:

1. Start the application: `npm start`
2. Run in development mode: `npm run dev`
3. Test the API endpoints
4. Check the debug logs (if DEBUG=true)
