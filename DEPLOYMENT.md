# Deployment Guide for Agile Calendar Miro App

This guide explains how to deploy the Agile Calendar application as a Miro Web SDK app.

## Prerequisites

- A Miro account
- A hosting solution for static files (e.g., GitHub Pages, Vercel, Netlify, AWS S3)
- Node.js and npm installed locally for building

## Step 1: Build the Application

1. Build the application for production:
   ```bash
   npm run build
   ```

2. The built files will be in the `dist/` directory.

## Step 2: Host the Application

You need to host the built application on a publicly accessible HTTPS URL. Here are some options:

### Option A: GitHub Pages

1. In your repository settings, enable GitHub Pages
2. Set the source to the `gh-pages` branch or `/docs` folder
3. Deploy the `dist/` contents to your chosen location
4. Your app will be available at `https://YOUR_USERNAME.github.io/agile-calender/`

### Option B: Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel --prod`
3. Follow the prompts to deploy
4. Your app will be available at `https://your-project.vercel.app/`

### Option C: Netlify

1. Install Netlify CLI: `npm i -g netlify-cli`
2. Run: `netlify deploy --prod --dir=dist`
3. Your app will be available at `https://your-site.netlify.app/`

### Option D: Custom Server

Upload the contents of the `dist/` directory to your web server.

**Important**: The app must be served over HTTPS.

## Step 3: Create a Miro App

1. Go to [Miro Developer Portal](https://developers.miro.com/)
2. Click "Create new app"
3. Fill in the app details:
   - **App Name**: Agile Calendar
   - **Description**: Standup scheduler for agile teams
   - **App URL**: Your hosted URL from Step 2

## Step 4: Configure App Permissions

In your app settings, configure the following:

### SDK Scopes
Grant these permissions:
- `boards:read` - Read board content
- `boards:write` - Modify board content

### App URLs
- **Web-plugin**: `https://your-hosted-url/index.html`

### Redirect URI
- Add your hosted URL as an authorized redirect URI

## Step 5: Install the App

1. In the Miro Developer Portal, go to your app
2. Click "Install app and get OAuth token"
3. Select a team to install the app to
4. Authorize the app

## Step 6: Use the App

1. Open a Miro board
2. Click the three dots (more) menu on the left toolbar
3. Find "Agile Calendar" in your installed apps
4. Click it to open the panel

## Development Mode

For local development:

1. Run the dev server:
   ```bash
   npm run dev
   ```

2. The app will be available at `http://localhost:5173`

3. In your Miro app settings, you can temporarily use `http://localhost:5173` as the Web-plugin URL for testing

**Note**: Miro may not allow HTTP URLs in production, so you'll need to use HTTPS tunneling (like ngrok) for local testing:

```bash
# Install ngrok
npm i -g ngrok

# Start your dev server
npm run dev

# In another terminal, start ngrok
ngrok http 5173

# Use the HTTPS URL from ngrok in your Miro app settings
```

## Updating the App

When you make changes:

1. Build the new version: `npm run build`
2. Deploy the updated `dist/` directory to your hosting
3. Users will automatically get the latest version on next load

## Troubleshooting

### App doesn't appear in Miro
- Ensure the app is installed to your team
- Check that the Web-plugin URL is correct
- Verify HTTPS is working on your hosting

### Permission errors
- Check that all required SDK scopes are granted
- Reinstall the app to refresh permissions

### Loading issues
- Check browser console for errors
- Verify the Miro SDK script is loading correctly
- Ensure your hosted URL is accessible

### Data not persisting
- Verify the app has `boards:write` permission
- Check that metadata operations are completing successfully
- Look for errors in the browser console

## Security Considerations

- Always use HTTPS for hosting
- Don't commit sensitive data or API keys
- Review Miro's security best practices
- Regularly update dependencies for security patches

## Support

For issues related to:
- **This app**: Create an issue in this repository
- **Miro SDK**: Check [Miro Developer Documentation](https://developers.miro.com/docs)
- **Hosting**: Refer to your hosting provider's documentation

## Additional Resources

- [Miro Web SDK Documentation](https://developers.miro.com/docs/web-sdk-reference)
- [Miro Developer Community](https://community.miro.com/developer-platform-and-apis-57)
- [Miro App Examples](https://github.com/miroapp/app-examples)
